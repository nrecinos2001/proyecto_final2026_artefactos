import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  parseLevelPayload,
  parseStatusPayload,
  parseTurbidityPayload,
} from '../common/payload';
import { distanceToLiters, turbidityVerdict } from '../common/water-math';
import { DevicesService } from '../devices/devices.service';
import {
  Device,
  LevelReading,
  LevelState,
  TurbidityReading,
} from '../entities';
import { EventsService } from '../events/events.service';
import { IncomingMessage, MqttService } from '../mqtt/mqtt.service';
import { AlertsService } from './alerts.service';
import { StatusService } from './status.service';

/** Puntos porcentuales extra para salir de un estado de alerta (evita parpadeo) */
const LEVEL_HYSTERESIS = 2;
/** Una referencia de turbidez se toma del promedio de las lecturas válidas recientes */
const REFERENCE_LOOKBACK_MS = 15 * 60_000;

const SIMULATION_RANGES = {
  nivel: {
    accepts: (value: number) => parseLevelPayload(String(value)) !== null,
    error: (value: number) =>
      `distancia debe estar entre 0 y 1000 cm, se recibió ${value}`,
  },
  turbidez: {
    accepts: (value: number) => parseTurbidityPayload(String(value)) !== null,
    error: (value: number) =>
      `voltaje de turbidez debe estar entre 0 y 5 V, se recibió ${value}`,
  },
};

/**
 * Procesa los mensajes del ESP8266: guarda lecturas, actualiza el estado de la
 * cisterna, genera alertas, publica el estado de LED/buzzer por MQTT y empuja
 * los cambios al navegador por SSE.
 */
@Injectable()
export class IngestionService implements OnModuleInit {
  private readonly logger = new Logger(IngestionService.name);
  /** Cola por dispositivo para procesar sus mensajes en orden */
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly autoRegister: boolean;

  constructor(
    @InjectRepository(LevelReading)
    private readonly levels: Repository<LevelReading>,
    @InjectRepository(TurbidityReading)
    private readonly turbidity: Repository<TurbidityReading>,
    private readonly devices: DevicesService,
    private readonly alerts: AlertsService,
    private readonly status: StatusService,
    private readonly events: EventsService,
    private readonly mqtt: MqttService,
    config: ConfigService,
  ) {
    this.autoRegister = config.get('MQTT_AUTO_REGISTER', 'true') !== 'false';
  }

  onModuleInit() {
    this.mqtt.onMessage((msg) =>
      this.enqueue(msg.deviceCode, () => this.handle(msg)),
    );
  }

  private enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(task);
    this.queues.set(key, next);
    const release = () => {
      if (this.queues.get(key) === next) this.queues.delete(key);
    };
    void next.then(release, release);
    return next;
  }

  private async handle(msg: IncomingMessage) {
    let device = await this.devices.findByCode(msg.deviceCode);
    if (!device) {
      if (!this.autoRegister) {
        this.logger.warn(
          `Mensaje de cisterna desconocida "${msg.deviceCode}" ignorado`,
        );
        return;
      }
      device = await this.devices.autoRegister(msg.deviceCode);
    }

    switch (msg.kind) {
      case 'nivel': {
        const data = parseLevelPayload(msg.payload);
        if (!data) return this.invalid(msg);
        await this.ingestLevel(device, data.distanceCm);
        break;
      }
      case 'turbidez': {
        const data = parseTurbidityPayload(msg.payload);
        if (!data) return this.invalid(msg);
        await this.ingestTurbidity(device, data.voltage, data.raw);
        break;
      }
      case 'estado': {
        const s = parseStatusPayload(msg.payload);
        if (s === 'online') await this.markSeen(device);
        if (s === 'offline') await this.raiseOffline(device);
        await this.emitStatus(device);
        break;
      }
    }
  }

  private invalid(msg: IncomingMessage) {
    this.logger.warn(
      `Payload inválido en ${msg.deviceCode}/${msg.kind}: ${msg.payload.slice(0, 100)}`,
    );
  }

  /** Lectura de nivel (distancia en cm). Pública para poder simularla por HTTP. */
  async ingestLevel(device: Device, distanceCm: number) {
    const now = new Date();
    const calibration = await this.devices.getCalibration(device.id);
    const liters = distanceToLiters(distanceCm, device, calibration);
    const percent = (liters / device.capacityLiters) * 100;

    const reading = await this.levels.save(
      this.levels.create({ deviceId: device.id, distanceCm, liters, percent }),
    );

    // Estabilidad del nivel (para validar la turbidez). Tolerancia: 1 % de la
    // capacidad o 0.5 cm de altura, lo que sea mayor (resolución del HC-SR04).
    const tolerance = Math.max(
      device.capacityLiters * 0.01,
      (device.areaCm2 * 0.5) / 1000,
    );
    const changes: Partial<Device> = { lastSeenAt: now };
    if (
      device.levelStableRefLiters === null ||
      Math.abs(liters - device.levelStableRefLiters) > tolerance
    ) {
      changes.levelStableSince = now;
      changes.levelStableRefLiters = liters;
    }

    const newState = this.levelState(device, percent);
    const stateChanged = newState !== device.levelState;
    if (stateChanged) changes.levelState = newState;
    await this.devices.patchState(device, changes);
    await this.alerts.resolve(device.id, ['DESCONECTADO']);

    if (stateChanged) await this.onLevelStateChange(device, newState, percent);

    this.events.emit({ type: 'level', deviceId: device.id, data: reading });
    await this.emitStatus(device);
    return reading;
  }

  private levelState(device: Device, percent: number): LevelState {
    const current = device.levelState;
    const critical = device.criticalPercent;
    const low = device.lowPercent;
    if (percent < critical) return 'critico';
    if (current === 'critico' && percent < critical + LEVEL_HYSTERESIS)
      return 'critico';
    if (percent < low) return 'bajo';
    if (current === 'bajo' && percent < low + LEVEL_HYSTERESIS) return 'bajo';
    return 'normal';
  }

  private async onLevelStateChange(
    device: Device,
    state: LevelState,
    percent: number,
  ) {
    const pct = percent.toFixed(1);
    if (state === 'critico') {
      await this.alerts.resolve(device.id, ['NIVEL_BAJO']);
      await this.alerts.raise(
        device.id,
        'NIVEL_CRITICO',
        'critical',
        `Nivel crítico en ${device.name}: ${pct} %. Apague la bomba para evitar que trabaje en seco.`,
      );
    } else if (state === 'bajo') {
      await this.alerts.resolve(device.id, ['NIVEL_CRITICO']);
      await this.alerts.raise(
        device.id,
        'NIVEL_BAJO',
        'warning',
        `Nivel bajo en ${device.name}: ${pct} %. Considere racionar el agua.`,
      );
    } else {
      await this.alerts.resolve(device.id, ['NIVEL_BAJO', 'NIVEL_CRITICO']);
    }
    this.publishLocalAlert(device, state, percent);
  }

  /** Mensaje retenido que el ESP8266 puede usar para el LED rojo/verde y el buzzer */
  private publishLocalAlert(
    device: Device,
    state: LevelState,
    percent: number,
  ) {
    this.mqtt.publish(device.code, 'alerta', {
      estado: state,
      led: state === 'normal' ? 'verde' : 'rojo',
      buzzer: state === 'critico',
      bomba: state !== 'critico',
      porcentaje: Math.round(percent * 10) / 10,
    });
  }

  /** Lectura de turbidez. Pública para poder simularla por HTTP. */
  async ingestTurbidity(device: Device, voltage: number, raw: number | null) {
    const now = new Date();
    const valid = this.status.isLevelStable(device, now);
    const changes: Partial<Device> = { lastSeenAt: now };

    if (valid && device.awaitingTurbidityReference) {
      changes.turbidityReferenceVoltage = voltage;
      changes.awaitingTurbidityReference = false;
    }
    await this.devices.patchState(device, changes);

    const ref = device.turbidityReferenceVoltage;
    const reading = await this.turbidity.save(
      this.turbidity.create({
        deviceId: device.id,
        voltage,
        raw,
        valid,
        ratio: ref ? voltage / ref : null,
      }),
    );

    if (valid && ref) await this.evaluateTurbidity(device);

    this.events.emit({ type: 'turbidity', deviceId: device.id, data: reading });
    await this.emitStatus(device);
    return reading;
  }

  /** Aviso si las últimas N lecturas válidas están por debajo del umbral */
  private async evaluateTurbidity(device: Device) {
    const reference = device.turbidityReferenceVoltage;
    if (!reference) return;
    const lastValid = await this.turbidity.find({
      where: {
        deviceId: device.id,
        valid: true,
        ...(device.lastCleanedAt
          ? { createdAt: MoreThanOrEqual(device.lastCleanedAt) }
          : {}),
      },
      order: { createdAt: 'DESC' },
      take: device.turbidityConsecutive,
    });
    const verdict = turbidityVerdict(
      lastValid.map((r) => r.voltage),
      reference,
      device.turbidityThresholdRatio,
      device.turbidityConsecutive,
    );

    if (verdict === 'turbia') {
      await this.alerts.raise(
        device.id,
        'TURBIDEZ',
        'warning',
        `Se recomienda limpiar la cisterna ${device.name}: el agua está más turbia que la referencia de agua limpia.`,
      );
    }
    if (verdict === 'limpia') {
      await this.alerts.resolve(device.id, ['TURBIDEZ']);
    }
  }

  /**
   * Botón "Cisterna limpia": guarda la fecha y toma como referencia el promedio
   * de las lecturas válidas recientes; si no hay, espera la próxima lectura válida.
   */
  markClean(device: Device) {
    return this.enqueue(device.code, async () =>
      this.doMarkClean(await this.devices.findOne(device.id)),
    );
  }

  private async doMarkClean(device: Device) {
    const recent = await this.turbidity.find({
      where: {
        deviceId: device.id,
        valid: true,
        createdAt: MoreThanOrEqual(
          new Date(Date.now() - REFERENCE_LOOKBACK_MS),
        ),
      },
      order: { createdAt: 'DESC' },
      take: 3,
    });
    const reference = recent.length
      ? recent.reduce((s, r) => s + r.voltage, 0) / recent.length
      : null;

    await this.devices.patchState(device, {
      lastCleanedAt: new Date(),
      turbidityReferenceVoltage: reference ?? device.turbidityReferenceVoltage,
      awaitingTurbidityReference: reference === null,
    });
    await this.alerts.resolve(device.id, ['TURBIDEZ', 'LIMPIEZA_PROGRAMADA']);
    return this.emitStatus(device);
  }

  async emitStatus(device: Device) {
    const status = await this.status.build(device);
    this.events.emit({ type: 'status', deviceId: device.id, data: status });
    return status;
  }

  private async markSeen(device: Device) {
    await this.devices.patchState(device, { lastSeenAt: new Date() });
    await this.alerts.resolve(device.id, ['DESCONECTADO']);
  }

  private raiseOffline(device: Device) {
    return this.alerts.raise(
      device.id,
      'DESCONECTADO',
      'warning',
      `${device.name} no está enviando datos. Revise la alimentación y el wifi del sensor.`,
    );
  }

  /** Cada minuto: dispositivos sin mensajes recientes */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkOffline() {
    for (const device of await this.devices.findAll()) {
      if (!device.lastSeenAt || this.status.isOnline(device)) continue;
      if (await this.alerts.isActive(device.id, 'DESCONECTADO')) continue;
      await this.raiseOffline(device);
      await this.emitStatus(device);
    }
  }

  /** Cada hora: recordatorio de limpieza por tiempo */
  @Cron(CronExpression.EVERY_HOUR)
  async checkCleaningDue() {
    for (const device of await this.devices.findAll()) {
      const status = await this.status.build(device);
      if (!status.cleaning.due) continue;
      if (await this.alerts.isActive(device.id, 'LIMPIEZA_PROGRAMADA'))
        continue;
      await this.alerts.raise(
        device.id,
        'LIMPIEZA_PROGRAMADA',
        'info',
        `Han pasado ${status.cleaning.daysSince} días desde la última limpieza de ${device.name}.`,
      );
      await this.emitStatus(device);
    }
  }

  /** Simulación por HTTP (sin hardware) pasando por la misma cola que MQTT */
  async simulate(device: Device, kind: 'nivel' | 'turbidez', value: number) {
    const range = SIMULATION_RANGES[kind];
    if (!range.accepts(value))
      throw new BadRequestException(range.error(value));
    return this.enqueue(device.code, async () => {
      const fresh = await this.devices.findOne(device.id);
      return kind === 'nivel'
        ? this.ingestLevel(fresh, value)
        : this.ingestTurbidity(fresh, value, null);
    });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Alert, AlertSeverity, AlertType } from '../entities';
import { EventsService } from '../events/events.service';
import { TelegramService } from '../notifications/telegram.service';

const ALERT_TITLES: Record<AlertType, string> = {
  NIVEL_BAJO: 'Nivel bajo',
  NIVEL_CRITICO: 'Nivel crítico',
  TURBIDEZ: 'Agua turbia',
  LIMPIEZA_PROGRAMADA: 'Limpieza programada',
  DESCONECTADO: 'Sensor desconectado',
};

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Alert) private readonly alerts: Repository<Alert>,
    private readonly events: EventsService,
    private readonly telegram: TelegramService,
  ) {}

  /** Crea la alerta si no hay otra activa del mismo tipo para esa cisterna */
  async raise(
    deviceId: string,
    type: AlertType,
    severity: AlertSeverity,
    message: string,
  ): Promise<Alert> {
    const existing = await this.alerts.findOne({
      where: { deviceId, type, active: true },
    });
    if (existing) return existing;
    const alert = await this.alerts.save(
      this.alerts.create({ deviceId, type, severity, message }),
    );
    this.events.emit({ type: 'alert', deviceId, data: alert });
    void this.telegram.send(`${ALERT_TITLES[type]}: ${message}`);
    return alert;
  }

  async resolve(deviceId: string, types: AlertType[]) {
    const active = await this.alerts.find({
      where: { deviceId, type: In(types), active: true },
    });
    for (const alert of active) {
      alert.active = false;
      alert.resolvedAt = new Date();
      await this.alerts.save(alert);
      this.events.emit({ type: 'alert', deviceId, data: alert });
    }
  }

  isActive(deviceId: string, type: AlertType) {
    return this.alerts.exists({ where: { deviceId, type, active: true } });
  }

  findActive(deviceId: string) {
    return this.alerts.find({
      where: { deviceId, active: true },
      order: { createdAt: 'DESC' },
    });
  }

  list(params: { deviceId?: string; active?: boolean; limit?: number }) {
    return this.alerts.find({
      where: {
        ...(params.deviceId ? { deviceId: params.deviceId } : {}),
        ...(params.active !== undefined ? { active: params.active } : {}),
      },
      order: { createdAt: 'DESC' },
      take: Math.min(params.limit ?? 50, 500),
    });
  }

  async acknowledge(id: number) {
    const alert = await this.alerts.findOne({ where: { id } });
    if (!alert) throw new NotFoundException('Alerta no encontrada');
    alert.acknowledged = true;
    await this.alerts.save(alert);
    this.events.emit({ type: 'alert', deviceId: alert.deviceId, data: alert });
    return alert;
  }
}

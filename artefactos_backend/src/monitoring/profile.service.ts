import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import {
  PROFILE_MIN_DAYS,
  consumptionFromSeries,
  emaUpdate,
  localDateKey,
} from '../common/water-math';
import { DevicesService } from '../devices/devices.service';
import { Device, HourlyProfile, LevelReading } from '../entities';

/** Ruido ignorado al sumar consumo: 0.5 % de la capacidad */
const NOISE_RATIO = 0.005;

/**
 * Paso 3: perfil de consumo por hora del día (C_h).
 * Cada madrugada se calcula el consumo de cada hora del día anterior y se
 * mezcla con el valor previo usando el promedio móvil exponencial.
 */
@Injectable()
export class ProfileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectRepository(HourlyProfile)
    private readonly profiles: Repository<HourlyProfile>,
    @InjectRepository(LevelReading)
    private readonly readings: Repository<LevelReading>,
    private readonly devices: DevicesService,
  ) {}

  /** Si el servidor estuvo apagado a medianoche, procesa el día anterior al iniciar */
  async onApplicationBootstrap() {
    try {
      await this.processYesterdayForAll();
    } catch (err) {
      this.logger.error(
        `No se pudo actualizar el perfil: ${(err as Error).message}`,
      );
    }
  }

  @Cron('0 5 0 * * *')
  async processYesterdayForAll() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const key = localDateKey(yesterday);
    for (const device of await this.devices.findAll()) {
      if (device.profileLastDate && device.profileLastDate >= key) continue;
      await this.processDay(device, key);
    }
  }

  /**
   * Procesa un día (YYYY-MM-DD, hora local). Las horas sin lecturas no se
   * actualizan para no arrastrar el promedio a cero cuando el equipo estuvo apagado.
   */
  async processDay(device: Device, dateKey: string) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    const rows = await this.readings.find({
      where: { deviceId: device.id, createdAt: Between(start, end) },
      order: { createdAt: 'ASC' },
      select: { liters: true, createdAt: true },
    });

    const byHour = new Map<number, number[]>();
    for (const r of rows) {
      const h = r.createdAt.getHours();
      if (!byHour.has(h)) byHour.set(h, []);
      byHour.get(h)!.push(r.liters);
    }

    const noise = device.capacityLiters * NOISE_RATIO;
    const existing = await this.profiles.find({
      where: { deviceId: device.id },
    });
    const updated: Record<number, number> = {};
    for (const [hour, values] of byHour) {
      const consumption = consumptionFromSeries(values, noise);
      let row = existing.find((p) => p.hour === hour);
      if (!row)
        row = this.profiles.create({ deviceId: device.id, hour, samples: 0 });
      row.avgLiters = emaUpdate(
        row.samples > 0 ? row.avgLiters : null,
        consumption,
      );
      row.samples += 1;
      await this.profiles.save(row);
      updated[hour] = consumption;
    }

    await this.devices.patchState(device, {
      profileDays: device.profileDays + (rows.length > 0 ? 1 : 0),
      profileLastDate: dateKey,
    });
    this.logger.log(
      `Perfil de ${device.code} actualizado con ${dateKey} (${rows.length} lecturas)`,
    );
    return { date: dateKey, readings: rows.length, consumptionByHour: updated };
  }

  /** C_h de las 24 horas (0 si no hay dato) */
  async getProfile(deviceId: string) {
    const rows = await this.profiles.find({ where: { deviceId } });
    return Array.from({ length: 24 }, (_, hour) => {
      const row = rows.find((r) => r.hour === hour);
      return {
        hour,
        avgLiters: row?.avgLiters ?? 0,
        samples: row?.samples ?? 0,
      };
    });
  }

  /** Perfil listo para el Paso 4, o null durante los primeros días */
  async getUsableProfile(device: Device): Promise<number[] | null> {
    if (device.profileDays < PROFILE_MIN_DAYS) return null;
    return (await this.getProfile(device.id)).map((p) => p.avgLiters);
  }

  async reset(device: Device) {
    await this.profiles.delete({ deviceId: device.id });
    await this.devices.patchState(device, {
      profileDays: 0,
      profileLastDate: null,
    });
  }
}

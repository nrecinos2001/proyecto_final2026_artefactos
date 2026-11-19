import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import {
  HourProfile,
  PROFILE_MIN_DAYS,
  fillMissingHours,
  hourlyConsumption,
  localDateKey,
  noiseLitersFor,
  pendingDateKeys,
  profileFromDays,
} from '../common/water-math';
import { DevicesService } from '../devices/devices.service';
import { DailyConsumption, Device, LevelReading } from '../entities';

@Injectable()
export class ProfileService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    @InjectRepository(DailyConsumption)
    private readonly daily: Repository<DailyConsumption>,
    @InjectRepository(LevelReading)
    private readonly readings: Repository<LevelReading>,
    private readonly devices: DevicesService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.processPendingForAll();
    } catch (err) {
      this.logger.error(
        `No se pudo actualizar el perfil: ${(err as Error).message}`,
      );
    }
  }

  @Cron('0 5 0 * * *')
  async processPendingForAll() {
    const today = new Date();
    for (const device of await this.devices.findAll()) {
      const first = await this.readings.findOne({
        where: { deviceId: device.id },
        order: { createdAt: 'ASC' },
        select: { createdAt: true },
      });
      const keys = pendingDateKeys(
        device.profileLastDate,
        first ? localDateKey(first.createdAt) : null,
        today,
      );
      for (const key of keys) await this.processDay(device, key);
    }
  }

  async processDay(device: Device, dateKey: string) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    const [rows, previous] = await Promise.all([
      this.readings.find({
        where: { deviceId: device.id, createdAt: Between(start, end) },
        order: { createdAt: 'ASC' },
        select: { liters: true, createdAt: true },
      }),
      this.readings.findOne({
        where: { deviceId: device.id, createdAt: LessThan(start) },
        order: { createdAt: 'DESC' },
        select: { liters: true, createdAt: true },
      }),
    ]);

    const consumption = hourlyConsumption(
      rows.map((r) => ({ liters: r.liters, at: r.createdAt })),
      previous ? { liters: previous.liters, at: previous.createdAt } : null,
      noiseLitersFor(device),
    );

    await this.daily.manager.transaction(async (em) => {
      await em.delete(DailyConsumption, {
        deviceId: device.id,
        date: dateKey,
      });
      if (consumption.size) {
        await em.insert(
          DailyConsumption,
          [...consumption].map(([hour, liters]) => ({
            deviceId: device.id,
            date: dateKey,
            hour,
            liters,
          })),
        );
      }
    });

    const changes: Partial<Device> = {
      profileDays: (await this.getProfile(device.id)).days,
    };
    const completedDay = dateKey < localDateKey(new Date());
    if (
      completedDay &&
      (!device.profileLastDate || dateKey > device.profileLastDate)
    ) {
      changes.profileLastDate = dateKey;
    }
    await this.devices.patchState(device, changes);

    this.logger.log(
      `Perfil de ${device.code} actualizado con ${dateKey} (${rows.length} lecturas)`,
    );
    return {
      date: dateKey,
      readings: rows.length,
      consumptionByHour: Object.fromEntries(consumption),
    };
  }

  async getProfile(
    deviceId: string,
  ): Promise<{ days: number; hours: HourProfile[] }> {
    const rows = await this.daily.find({
      where: { deviceId },
      select: { date: true, hour: true, liters: true },
    });
    return profileFromDays(rows);
  }

  async getUsableProfile(device: Device): Promise<number[] | null> {
    const profile = await this.getProfile(device.id);
    if (profile.days < PROFILE_MIN_DAYS) return null;
    return fillMissingHours(profile.hours);
  }

  async reset(device: Device) {
    await this.daily.delete({ deviceId: device.id });
    await this.devices.patchState(device, {
      profileDays: 0,
      profileLastDate: null,
    });
  }
}

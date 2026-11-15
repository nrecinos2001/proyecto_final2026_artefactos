import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import {
  Estimate,
  FlowTrend,
  estimateRemaining,
  flowTrend,
  regressionSlopeLph,
} from '../common/water-math';
import {
  Alert,
  Device,
  LevelReading,
  LevelState,
  TurbidityReading,
} from '../entities';
import { AlertsService } from './alerts.service';
import { ProfileService } from './profile.service';

export type TurbidityStatus =
  'sin_datos' | 'esperando_referencia' | 'sin_referencia' | 'limpia' | 'turbia';

export interface DeviceStatus {
  device: Device;
  online: boolean;
  generatedAt: string;
  level: {
    distanceCm: number;
    liters: number;
    percent: number;
    state: LevelState | null;
    at: string;
  } | null;
  flow: {
    litersPerHour: number;
    trend: FlowTrend;
    samples: number;
    windowMinutes: number;
  } | null;
  estimate: (Estimate & { profileDays: number }) | null;
  turbidity: {
    status: TurbidityStatus;
    voltage: number | null;
    ratio: number | null;
    valid: boolean | null;
    at: string | null;
    referenceVoltage: number | null;
    thresholdRatio: number;
    levelStable: boolean;
    levelStableSince: string | null;
  };
  cleaning: {
    lastCleanedAt: string | null;
    daysSince: number;
    intervalDays: number;
    daysUntilDue: number;
    due: boolean;
  };
  alerts: Alert[];
}

const DAY_MS = 86_400_000;

/** Arma la "foto" completa del estado de una cisterna para la plataforma web */
@Injectable()
export class StatusService {
  private readonly offlineMs: number;

  constructor(
    @InjectRepository(LevelReading)
    private readonly levels: Repository<LevelReading>,
    @InjectRepository(TurbidityReading)
    private readonly turbidity: Repository<TurbidityReading>,
    private readonly profiles: ProfileService,
    private readonly alerts: AlertsService,
    config: ConfigService,
  ) {
    this.offlineMs = Number(config.get('DEVICE_OFFLINE_MINUTES', 5)) * 60_000;
  }

  isOnline(device: Device, now = new Date()) {
    return (
      !!device.lastSeenAt &&
      now.getTime() - device.lastSeenAt.getTime() < this.offlineMs
    );
  }

  isLevelStable(device: Device, now = new Date()) {
    return (
      !!device.levelStableSince &&
      now.getTime() - device.levelStableSince.getTime() >=
        device.stableMinutes * 60_000
    );
  }

  async build(device: Device): Promise<DeviceStatus> {
    const now = new Date();
    const [latest, window, latestTurb, activeAlerts] = await Promise.all([
      this.levels.findOne({
        where: { deviceId: device.id },
        order: { createdAt: 'DESC' },
      }),
      this.levels.find({
        where: {
          deviceId: device.id,
          createdAt: MoreThanOrEqual(
            new Date(now.getTime() - device.windowMinutes * 60_000),
          ),
        },
        order: { createdAt: 'ASC' },
        select: { liters: true, createdAt: true },
      }),
      this.turbidity.findOne({
        where: { deviceId: device.id },
        order: { createdAt: 'DESC' },
      }),
      this.alerts.findActive(device.id),
    ]);

    // Paso 2: caudal
    const q = regressionSlopeLph(
      window.map((r) => ({ t: r.createdAt.getTime(), v: r.liters })),
    );
    const flow =
      q === null
        ? null
        : {
            litersPerHour: q,
            trend: flowTrend(q, device.capacityLiters),
            samples: window.length,
            windowMinutes: device.windowMinutes,
          };

    // Paso 4: tiempo restante / tiempo de llenado
    let estimate: DeviceStatus['estimate'] = null;
    if (latest && q !== null) {
      estimate = {
        ...estimateRemaining({
          now,
          currentLiters: latest.liters,
          capacityLiters: device.capacityLiters,
          reserveLiters: (device.capacityLiters * device.reservePercent) / 100,
          flowLph: q,
          profile: await this.profiles.getUsableProfile(device),
        }),
        profileDays: device.profileDays,
      };
    }

    // Turbidez
    let turbStatus: TurbidityStatus = 'sin_datos';
    if (device.awaitingTurbidityReference) turbStatus = 'esperando_referencia';
    else if (!device.turbidityReferenceVoltage)
      turbStatus = latestTurb ? 'sin_referencia' : 'sin_datos';
    else if (latestTurb)
      turbStatus = activeAlerts.some((a) => a.type === 'TURBIDEZ')
        ? 'turbia'
        : 'limpia';

    // Limpieza
    const base = device.lastCleanedAt ?? device.createdAt;
    const daysSince = Math.floor((now.getTime() - base.getTime()) / DAY_MS);

    return {
      device,
      online:
        this.isOnline(device, now) &&
        !activeAlerts.some((a) => a.type === 'DESCONECTADO'),
      generatedAt: now.toISOString(),
      level: latest
        ? {
            distanceCm: latest.distanceCm,
            liters: latest.liters,
            percent: latest.percent,
            state: device.levelState,
            at: latest.createdAt.toISOString(),
          }
        : null,
      flow,
      estimate,
      turbidity: {
        status: turbStatus,
        voltage: latestTurb?.voltage ?? null,
        ratio: latestTurb?.ratio ?? null,
        valid: latestTurb?.valid ?? null,
        at: latestTurb?.createdAt.toISOString() ?? null,
        referenceVoltage: device.turbidityReferenceVoltage,
        thresholdRatio: device.turbidityThresholdRatio,
        levelStable: this.isLevelStable(device, now),
        levelStableSince: device.levelStableSince?.toISOString() ?? null,
      },
      cleaning: {
        lastCleanedAt: device.lastCleanedAt?.toISOString() ?? null,
        daysSince,
        intervalDays: device.cleaningIntervalDays,
        daysUntilDue: device.cleaningIntervalDays - daysSince,
        due: daysSince >= device.cleaningIntervalDays,
      },
      alerts: activeAlerts,
    };
  }
}

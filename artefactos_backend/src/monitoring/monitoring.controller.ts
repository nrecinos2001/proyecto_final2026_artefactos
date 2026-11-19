import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { localDateKey } from '../common/water-math';
import { DevicesService } from '../devices/devices.service';
import { LevelReading, TurbidityReading } from '../entities';
import { AlertsService } from './alerts.service';
import {
  AlertsQueryDto,
  ProfileRecomputeDto,
  RangeQueryDto,
  SimulateDto,
} from './dto/monitoring.dto';
import { IngestionService } from './ingestion.service';
import { ProfileService } from './profile.service';
import { StatusService } from './status.service';

function downsample<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max - 1; i++) out.push(rows[Math.floor(i * step)]);
  out.push(rows[rows.length - 1]);
  return out;
}

function range(q: RangeQueryDto) {
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(to.getTime() - 86_400_000);
  return { from, to, maxPoints: q.maxPoints ?? 500 };
}

@Controller()
export class MonitoringController {
  constructor(
    private readonly devices: DevicesService,
    private readonly status: StatusService,
    private readonly ingestion: IngestionService,
    private readonly profiles: ProfileService,
    private readonly alerts: AlertsService,
    @InjectRepository(LevelReading)
    private readonly levels: Repository<LevelReading>,
    @InjectRepository(TurbidityReading)
    private readonly turbidity: Repository<TurbidityReading>,
  ) {}

  /** Estado completo: nivel, caudal, tiempo restante, turbidez, limpieza y alertas */
  @Get('devices/:id/status')
  async getStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.status.build(await this.devices.findOne(id));
  }

  @Get('devices/:id/readings')
  async getReadings(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: RangeQueryDto,
  ) {
    await this.devices.findOne(id);
    const { from, to, maxPoints } = range(q);
    const rows = await this.levels.find({
      where: { deviceId: id, createdAt: Between(from, to) },
      order: { createdAt: 'ASC' },
    });
    return downsample(rows, maxPoints);
  }

  @Get('devices/:id/turbidity')
  async getTurbidity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: RangeQueryDto,
  ) {
    await this.devices.findOne(id);
    const { from, to, maxPoints } = range(q);
    const rows = await this.turbidity.find({
      where: { deviceId: id, createdAt: Between(from, to) },
      order: { createdAt: 'ASC' },
    });
    return downsample(rows, maxPoints);
  }

  /** Botón "Cisterna limpia" */
  @Post('devices/:id/clean')
  async markClean(@Param('id', ParseUUIDPipe) id: string) {
    return this.ingestion.markClean(await this.devices.findOne(id));
  }

  @Get('devices/:id/profile')
  async getProfile(@Param('id', ParseUUIDPipe) id: string) {
    const device = await this.devices.findOne(id);
    const profile = await this.profiles.getProfile(id);
    return {
      days: profile.days,
      lastDate: device.profileLastDate,
      hours: profile.hours,
    };
  }

  /** Procesa un día en el perfil a mano (útil para la demostración) */
  @Post('devices/:id/profile/recompute')
  async recomputeProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProfileRecomputeDto,
  ) {
    const device = await this.devices.findOne(id);
    return this.profiles.processDay(
      device,
      dto.date ?? localDateKey(new Date()),
    );
  }

  @Delete('devices/:id/profile')
  @HttpCode(204)
  async resetProfile(@Param('id', ParseUUIDPipe) id: string) {
    await this.profiles.reset(await this.devices.findOne(id));
  }

  /** Inyecta una lectura como si viniera del ESP8266 (pruebas sin hardware) */
  @Post('devices/:id/simulate')
  async simulate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SimulateDto,
  ) {
    return this.ingestion.simulate(
      await this.devices.findOne(id),
      dto.kind,
      dto.value,
    );
  }

  @Get('alerts')
  listAlerts(@Query() q: AlertsQueryDto) {
    return this.alerts.list(q);
  }

  @Post('alerts/:id/ack')
  acknowledge(@Param('id', ParseIntPipe) id: number) {
    return this.alerts.acknowledge(id);
  }
}

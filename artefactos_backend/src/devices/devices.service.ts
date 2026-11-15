import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CalibrationPoint, Device } from '../entities';
import { EventsService } from '../events/events.service';
import {
  CalibrationPointDto,
  CreateDeviceDto,
  UpdateDeviceDto,
} from './dto/device.dto';

/** Quita las propiedades `undefined` (campos no enviados en el DTO) */
function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(CalibrationPoint)
    private readonly calibration: Repository<CalibrationPoint>,
    private readonly events: EventsService,
  ) {}

  findAll() {
    return this.devices.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string) {
    const device = await this.devices.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Cisterna no encontrada');
    return device;
  }

  findByCode(code: string) {
    return this.devices.findOne({ where: { code } });
  }

  async create(dto: CreateDeviceDto) {
    if (await this.findByCode(dto.code)) {
      throw new ConflictException(
        `Ya existe una cisterna con código ${dto.code}`,
      );
    }
    const device = this.devices.create(defined(dto));
    if (dto.capacityLiters === undefined && dto.heightCm && dto.areaCm2) {
      device.capacityLiters = (dto.heightCm * dto.areaCm2) / 1000;
    }
    this.assertThresholds(device);
    const saved = await this.devices.save(device);
    this.events.emit({ type: 'device', deviceId: saved.id, data: saved });
    return saved;
  }

  /** Alta automática cuando llega un mensaje MQTT de un código desconocido */
  async autoRegister(code: string) {
    this.logger.log(`Registrando automáticamente la cisterna "${code}"`);
    const saved = await this.devices.save(
      this.devices.create({ code, name: `Cisterna ${code}` }),
    );
    this.events.emit({ type: 'device', deviceId: saved.id, data: saved });
    return saved;
  }

  async update(id: string, dto: UpdateDeviceDto) {
    const device = await this.findOne(id);
    Object.assign(device, defined(dto));
    this.assertThresholds(device);
    const saved = await this.devices.save(device);
    this.events.emit({ type: 'device', deviceId: saved.id, data: saved });
    return saved;
  }

  save(device: Device) {
    return this.devices.save(device);
  }

  /** Actualiza solo los campos de estado indicados (evita pisar cambios de configuración) */
  async patchState(device: Device, changes: Partial<Device>) {
    Object.assign(device, changes);
    await this.devices.update(device.id, changes);
    return device;
  }

  async remove(id: string) {
    const device = await this.findOne(id);
    await this.devices.remove(device);
  }

  getCalibration(deviceId: string) {
    return this.calibration.find({
      where: { deviceId },
      order: { distanceCm: 'ASC' },
    });
  }

  async replaceCalibration(deviceId: string, points: CalibrationPointDto[]) {
    await this.findOne(deviceId);
    await this.calibration.manager.transaction(async (em) => {
      await em.delete(CalibrationPoint, { deviceId });
      if (points.length) {
        await em.insert(
          CalibrationPoint,
          points.map((p) => ({ ...p, deviceId })),
        );
      }
    });
    return this.getCalibration(deviceId);
  }

  private assertThresholds(d: Device) {
    if (d.criticalPercent > d.lowPercent) {
      throw new BadRequestException(
        'El umbral crítico debe ser menor o igual que el umbral bajo',
      );
    }
  }
}

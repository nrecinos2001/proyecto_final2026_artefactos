import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Device } from './device.entity';

/** C_h: consumo promedio (litros) de cada hora del día, actualizado con EMA */
@Entity('hourly_profiles')
@Unique(['deviceId', 'hour'])
export class HourlyProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  device: Device;

  /** 0 a 23 (hora local) */
  @Column('int')
  hour: number;

  @Column('double precision')
  avgLiters: number;

  /** Días con datos que han alimentado esta hora */
  @Column('int', { default: 0 })
  samples: number;
}

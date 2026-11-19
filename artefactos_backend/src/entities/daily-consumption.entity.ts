import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Device } from './device.entity';

@Entity('daily_consumption')
@Unique(['deviceId', 'date', 'hour'])
export class DailyConsumption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  device: Device;

  @Column('varchar', { length: 10 })
  date: string;

  @Column('int')
  hour: number;

  @Column('double precision')
  liters: number;
}

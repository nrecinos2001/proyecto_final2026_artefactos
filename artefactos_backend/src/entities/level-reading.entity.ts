import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Device } from './device.entity';

@Entity('level_readings')
@Index(['deviceId', 'createdAt'])
export class LevelReading {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  device: Device;

  /** Distancia medida por el HC-SR04 (mediana enviada por el ESP8266), cm */
  @Column('double precision')
  distanceCm: number;

  @Column('double precision')
  liters: number;

  @Column('double precision')
  percent: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

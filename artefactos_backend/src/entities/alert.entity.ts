import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Device } from './device.entity';

export type AlertType =
  | 'NIVEL_BAJO'
  | 'NIVEL_CRITICO'
  | 'TURBIDEZ'
  | 'LIMPIEZA_PROGRAMADA'
  | 'DESCONECTADO';

export type AlertSeverity = 'info' | 'warning' | 'critical';

@Entity('alerts')
@Index(['deviceId', 'active'])
export class Alert {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  device: Device;

  @Column('varchar', { length: 32 })
  type: AlertType;

  @Column('varchar', { length: 16 })
  severity: AlertSeverity;

  @Column('text')
  message: string;

  @Column({ default: true })
  active: boolean;

  @Column({ default: false })
  acknowledged: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column('timestamptz', { nullable: true })
  resolvedAt: Date | null;
}

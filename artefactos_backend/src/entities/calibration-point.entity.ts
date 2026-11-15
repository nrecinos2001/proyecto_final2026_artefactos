import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Device } from './device.entity';

/**
 * Punto de la tabla de calibración para cisternas irregulares:
 * se llena con cubetas de volumen conocido y se anota la distancia medida.
 */
@Entity('calibration_points')
export class CalibrationPoint {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device, (d) => d.calibration, { onDelete: 'CASCADE' })
  device: Device;

  @Column('double precision')
  distanceCm: number;

  @Column('double precision')
  liters: number;
}

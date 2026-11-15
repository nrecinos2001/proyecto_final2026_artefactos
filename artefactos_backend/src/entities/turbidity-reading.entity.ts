import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Device } from './device.entity';

@Entity('turbidity_readings')
@Index(['deviceId', 'createdAt'])
export class TurbidityReading {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  deviceId: string;

  @ManyToOne(() => Device, { onDelete: 'CASCADE' })
  device: Device;

  /** Voltaje en la entrada A0 (después del divisor). A mayor turbidez, menor voltaje. */
  @Column('double precision')
  voltage: number;

  @Column('int', { nullable: true })
  raw: number | null;

  /** false si se tomó mientras el nivel estaba cambiando (sedimento levantado) */
  @Column()
  valid: boolean;

  /** voltaje / voltaje de referencia del agua limpia */
  @Column('double precision', { nullable: true })
  ratio: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

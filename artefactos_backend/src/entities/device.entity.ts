import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CalibrationPoint } from './calibration-point.entity';

export type LevelState = 'normal' | 'bajo' | 'critico';

/**
 * Una cisterna monitoreada por un ESP8266.
 * `code` es el identificador que el dispositivo usa en los tópicos MQTT:
 *   cisterna/<code>/nivel, cisterna/<code>/turbidez
 */
@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 64 })
  code: string;

  @Column({ length: 120 })
  name: string;

  // --- Geometría (Paso 1: V = A x (H - d)) ---
  /** H: distancia desde el sensor (tapa) hasta el fondo, en cm */
  @Column('double precision', { default: 20 })
  heightCm: number;

  /** A: área de la base de la cisterna, en cm² */
  @Column('double precision', { default: 150 })
  areaCm2: number;

  /** Capacidad útil máxima en litros */
  @Column('double precision', { default: 3 })
  capacityLiters: number;

  // --- Umbrales de nivel (en % de la capacidad) ---
  /** Volumen de reserva que protege la bomba (meta del cálculo de tiempo restante) */
  @Column('double precision', { default: 10 })
  reservePercent: number;

  @Column('double precision', { default: 30 })
  lowPercent: number;

  @Column('double precision', { default: 15 })
  criticalPercent: number;

  /** Ventana de la regresión lineal para el caudal (Paso 2) */
  @Column('int', { default: 30 })
  windowMinutes: number;

  // --- Turbidez ---
  /** Minutos que el nivel debe estar quieto para que la lectura de turbidez sea válida */
  @Column('int', { default: 10 })
  stableMinutes: number;

  /** Voltaje del agua limpia guardado al presionar "Cisterna limpia" */
  @Column('double precision', { nullable: true })
  turbidityReferenceVoltage: number | null;

  /** true: la próxima lectura válida se guardará como referencia de agua limpia */
  @Column({ default: false })
  awaitingTurbidityReference: boolean;

  /** Fracción de la referencia por debajo de la cual el agua se considera turbia */
  @Column('double precision', { default: 0.8 })
  turbidityThresholdRatio: number;

  /** Lecturas válidas consecutivas por debajo del umbral para avisar */
  @Column('int', { default: 3 })
  turbidityConsecutive: number;

  @Column('timestamptz', { nullable: true })
  lastCleanedAt: Date | null;

  @Column('int', { default: 180 })
  cleaningIntervalDays: number;

  // --- Estado interno ---
  @Column('timestamptz', { nullable: true })
  lastSeenAt: Date | null;

  @Column('varchar', { length: 16, nullable: true })
  levelState: LevelState | null;

  /** Desde cuándo el nivel no cambia (para validar la turbidez) */
  @Column('timestamptz', { nullable: true })
  levelStableSince: Date | null;

  @Column('double precision', { nullable: true })
  levelStableRefLiters: number | null;

  /** Días ya incorporados al perfil de consumo por hora (Paso 3) */
  @Column('int', { default: 0 })
  profileDays: number;

  /** Último día (YYYY-MM-DD, hora local) procesado en el perfil */
  @Column('varchar', { length: 10, nullable: true })
  profileLastDate: string | null;

  @OneToMany(() => CalibrationPoint, (p) => p.device, { cascade: true })
  calibration: CalibrationPoint[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

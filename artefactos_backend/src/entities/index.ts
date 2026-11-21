export * from './device.entity';
export * from './calibration-point.entity';
export * from './level-reading.entity';
export * from './turbidity-reading.entity';
export * from './alert.entity';
export * from './daily-consumption.entity';

import { Alert } from './alert.entity';
import { CalibrationPoint } from './calibration-point.entity';
import { DailyConsumption } from './daily-consumption.entity';
import { Device } from './device.entity';
import { LevelReading } from './level-reading.entity';
import { TurbidityReading } from './turbidity-reading.entity';

export const ENTITIES = [
  Device,
  CalibrationPoint,
  LevelReading,
  TurbidityReading,
  Alert,
  DailyConsumption,
];

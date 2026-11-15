export * from './device.entity';
export * from './calibration-point.entity';
export * from './level-reading.entity';
export * from './turbidity-reading.entity';
export * from './hourly-profile.entity';
export * from './alert.entity';

import { Alert } from './alert.entity';
import { CalibrationPoint } from './calibration-point.entity';
import { Device } from './device.entity';
import { HourlyProfile } from './hourly-profile.entity';
import { LevelReading } from './level-reading.entity';
import { TurbidityReading } from './turbidity-reading.entity';

export const ENTITIES = [
  Device,
  CalibrationPoint,
  LevelReading,
  TurbidityReading,
  HourlyProfile,
  Alert,
];

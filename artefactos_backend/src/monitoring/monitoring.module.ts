import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  Alert,
  DailyConsumption,
  LevelReading,
  TurbidityReading,
} from '../entities';
import { AlertsService } from './alerts.service';
import { IngestionService } from './ingestion.service';
import { MonitoringController } from './monitoring.controller';
import { ProfileService } from './profile.service';
import { StatusService } from './status.service';

@Module({
  imports: [
    DevicesModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Alert,
      DailyConsumption,
      LevelReading,
      TurbidityReading,
    ]),
  ],
  controllers: [MonitoringController],
  providers: [AlertsService, ProfileService, StatusService, IngestionService],
})
export class MonitoringModule {}

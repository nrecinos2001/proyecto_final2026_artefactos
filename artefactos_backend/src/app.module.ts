import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { DevicesModule } from './devices/devices.module';
import { ENTITIES } from './entities';
import { EventsModule } from './events/events.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MqttModule } from './mqtt/mqtt.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: Number(config.get('DB_PORT', 5433)),
        username: config.get('DB_USER', 'cisterna'),
        password: config.get('DB_PASSWORD', 'cisterna'),
        database: config.get('DB_NAME', 'cisterna'),
        entities: ENTITIES,
        synchronize: config.get('DB_SYNCHRONIZE', 'true') === 'true',
      }),
    }),
    EventsModule,
    MqttModule,
    DevicesModule,
    MonitoringModule,
  ],
  controllers: [AppController],
})
export class AppModule {}

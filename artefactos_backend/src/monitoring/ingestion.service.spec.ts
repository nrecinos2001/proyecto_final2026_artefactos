import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { DevicesService } from '../devices/devices.service';
import { LevelReading, TurbidityReading } from '../entities';
import { EventsService } from '../events/events.service';
import { IncomingMessage, MqttService } from '../mqtt/mqtt.service';
import { AlertsService } from './alerts.service';
import { IngestionService } from './ingestion.service';
import { StatusService } from './status.service';

type Handler = (msg: IncomingMessage) => Promise<void> | void;

function buildService(devices: Partial<DevicesService>) {
  let handler: Handler | undefined;
  const mqtt = {
    onMessage: (h: Handler) => {
      handler = h;
    },
  } as unknown as MqttService;
  const config = { get: () => 'true' } as unknown as ConfigService;
  const service = new IngestionService(
    {} as Repository<LevelReading>,
    {} as Repository<TurbidityReading>,
    devices as DevicesService,
    {} as AlertsService,
    {} as StatusService,
    {} as EventsService,
    mqtt,
    config,
  );
  service.onModuleInit();
  return { service, receive: (msg: IncomingMessage) => handler!(msg) };
}

describe('IngestionService', () => {
  it('un error al procesar un mensaje no deja una promesa rechazada sin manejar', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const { receive } = buildService({
      findByCode: () => Promise.reject(new Error('sin base de datos')),
    });

    await expect(
      receive({ deviceCode: 'demo', kind: 'nivel', payload: '8' }),
    ).rejects.toThrow('sin base de datos');
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});

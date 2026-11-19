import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { DevicesService } from '../devices/devices.service';
import { Device, LevelReading, TurbidityReading } from '../entities';
import { EventsService } from '../events/events.service';
import { IncomingMessage, MqttService } from '../mqtt/mqtt.service';
import { AlertsService } from './alerts.service';
import { IngestionService } from './ingestion.service';
import { StatusService } from './status.service';

type Handler = (msg: IncomingMessage) => Promise<void> | void;

interface Fakes {
  levels?: Partial<Repository<LevelReading>>;
  devices?: Partial<DevicesService>;
  turbidity?: Partial<Repository<TurbidityReading>>;
  alerts?: Partial<AlertsService>;
  status?: Partial<StatusService>;
  events?: Partial<EventsService>;
  mqtt?: Partial<MqttService>;
}

function buildService(fakes: Fakes = {}) {
  let handler: Handler | undefined;
  const mqtt = {
    onMessage: (h: Handler) => {
      handler = h;
    },
    onConnect: () => undefined,
    ...fakes.mqtt,
  } as unknown as MqttService;
  const config = { get: () => 'true' } as unknown as ConfigService;
  const service = new IngestionService(
    (fakes.levels ?? {}) as Repository<LevelReading>,
    (fakes.turbidity ?? {}) as Repository<TurbidityReading>,
    (fakes.devices ?? {}) as DevicesService,
    (fakes.alerts ?? {}) as AlertsService,
    (fakes.status ?? {}) as StatusService,
    (fakes.events ?? {}) as EventsService,
    mqtt,
    config,
  );
  service.onModuleInit();
  return { service, receive: (msg: IncomingMessage) => handler!(msg) };
}

const device = (changes: Partial<Device> = {}) =>
  ({ id: 'd1', code: 'demo', ...changes }) as Device;

describe('IngestionService', () => {
  it('un error al procesar un mensaje no deja una promesa rechazada sin manejar', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    const { receive } = buildService({
      devices: {
        findByCode: () => Promise.reject(new Error('sin base de datos')),
      },
    });

    await expect(
      receive({ deviceCode: 'demo', kind: 'nivel', payload: '8' }),
    ).rejects.toThrow('sin base de datos');
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('simular turbidez fuera de 0-5 V es rechazado', async () => {
    const { service } = buildService();
    await expect(service.simulate(device(), 'turbidez', 999)).rejects.toThrow(
      'voltaje de turbidez debe estar entre 0 y 5 V, se recibió 999',
    );
  });

  it('Cisterna limpia usa la referencia vigente aunque la cisterna recibida esté desactualizada', async () => {
    const patchState = jest.fn((d: Device, changes: Partial<Device>) =>
      Promise.resolve({ ...d, ...changes }),
    );
    const { service } = buildService({
      devices: {
        findOne: () =>
          Promise.resolve(device({ turbidityReferenceVoltage: 2.5 })),
        patchState,
      },
      turbidity: { find: () => Promise.resolve([]) },
      alerts: { resolve: () => Promise.resolve() },
      status: { build: () => Promise.resolve({} as never) },
      events: { emit: () => undefined },
    });

    await service.markClean(device({ turbidityReferenceVoltage: 1.0 }));

    expect(patchState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        turbidityReferenceVoltage: 2.5,
        awaitingTurbidityReference: true,
      }),
    );
  });

  it('al reconectar se publica el estado de cada cisterna con nivel conocido', async () => {
    const publish = jest.fn(() => true);
    const { service } = buildService({
      mqtt: { publish },
      devices: {
        findAll: () =>
          Promise.resolve([
            device({ levelState: 'critico' }),
            device({ id: 'd2', code: 'otra', levelState: null }),
          ]),
      },
      levels: {
        findOne: () => Promise.resolve({ percent: 8.2 } as LevelReading),
      },
    });

    expect(await service.republishLocalAlerts()).toBe(1);
    expect(publish).toHaveBeenCalledWith('demo', 'alerta', {
      estado: 'critico',
      led: 'rojo',
      buzzer: true,
      bomba: false,
      porcentaje: 8.2,
    });
  });
});

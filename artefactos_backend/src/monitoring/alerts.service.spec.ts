import { Repository } from 'typeorm';
import { Alert } from '../entities';
import { EventsService } from '../events/events.service';
import { TelegramService } from '../notifications/telegram.service';
import { AlertsService } from './alerts.service';

describe('AlertsService', () => {
  it('solo una alerta nueva se avisa por Telegram', async () => {
    let active: Alert | null = null;
    const repository = {
      findOne: () => Promise.resolve(active),
      create: (fields: Partial<Alert>) => fields as Alert,
      save: (alert: Alert) => Promise.resolve({ ...alert, id: 1 }),
    } as unknown as Repository<Alert>;
    const send = jest.fn(() => Promise.resolve(1));
    const alerts = new AlertsService(
      repository,
      { emit: () => undefined } as unknown as EventsService,
      { send } as unknown as TelegramService,
    );

    active = await alerts.raise(
      'd1',
      'NIVEL_CRITICO',
      'critical',
      'Nivel crítico en demo',
    );
    await alerts.raise(
      'd1',
      'NIVEL_CRITICO',
      'critical',
      'Nivel crítico en demo',
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Nivel crítico: Nivel crítico en demo');
  });
});

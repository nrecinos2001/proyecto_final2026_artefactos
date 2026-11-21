import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('TelegramService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('un aviso nuevo se envía a cada chat configurado', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const telegram = new TelegramService(
      config({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_IDS: '1,2' }),
    );

    expect(await telegram.send('Nivel crítico: prueba')).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.telegram.org/bott/sendMessage',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sin token no se intenta enviar', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    expect(await new TelegramService(config({})).send('x')).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si Telegram no responde la alerta no se cae', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('sin internet'));
    const telegram = new TelegramService(
      config({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_IDS: '1' }),
    );
    expect(await telegram.send('x')).toBe(0);
  });
});

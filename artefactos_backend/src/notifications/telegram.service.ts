import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TELEGRAM_TIMEOUT_MS = 10_000;

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token: string | undefined;
  private readonly chatIds: string[];

  constructor(config: ConfigService) {
    this.token = config.get<string>('TELEGRAM_BOT_TOKEN') || undefined;
    this.chatIds = (config.get<string>('TELEGRAM_CHAT_IDS') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '');
    if (!this.enabled) {
      this.logger.log(
        'Avisos por Telegram desactivados: falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_IDS',
      );
    }
  }

  private get enabled() {
    return this.token !== undefined && this.chatIds.length > 0;
  }

  async send(text: string): Promise<number> {
    if (!this.enabled) return 0;
    const delivered = await Promise.all(
      this.chatIds.map((chatId) => this.sendTo(chatId, text)),
    );
    return delivered.filter(Boolean).length;
  }

  private async sendTo(chatId: string, text: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${this.token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
          signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        this.logger.warn(
          `Telegram respondió ${res.status} para el chat ${chatId}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar el aviso por Telegram: ${(err as Error).message}`,
      );
      return false;
    }
  }
}

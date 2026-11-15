import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MqttClient, connect } from 'mqtt';

export type MqttMessageKind = 'nivel' | 'turbidez' | 'estado';

export interface IncomingMessage {
  deviceCode: string;
  kind: MqttMessageKind;
  payload: string;
}

type Handler = (msg: IncomingMessage) => Promise<void> | void;

/**
 * Transporte MQTT. Se suscribe a:
 *   <prefijo>/+/nivel     → lectura de distancia del HC-SR04
 *   <prefijo>/+/turbidez  → lectura del sensor de turbidez
 *   <prefijo>/+/estado    → online/offline (opcional, p. ej. Last Will)
 * y publica (retenido):
 *   <prefijo>/<code>/alerta → estado de LED/buzzer/bomba calculado en el backend
 */
@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client?: MqttClient;
  private handlers: Handler[] = [];
  readonly prefix: string;

  constructor(private readonly config: ConfigService) {
    this.prefix = this.config.get<string>('MQTT_TOPIC_PREFIX', 'cisterna');
  }

  onMessage(handler: Handler) {
    this.handlers.push(handler);
  }

  onModuleInit() {
    const url = this.config.get<string>('MQTT_URL', 'mqtt://localhost:1883');
    this.client = connect(url, {
      clientId: `cisterna-backend-${Math.random().toString(16).slice(2, 8)}`,
      username: this.config.get<string>('MQTT_USERNAME') || undefined,
      password: this.config.get<string>('MQTT_PASSWORD') || undefined,
      reconnectPeriod: 3000,
    });

    this.client.on('connect', () => {
      this.logger.log(`Conectado a ${url}`);
      const topics = ['nivel', 'turbidez', 'estado'].map(
        (k) => `${this.prefix}/+/${k}`,
      );
      this.client!.subscribe(topics, { qos: 1 }, (err) => {
        if (err) this.logger.error(`Error al suscribirse: ${err.message}`);
        else this.logger.log(`Suscrito a ${topics.join(', ')}`);
      });
    });
    this.client.on('reconnect', () => this.logger.warn('Reconectando...'));
    this.client.on('error', (err) => this.logger.error(err.message));
    this.client.on('message', (topic, buf) => void this.dispatch(topic, buf));
  }

  private async dispatch(topic: string, buf: Buffer) {
    const parts = topic.split('/');
    if (parts.length !== 3 || parts[0] !== this.prefix) return;
    const [, deviceCode, kind] = parts;
    if (!['nivel', 'turbidez', 'estado'].includes(kind)) return;
    const msg: IncomingMessage = {
      deviceCode,
      kind: kind as MqttMessageKind,
      payload: buf.toString('utf8'),
    };
    for (const h of this.handlers) {
      try {
        await h(msg);
      } catch (err) {
        this.logger.error(
          `Error procesando ${topic}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }
  }

  publish(deviceCode: string, kind: string, payload: unknown, retain = true) {
    if (!this.client?.connected) return;
    this.client.publish(
      `${this.prefix}/${deviceCode}/${kind}`,
      JSON.stringify(payload),
      { qos: 1, retain },
    );
  }

  get connected() {
    return this.client?.connected ?? false;
  }

  async onModuleDestroy() {
    await this.client?.endAsync();
  }
}

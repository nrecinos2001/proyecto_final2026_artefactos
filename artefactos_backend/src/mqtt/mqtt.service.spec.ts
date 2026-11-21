import { ConfigService } from '@nestjs/config';
import { MqttService } from './mqtt.service';

describe('MqttService', () => {
  it('publicar sin conexión al broker avisa que no se envió', () => {
    const config = {
      get: (_key: string, fallback?: string) => fallback,
    } as unknown as ConfigService;
    const mqtt = new MqttService(config);
    expect(mqtt.publish('demo', 'alerta', { estado: 'normal' })).toBe(false);
  });
});

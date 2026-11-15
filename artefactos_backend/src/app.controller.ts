import { Controller, Get } from '@nestjs/common';
import { MqttService } from './mqtt/mqtt.service';

@Controller()
export class AppController {
  constructor(private readonly mqtt: MqttService) {}

  @Get('health')
  health() {
    return {
      status: 'ok',
      mqtt: this.mqtt.connected ? 'conectado' : 'desconectado',
    };
  }
}

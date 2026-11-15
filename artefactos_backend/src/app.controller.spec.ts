import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { MqttService } from './mqtt/mqtt.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: MqttService, useValue: { connected: true } }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('health reporta el estado de MQTT', () => {
    expect(appController.health()).toEqual({ status: 'ok', mqtt: 'conectado' });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from './../src/app.module';
import { LevelReading } from './../src/entities';

// Requiere la infraestructura levantada: docker compose up -d
describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) =>
        expect((res.body as { status: string }).status).toBe('ok'),
      );
  });

  it('procesar el mismo día dos veces deja el perfil igual', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/devices')
      .send({ code: `e2e-perfil-${Date.now()}`, name: 'Prueba de perfil' })
      .expect(201);
    const deviceId = (created.body as { id: string }).id;
    const levels = app.get<Repository<LevelReading>>(
      getRepositoryToken(LevelReading),
    );
    await levels.save(
      [2.0, 1.5, 1.0].map((liters, i) =>
        levels.create({
          deviceId,
          distanceCm: 20 - liters / 0.15,
          liters,
          percent: (liters / 3) * 100,
          createdAt: new Date(2026, 10, 18, 7, i * 15),
        }),
      ),
    );

    for (let i = 0; i < 2; i++) {
      await request(server)
        .post(`/devices/${deviceId}/profile/recompute`)
        .send({ date: '2026-11-18' })
        .expect(201);
    }

    const profile = await request(server)
      .get(`/devices/${deviceId}/profile`)
      .expect(200);
    const body = profile.body as {
      days: number;
      hours: { avgLiters: number; samples: number }[];
    };
    expect(body.days).toBe(1);
    expect(body.hours[7].samples).toBe(1);
    expect(body.hours[7].avgLiters).toBeCloseTo(1);

    await request(server).delete(`/devices/${deviceId}`).expect(204);
  });
});

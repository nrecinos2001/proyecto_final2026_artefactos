// La zona horaria define a qué "hora del día" pertenece cada lectura (perfil C_h).
process.env.TZ = process.env.TZ || 'America/El_Salvador';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  app.enableCors({
    origin: frontendUrl === '*' ? true : frontendUrl.split(','),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`API en http://localhost:${port}/api`, 'Bootstrap');
}
void bootstrap();

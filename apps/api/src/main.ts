import 'reflect-metadata';
import { loadEnvFile } from 'node:process';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

try {
  loadEnvFile();
} catch {
  // Local .env is optional; deployed environments can inject variables directly.
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`OmniFeed API running on http://localhost:${process.env.PORT ?? 3000}`);
}

bootstrap();

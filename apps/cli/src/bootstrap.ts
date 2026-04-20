import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../api/src/app.module';

export async function bootstrapApp() {
  return NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
}

import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed/seed.module';
import { SeedRunner } from './seed/seed.runner';

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SeedModule);
  try {
    await app.get(SeedRunner).run();
  } finally {
    await app.close();
  }
}

seed().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'Seed');
  process.exitCode = 1;
});

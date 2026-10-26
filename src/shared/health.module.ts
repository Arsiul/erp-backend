import { Module } from '@nestjs/common';
import { CheckHealthUseCase } from './application/health/check-health.use-case';
import { HealthController } from './presentation/health/health.controller';

@Module({
  controllers: [HealthController],
  providers: [CheckHealthUseCase],
})
export class HealthModule {}

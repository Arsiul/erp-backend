import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators';
import {
  CheckHealthUseCase,
  type HealthStatus,
} from '../../application/health/check-health.use-case';

@ApiTags('health')
@SkipThrottle()
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly checkHealth: CheckHealthUseCase) {}

  @Get()
  @ApiOkResponse({ description: 'API y base de datos disponibles.' })
  @ApiServiceUnavailableResponse({ description: 'La base de datos no responde.' })
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const health = await this.checkHealth.execute();
    if (health.status === 'error') {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return health;
  }
}

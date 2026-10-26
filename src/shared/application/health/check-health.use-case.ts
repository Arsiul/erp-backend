import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_PROBE, type DatabaseProbe } from './database-probe.port';

export interface HealthStatus {
  readonly status: 'ok' | 'error';
  readonly db: 'up' | 'down';
}

@Injectable()
export class CheckHealthUseCase {
  constructor(@Inject(DATABASE_PROBE) private readonly probe: DatabaseProbe) {}

  async execute(): Promise<HealthStatus> {
    try {
      await this.probe.ping();
      return { status: 'ok', db: 'up' };
    } catch {
      return { status: 'error', db: 'down' };
    }
  }
}

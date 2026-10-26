import { Injectable } from '@nestjs/common';
import type { DatabaseProbe } from '../../application/health/database-probe.port';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaDatabaseProbe implements DatabaseProbe {
  constructor(private readonly prisma: PrismaService) {}

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}

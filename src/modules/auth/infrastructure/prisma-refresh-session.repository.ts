import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type {
  NewRefreshSession,
  RefreshSession,
  RefreshSessionRepository,
} from '../domain/ports/refresh-session.repository';

@Injectable()
export class PrismaRefreshSessionRepository implements RefreshSessionRepository {
  constructor(
    private readonly host: PrismaTransactionHost,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async create(session: NewRefreshSession): Promise<void> {
    await this.host.client.refreshSession.create({ data: { ...session } });
  }

  findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    return this.host.client.refreshSession.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, familyId: true, expiresAt: true, revokedAt: true },
    });
  }

  async revoke(id: string): Promise<boolean> {
    const { count } = await this.host.client.refreshSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    return count === 1;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.host.client.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.host.client.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }
}

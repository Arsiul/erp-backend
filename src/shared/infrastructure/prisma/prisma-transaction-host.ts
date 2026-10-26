import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from './prisma.service';

export type PrismaExecutor = Prisma.TransactionClient;

/**
 * Holds the transaction opened by PrismaUnitOfWork for the current async context.
 * Repositories must always query through `client`, never through PrismaService directly.
 */
@Injectable()
export class PrismaTransactionHost {
  private readonly storage = new AsyncLocalStorage<PrismaExecutor>();

  constructor(private readonly prisma: PrismaService) {}

  /** The active transaction, or the root client when no UnitOfWork is running. */
  get client(): PrismaExecutor {
    return this.storage.getStore() ?? this.prisma;
  }

  get inTransaction(): boolean {
    return this.storage.getStore() !== undefined;
  }

  run<T>(transaction: PrismaExecutor, work: () => Promise<T>): Promise<T> {
    return this.storage.run(transaction, work);
  }
}

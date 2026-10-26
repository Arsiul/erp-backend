import { Injectable } from '@nestjs/common';
import { ConflictError } from '../../domain/errors/domain-error';
import type {
  IsolationLevel,
  UnitOfWork,
  UnitOfWorkOptions,
} from '../../domain/ports/unit-of-work.port';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaTransactionHost } from '../prisma/prisma-transaction-host';
import { PrismaService } from '../prisma/prisma.service';

const ISOLATION_LEVELS: Record<IsolationLevel, Prisma.TransactionIsolationLevel> = {
  'read-committed': Prisma.TransactionIsolationLevel.ReadCommitted,
  'repeatable-read': Prisma.TransactionIsolationLevel.RepeatableRead,
  serializable: Prisma.TransactionIsolationLevel.Serializable,
};

const TRANSACTION_TIMEOUT_MS = 15_000;
const UNIQUE_VIOLATION = 'P2002';
export const UNIQUE_VIOLATION_MESSAGE = 'Ya existe un registro con esos datos.';

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    private readonly host: PrismaTransactionHost,
  ) {}

  async run<T>(work: () => Promise<T>, options?: UnitOfWorkOptions): Promise<T> {
    if (this.host.inTransaction) {
      return work();
    }
    const isolationLevel = options?.isolationLevel;
    try {
      return await this.prisma.$transaction((tx) => this.host.run(tx, work), {
        timeout: TRANSACTION_TIMEOUT_MS,
        ...(isolationLevel ? { isolationLevel: ISOLATION_LEVELS[isolationLevel] } : {}),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ConflictError(UNIQUE_VIOLATION_MESSAGE);
      }
      throw error;
    }
  }
}

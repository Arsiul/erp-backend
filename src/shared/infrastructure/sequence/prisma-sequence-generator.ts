import { Injectable } from '@nestjs/common';
import type { SequenceGenerator } from '../../domain/ports/sequence-generator.port';
import { PrismaTransactionHost } from '../prisma/prisma-transaction-host';

interface SequenceRow {
  value: number | bigint;
}

/**
 * Upsert on `sequences(key text primary key, value int)`: the row lock taken by the
 * UPDATE serializes concurrent callers until the surrounding transaction ends.
 */
@Injectable()
export class PrismaSequenceGenerator implements SequenceGenerator {
  constructor(private readonly host: PrismaTransactionHost) {}

  async next(key: string): Promise<number> {
    const rows = await this.host.client.$queryRaw<SequenceRow[]>`
      INSERT INTO sequences (key, value) VALUES (${key}, 1)
      ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
      RETURNING value`;
    const row = rows[0];
    if (!row) {
      throw new Error(`Sequence "${key}" did not return a value.`);
    }
    return Number(row.value);
  }
}

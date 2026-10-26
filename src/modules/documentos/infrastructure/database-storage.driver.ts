import { Injectable } from '@nestjs/common';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { StagedWrite, StorageDriver } from '../domain/ports/storage-driver.port';

const SETTLED: StagedWrite = {
  commit: () => Promise.resolve(),
  discard: () => Promise.resolve(),
};

/**
 * Keeps the bytes in `stored_documents.content` (bytea), so they share the transaction and the
 * backups of the metadata. Used where the filesystem is ephemeral (Render).
 */
@Injectable()
export class DatabaseStorageDriver implements StorageDriver {
  constructor(private readonly host: PrismaTransactionHost) {}

  /** The bytes join the transaction of the row: the commit or rollback settles them. */
  async stage(key: string, bytes: Uint8Array): Promise<StagedWrite> {
    await this.host.client.storedDocument.update({
      where: { id: key },
      data: { content: Uint8Array.from(bytes) },
      select: { id: true },
    });
    return SETTLED;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const row = await this.host.client.storedDocument.findUnique({
      where: { id: key },
      select: { content: true },
    });
    return row === null ? null : row.content;
  }

  /** The bytes go away with the row. */
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

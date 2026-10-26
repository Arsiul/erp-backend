import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import type { StagedWrite, StorageDriver } from '../domain/ports/storage-driver.port';

/** Keys are server-generated UUIDs; anything else would be a path traversal attempt. */
const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Checks the shape, not `instanceof Error`: fs errors may come from another realm. */
const isMissing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';

/**
 * Development only: one file per document under `UPLOAD_DIR`, named after its id. A new version
 * is written under a fresh name and renamed over the stored file only after the commit, so a
 * rolled-back replacement never loses the previous file.
 */
export class DiskStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(uploadDir: string) {
    this.root = resolve(uploadDir);
  }

  async stage(key: string, bytes: Uint8Array): Promise<StagedWrite> {
    const target = this.pathOf(key);
    const staged = `${target}.${randomUUID()}.tmp`;
    await mkdir(this.root, { recursive: true });
    try {
      await writeFile(staged, bytes);
    } catch (error) {
      await rm(staged, { force: true });
      throw error;
    }
    return {
      commit: () => rename(staged, target),
      discard: () => rm(staged, { force: true }),
    };
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if (isMissing(error)) {
        return null;
      }
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  private pathOf(key: string): string {
    if (!KEY_PATTERN.test(key)) {
      throw new BusinessError('El archivo no es válido.');
    }
    return join(this.root, key);
  }
}

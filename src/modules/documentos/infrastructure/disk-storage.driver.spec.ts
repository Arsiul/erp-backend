import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { DiskStorageDriver } from './disk-storage.driver';

const KEY = '0b9f5c1e-6a43-4c1d-9e7a-2f8d3b6c4a10';
const OLD = new TextEncoder().encode('version 1');
const NEW = new TextEncoder().encode('version 2');

describe('DiskStorageDriver', () => {
  let dir: string;
  let driver: DiskStorageDriver;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'erp-docs-'));
    driver = new DiskStorageDriver(join(dir, 'uploads'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const store = async (bytes: Uint8Array): Promise<void> => {
    await (await driver.stage(KEY, bytes)).commit();
  };

  const textOf = async (): Promise<string | null> => {
    const bytes = await driver.get(KEY);
    return bytes === null ? null : Buffer.from(bytes).toString();
  };

  it('writes a new version under another name and replaces the file on commit', async () => {
    await store(OLD);
    const staged = await driver.stage(KEY, NEW);
    expect(await textOf()).toBe('version 1');
    expect(await readdir(join(dir, 'uploads'))).toHaveLength(2);
    await staged.commit();
    expect(await textOf()).toBe('version 2');
    expect(await readdir(join(dir, 'uploads'))).toEqual([KEY]);
  });

  it('keeps the previous file and removes the new one on discard', async () => {
    await store(OLD);
    await (await driver.stage(KEY, NEW)).discard();
    expect(await textOf()).toBe('version 1');
    expect(await readdir(join(dir, 'uploads'))).toEqual([KEY]);
  });

  it('answers null for a missing file and removes files idempotently', async () => {
    expect(await driver.get(KEY)).toBeNull();
    await store(OLD);
    await driver.remove(KEY);
    await driver.remove(KEY);
    expect(await driver.get(KEY)).toBeNull();
  });

  it('rejects keys that are not server ids', async () => {
    await expect(driver.stage('../etc/passwd', OLD)).rejects.toThrow(BusinessError);
    await expect(driver.get('a/b')).rejects.toThrow(BusinessError);
  });
});

import { ConflictError } from '../../domain/errors/domain-error';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaTransactionHost } from '../prisma/prisma-transaction-host';
import type { PrismaService } from '../prisma/prisma.service';
import { PrismaUnitOfWork, UNIQUE_VIOLATION_MESSAGE } from './prisma-unit-of-work';

type TransactionCallback = (tx: unknown) => Promise<unknown>;

const setup = () => {
  const tx = { tag: 'tx' };
  const $transaction = jest.fn((callback: TransactionCallback) => callback(tx));
  const prisma = { tag: 'root', $transaction } as unknown as PrismaService;
  const host = new PrismaTransactionHost(prisma);
  return { tx, prisma, host, $transaction, uow: new PrismaUnitOfWork(prisma, host) };
};

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test' });

describe('PrismaUnitOfWork', () => {
  it('runs the work inside a transaction exposed through the host', async () => {
    const { tx, prisma, host, $transaction, uow } = setup();

    expect(host.client).toBe(prisma);
    const seen = await uow.run(() => Promise.resolve(host.client));

    expect(seen).toBe(tx);
    expect(host.client).toBe(prisma);
    expect(host.inTransaction).toBe(false);
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
  });

  it.each([
    ['read-committed', Prisma.TransactionIsolationLevel.ReadCommitted],
    ['repeatable-read', Prisma.TransactionIsolationLevel.RepeatableRead],
    ['serializable', Prisma.TransactionIsolationLevel.Serializable],
  ] as const)('passes the %s isolation level', async (isolationLevel, expected) => {
    const { $transaction, uow } = setup();
    await uow.run(() => Promise.resolve(1), { isolationLevel });
    expect($transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15_000,
      isolationLevel: expected,
    });
  });

  it('reuses the outer transaction for nested calls', async () => {
    const { tx, host, $transaction, uow } = setup();

    const inner = await uow.run(() => uow.run(() => Promise.resolve(host.client)));

    expect(inner).toBe(tx);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it('isolates concurrent transactions from each other', async () => {
    const { host, prisma } = setup();
    const txA = { tag: 'a' };
    const txB = { tag: 'b' };
    const [a, b] = await Promise.all([
      host.run(txA as never, async () => {
        await Promise.resolve();
        return host.client;
      }),
      host.run(txB as never, () => Promise.resolve(host.client)),
    ]);
    expect(a).toBe(txA);
    expect(b).toBe(txB);
    expect(host.client).toBe(prisma);
  });

  it('translates unique violations into ConflictError', async () => {
    const { uow } = setup();
    const run = uow.run(() => Promise.reject(knownError('P2002')));
    await expect(run).rejects.toBeInstanceOf(ConflictError);
    await expect(run).rejects.toThrow(UNIQUE_VIOLATION_MESSAGE);
  });

  it('rethrows any other error unchanged', async () => {
    const { uow } = setup();
    const notFound = knownError('P2025');
    await expect(uow.run(() => Promise.reject(notFound))).rejects.toBe(notFound);
    const plain = new Error('boom');
    await expect(uow.run(() => Promise.reject(plain))).rejects.toBe(plain);
  });
});

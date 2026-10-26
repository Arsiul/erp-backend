import type { PrismaTransactionHost } from '../prisma/prisma-transaction-host';
import { PrismaSequenceGenerator } from './prisma-sequence-generator';

const generatorReturning = (rows: unknown[]) => {
  const $queryRaw = jest.fn().mockResolvedValue(rows);
  const host = { client: { $queryRaw } } as unknown as PrismaTransactionHost;
  return { $queryRaw, generator: new PrismaSequenceGenerator(host) };
};

describe('PrismaSequenceGenerator', () => {
  it('upserts the counter with a parameterized query and returns the new value', async () => {
    const { $queryRaw, generator } = generatorReturning([{ value: 42 }]);

    await expect(generator.next('invoice:F001')).resolves.toBe(42);

    const [strings, ...values] = $queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join('?');
    expect(values).toEqual(['invoice:F001']);
    expect(sql).toContain('INSERT INTO sequences (key, value) VALUES (?, 1)');
    expect(sql).toContain('ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1');
    expect(sql).toContain('RETURNING value');
  });

  it('converts bigint results to number', async () => {
    const { generator } = generatorReturning([{ value: 7n }]);
    await expect(generator.next('k')).resolves.toBe(7);
  });

  it('fails loudly when the database returns no row', async () => {
    const { generator } = generatorReturning([]);
    await expect(generator.next('k')).rejects.toThrow('Sequence "k" did not return a value.');
  });
});

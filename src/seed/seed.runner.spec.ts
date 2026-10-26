import { Logger } from '@nestjs/common';
import type { UnitOfWork } from '../shared/domain/ports/unit-of-work.port';
import { SeedRunner } from './seed.runner';
import type { Seeder } from './seeder';

describe('SeedRunner', () => {
  let log: jest.SpyInstance;
  const order: string[] = [];
  const uow: UnitOfWork = {
    run: jest.fn(async <T>(work: () => Promise<T>) => {
      order.push('begin');
      const result = await work();
      order.push('commit');
      return result;
    }),
  };

  beforeEach(() => {
    order.length = 0;
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
  });

  it('reports when there is nothing to seed', async () => {
    await new SeedRunner([], uow).run();
    expect(log).toHaveBeenCalledWith('No seeders registered.');
    expect(order).toEqual([]);
  });

  it('runs each seeder in order, each one in its own transaction', async () => {
    const seeder = (name: string): Seeder => ({
      name,
      run: () => {
        order.push(name);
        return Promise.resolve();
      },
    });

    await new SeedRunner([seeder('users'), seeder('products')], uow).run();

    expect(order).toEqual(['begin', 'users', 'commit', 'begin', 'products', 'commit']);
    expect(log).toHaveBeenCalledWith('Seeder "users" applied.');
    expect(log).toHaveBeenCalledWith('Seeder "products" applied.');
  });

  it('stops at the first failing seeder', async () => {
    const failing: Seeder = { name: 'broken', run: () => Promise.reject(new Error('bad data')) };
    const never: Seeder = { name: 'never', run: jest.fn(() => Promise.resolve()) };

    await expect(new SeedRunner([failing, never], uow).run()).rejects.toThrow('bad data');
    expect(never.run).not.toHaveBeenCalled();
  });
});

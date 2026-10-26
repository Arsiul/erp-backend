import { CheckHealthUseCase } from './check-health.use-case';
import type { DatabaseProbe } from './database-probe.port';

describe('CheckHealthUseCase', () => {
  it('reports ok when the database answers', async () => {
    const probe: DatabaseProbe = { ping: jest.fn().mockResolvedValue(undefined) };
    await expect(new CheckHealthUseCase(probe).execute()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
  });

  it('reports error when the database is unreachable', async () => {
    const probe: DatabaseProbe = { ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    await expect(new CheckHealthUseCase(probe).execute()).resolves.toEqual({
      status: 'error',
      db: 'down',
    });
  });
});

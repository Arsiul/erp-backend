import type { Response } from 'express';
import type { CheckHealthUseCase } from '../../application/health/check-health.use-case';
import { HealthController } from './health.controller';

const controllerReturning = (status: 'ok' | 'error') => {
  const health = status === 'ok' ? { status, db: 'up' } : { status, db: 'down' };
  const useCase = { execute: jest.fn().mockResolvedValue(health) } as unknown as CheckHealthUseCase;
  return { controller: new HealthController(useCase), health };
};

describe('HealthController', () => {
  it('returns the health with the default 200 status', async () => {
    const { controller, health } = controllerReturning('ok');
    const res = { status: jest.fn() };
    await expect(controller.check(res as unknown as Response)).resolves.toEqual(health);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 503 when the database is down', async () => {
    const { controller, health } = controllerReturning('error');
    const res = { status: jest.fn() };
    await expect(controller.check(res as unknown as Response)).resolves.toEqual(health);
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

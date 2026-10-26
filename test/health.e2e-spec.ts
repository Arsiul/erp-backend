import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppConfig } from '../src/config/app-config';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

describe('GET /api/v1/health (e2e, requires the db-test database)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, app.get(AppConfig));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers ok when the database responds to SELECT 1', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('answers unknown routes with the error contract', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/missing').expect(404);
    expect(response.body).toEqual({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'El recurso solicitado no existe.',
    });
  });
});

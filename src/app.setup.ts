import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { AppConfig } from './config/app-config';
import { TOTAL_COUNT_HEADER } from './shared/presentation/listing/list-response';

export const API_PREFIX = 'api/v1';
export const DOCS_PATH = 'api/docs';

function setupSwagger(app: NestExpressApplication): void {
  const document = new DocumentBuilder()
    .setTitle('ERP API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(DOCS_PATH, app, () => SwaggerModule.createDocument(app, document));
}

/** HTTP pipeline shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.setGlobalPrefix(API_PREFIX);
  app.set('trust proxy', config.trustProxyHops);
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    exposedHeaders: [TOTAL_COUNT_HEADER],
  });
  app.enableShutdownHooks();
  if (!config.isProduction) {
    setupSwagger(app);
  }
}

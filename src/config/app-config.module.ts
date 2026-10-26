import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config';
import { validateEnv } from './env.schema';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ validate: validateEnv, cache: true })],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppConfigModule } from '../config/app-config.module';
import { SharedModule } from '../shared/shared.module';
import { BOOTSTRAP_ENV, type EnvReader } from './bootstrap-values';
import { InitialAdminSeeder } from './infrastructure/initial-admin.seeder';
import { RolesSeeder } from './infrastructure/roles.seeder';
import { SettingsSeeder } from './infrastructure/settings.seeder';
import { SeedRunner } from './seed.runner';
import { SEEDERS, type Seeder } from './seeder';

@Module({
  imports: [AppConfigModule, ConfigModule, SharedModule],
  providers: [
    SeedRunner,
    RolesSeeder,
    SettingsSeeder,
    InitialAdminSeeder,
    {
      provide: BOOTSTRAP_ENV,
      useFactory:
        (config: ConfigService): EnvReader =>
        (key) =>
          config.get<string>(key),
      inject: [ConfigService],
    },
    {
      provide: SEEDERS,
      // Order matters: the initial administrator references the admin role.
      useFactory: (
        roles: RolesSeeder,
        settings: SettingsSeeder,
        admin: InitialAdminSeeder,
      ): Seeder[] => [roles, settings, admin],
      inject: [RolesSeeder, SettingsSeeder, InitialAdminSeeder],
    },
  ],
})
export class SeedModule {}

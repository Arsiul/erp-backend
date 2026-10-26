import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditQueries } from './application/audit.queries';
import { RolesUseCases } from './application/roles.use-cases';
import { SettingsUseCases } from './application/settings.use-cases';
import { UnseenUseCases } from './application/unseen.use-cases';
import { UsersUseCases } from './application/users.use-cases';
import { AUDIT_LOG_REPOSITORY } from './domain/ports/audit-log.repository';
import { ROLE_REPOSITORY } from './domain/ports/role.repository';
import { SETTINGS_REPOSITORY } from './domain/ports/settings.repository';
import { UNSEEN_QUERY } from './domain/ports/unseen-query';
import { USER_REPOSITORY } from './domain/ports/user.repository';
import { PrismaAuditLogRepository } from './infrastructure/prisma-audit-log.repository';
import { PrismaRoleRepository } from './infrastructure/prisma-role.repository';
import { PrismaSettingsRepository } from './infrastructure/prisma-settings.repository';
import { PrismaUnseenQuery } from './infrastructure/prisma-unseen-query';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { AuditController } from './presentation/audit.controller';
import { CapabilitiesController } from './presentation/capabilities.controller';
import { RolesController } from './presentation/roles.controller';
import { SettingsController } from './presentation/settings.controller';
import { UnseenController } from './presentation/unseen.controller';
import { UsersController } from './presentation/users.controller';

/**
 * Users, roles, audit trail, settings, capabilities and unseen records. Import it before the
 * business modules: its fixed routes (`/capabilities`, `/:resource/unseen`, ...) must be
 * registered before any `/:resource/:id`.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    CapabilitiesController,
    UnseenController,
    UsersController,
    RolesController,
    AuditController,
    SettingsController,
  ],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: AUDIT_LOG_REPOSITORY, useClass: PrismaAuditLogRepository },
    { provide: SETTINGS_REPOSITORY, useClass: PrismaSettingsRepository },
    { provide: UNSEEN_QUERY, useClass: PrismaUnseenQuery },
    UsersUseCases,
    RolesUseCases,
    AuditQueries,
    SettingsUseCases,
    UnseenUseCases,
  ],
})
export class AdministracionModule {}

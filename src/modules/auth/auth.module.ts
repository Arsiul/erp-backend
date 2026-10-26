import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config';
import { SESSION_REVOKER } from '../../shared/domain/ports/session-revoker.port';
import { DAY_MS } from '../../shared/domain/time/lima-time';
import { AuthenticateRequestUseCase } from './application/authenticate-request.use-case';
import { ChangeOwnPasswordUseCase } from './application/change-own-password.use-case';
import { GetSessionUseCase } from './application/get-session.use-case';
import { LoginUseCase } from './application/login.use-case';
import { LogoutUseCase } from './application/logout.use-case';
import { RefreshSessionUseCase } from './application/refresh-session.use-case';
import { AUTH_OPTIONS, type AuthOptions, SessionIssuer } from './application/session-issuer';
import { AUTH_USER_REPOSITORY } from './domain/ports/auth-user.repository';
import { REFRESH_SESSION_REPOSITORY } from './domain/ports/refresh-session.repository';
import { ACCESS_TOKEN_SERVICE, REFRESH_TOKEN_FACTORY } from './domain/ports/token.ports';
import { CryptoRefreshTokenFactory } from './infrastructure/crypto-refresh-token.factory';
import { JwtAccessTokenService } from './infrastructure/jwt-access-token.service';
import { PrismaAuthUserRepository } from './infrastructure/prisma-auth-user.repository';
import { PrismaRefreshSessionRepository } from './infrastructure/prisma-refresh-session.repository';
import { AuthController } from './presentation/auth.controller';
import { JwtAuthGuard } from './presentation/jwt-auth.guard';

/** Login, refresh rotation, logout, session and own password. Exports the global JwtAuthGuard. */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.accessSecret,
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_USER_REPOSITORY, useClass: PrismaAuthUserRepository },
    { provide: REFRESH_SESSION_REPOSITORY, useClass: PrismaRefreshSessionRepository },
    { provide: SESSION_REVOKER, useExisting: REFRESH_SESSION_REPOSITORY },
    { provide: ACCESS_TOKEN_SERVICE, useClass: JwtAccessTokenService },
    { provide: REFRESH_TOKEN_FACTORY, useClass: CryptoRefreshTokenFactory },
    {
      provide: AUTH_OPTIONS,
      inject: [AppConfig],
      useFactory: (config: AppConfig): AuthOptions => ({
        refreshTtlMs: config.refreshTtlDays * DAY_MS,
      }),
    },
    SessionIssuer,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetSessionUseCase,
    ChangeOwnPasswordUseCase,
    AuthenticateRequestUseCase,
    JwtAuthGuard,
  ],
  exports: [SESSION_REVOKER, AuthenticateRequestUseCase, JwtAuthGuard],
})
export class AuthModule {}

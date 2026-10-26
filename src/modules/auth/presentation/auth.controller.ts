import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppConfig } from '../../../config/app-config';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import {
  AllowAuthenticated,
  CurrentUser,
  Public,
} from '../../../shared/presentation/auth/auth.decorators';
import { ChangeOwnPasswordUseCase } from '../application/change-own-password.use-case';
import {
  GetSessionUseCase,
  type SessionWithCapabilities,
} from '../application/get-session.use-case';
import { LoginUseCase } from '../application/login.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case';
import type { ClientInfo, IssuedSession } from '../application/session-issuer';
import type { SessionView } from '../domain/auth-user';
import { LOCK_DURATION_MS } from '../domain/login-policy';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';

/** What the body carries; the refresh token travels only in the httpOnly cookie. */
export interface SessionResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly session: SessionView;
}

const MAX_USER_AGENT_LENGTH = 512;
/**
 * Per IP, stricter than the global limit: five tries a minute, then the IP waits as long as a
 * locked account. Login and password change are the endpoints that verify a password.
 */
export const PASSWORD_ATTEMPT_LIMIT = {
  default: { limit: 5, ttl: 60_000, blockDuration: LOCK_DURATION_MS },
};

const clientOf = (req: Request): ClientInfo => ({
  ip: req.ip ?? '',
  userAgent: (req.get('user-agent') ?? '').slice(0, MAX_USER_AGENT_LENGTH),
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly config: AppConfig,
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly logout: LogoutUseCase,
    private readonly getSession: GetSessionUseCase,
    private readonly changePassword: ChangeOwnPasswordUseCase,
  ) {}

  @Public()
  @Throttle(PASSWORD_ATTEMPT_LIMIT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Inicia sesión y deja el refresh token en una cookie httpOnly' })
  async signIn(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.respond(res, await this.login.execute(dto, clientOf(req)));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Rota el refresh token y emite un nuevo access token' })
  async renew(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    try {
      return this.respond(res, await this.refresh.execute(readRefreshCookie(req), clientOf(req)));
    } catch (error) {
      clearRefreshCookie(res, this.config);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Cierra la sesión (revoca la familia del refresh token)' })
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.logout.execute(readRefreshCookie(req));
    clearRefreshCookie(res, this.config);
  }

  @AllowAuthenticated()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil, rol, permisos y capacidades del usuario actual' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<SessionWithCapabilities> {
    return this.getSession.execute(user.id);
  }

  @AllowAuthenticated()
  @Throttle(PASSWORD_ATTEMPT_LIMIT)
  @Put('password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambia la contraseña propia; cierra las demás sesiones' })
  async password(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.respond(res, await this.changePassword.execute(user.id, dto, clientOf(req)));
  }

  private respond(res: Response, issued: IssuedSession): SessionResponse {
    setRefreshCookie(res, this.config, issued.refreshToken, issued.refreshExpiresAt);
    return {
      accessToken: issued.accessToken,
      expiresIn: issued.expiresIn,
      session: issued.session,
    };
  }
}

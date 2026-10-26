import type { CookieOptions, Request, Response } from 'express';
import { API_PREFIX } from '../../../app.setup';
import type { AppConfig } from '../../../config/app-config';

export const REFRESH_COOKIE = 'erp_rt';

/** Sent only to the auth endpoints, never readable from JavaScript. */
const baseOptions = (config: AppConfig): CookieOptions => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: `/${API_PREFIX}/auth`,
});

export function setRefreshCookie(
  res: Response,
  config: AppConfig,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(config), expires: expiresAt });
}

export function clearRefreshCookie(res: Response, config: AppConfig): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(config));
}

export function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

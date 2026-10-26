import type { Request } from 'express';
import type { AuthenticatedUser } from '../../domain/authorization/authenticated-user';

/** Express request after JwtAuthGuard: `user` is set on every non-public route. */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

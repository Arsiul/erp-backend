import { Inject, Injectable } from '@nestjs/common';
import {
  capabilitiesFor,
  type ResourceCapabilities,
} from '../../../shared/domain/authorization/capabilities';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { UnauthorizedError } from '../../../shared/domain/errors/domain-error';
import { type SessionView, toSessionView } from '../domain/auth-user';
import {
  AUTH_USER_REPOSITORY,
  type AuthUserRepository,
} from '../domain/ports/auth-user.repository';

export interface SessionWithCapabilities extends SessionView {
  readonly capabilities: Readonly<Record<ResourceKey, ResourceCapabilities>>;
}

/** `GET /auth/me`: profile, role, permissions and what each resource allows. */
@Injectable()
export class GetSessionUseCase {
  constructor(@Inject(AUTH_USER_REPOSITORY) private readonly users: AuthUserRepository) {}

  async execute(userId: string): Promise<SessionWithCapabilities> {
    const user = await this.users.findById(userId);
    if (user?.status !== 'active') {
      throw new UnauthorizedError();
    }
    return { ...toSessionView(user), capabilities: capabilitiesFor(user.role.permissions) };
  }
}

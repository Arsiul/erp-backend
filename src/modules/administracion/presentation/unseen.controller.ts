import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import {
  CurrentUser,
  RequireResourcePermission,
} from '../../../shared/presentation/auth/auth.decorators';
import { ParseResourceKeyPipe } from '../../../shared/presentation/auth/resource-key.pipe';
import { UnseenUseCases } from '../application/unseen.use-cases';

/**
 * Records created by other users that the session's user has not opened yet. Registered before
 * the resource controllers so `/:resource/unseen` and `/:resource/:id/seen` win over `/:id`.
 */
@ApiTags('unseen')
@ApiBearerAuth()
@Controller()
export class UnseenController {
  constructor(private readonly unseen: UnseenUseCases) {}

  @Get(':resource/unseen')
  @RequireResourcePermission('resource', 'read')
  @ApiOperation({ summary: 'Ids no vistos por el usuario de la sesión' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resource', ParseResourceKeyPipe) resource: ResourceKey,
  ): Promise<string[]> {
    return this.unseen.list(user.id, resource);
  }

  @Post(':resource/:id/seen')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireResourcePermission('resource', 'read')
  @ApiOperation({ summary: 'Marca un registro como visto (no audita)' })
  markSeen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resource', ParseResourceKeyPipe) resource: ResourceKey,
    @Param('id') id: string,
  ): Promise<void> {
    return this.unseen.markSeen(user.id, resource, id);
  }
}

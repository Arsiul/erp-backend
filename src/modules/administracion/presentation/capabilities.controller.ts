import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../shared/domain/authorization/authenticated-user';
import {
  capabilitiesFor,
  type ResourceCapabilities,
} from '../../../shared/domain/authorization/capabilities';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { AllowAuthenticated, CurrentUser } from '../../../shared/presentation/auth/auth.decorators';
import { ParseResourceKeyPipe } from '../../../shared/presentation/auth/resource-key.pipe';

/**
 * What the session's role may do on each resource. Registered before the resource controllers so
 * `/:resource/capabilities` wins over `/:resource/:id`.
 */
@ApiTags('capabilities')
@ApiBearerAuth()
@Controller()
export class CapabilitiesController {
  @Get('capabilities')
  @AllowAuthenticated()
  @ApiOperation({ summary: 'Capacidades del rol sobre todos los recursos' })
  all(@CurrentUser() user: AuthenticatedUser): Record<ResourceKey, ResourceCapabilities> {
    return capabilitiesFor(user.permissions);
  }

  @Get(':resource/capabilities')
  @AllowAuthenticated()
  @ApiOperation({ summary: 'Capacidades del rol sobre un recurso' })
  one(
    @CurrentUser() user: AuthenticatedUser,
    @Param('resource', ParseResourceKeyPipe) resource: ResourceKey,
  ): ResourceCapabilities {
    return capabilitiesFor(user.permissions)[resource];
  }
}

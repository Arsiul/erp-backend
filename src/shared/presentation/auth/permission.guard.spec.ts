import { type ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permissions } from '../../domain/authorization/access-level';
import type { AuthenticatedUser } from '../../domain/authorization/authenticated-user';
import { ForbiddenError, UnauthorizedError } from '../../domain/errors/domain-error';
import { MODULE_IDS } from '../../domain/module-id';
import {
  AllowAuthenticated,
  Public,
  RequirePermission,
  RequireResourcePermission,
} from './auth.decorators';
import { PermissionGuard } from './permission.guard';

const permissions = (overrides: Partial<Permissions>): Permissions =>
  ({
    ...Object.fromEntries(MODULE_IDS.map((module) => [module, 'none'])),
    ...overrides,
  }) as Permissions;

const seller: AuthenticatedUser = {
  id: 'u1',
  name: 'Ana',
  email: 'ana@erp.pe',
  roleId: 'r1',
  permissions: permissions({ comercial: 'write', maestros: 'read' }),
};

interface RequestShape {
  user?: AuthenticatedUser;
  method?: string;
  params?: Record<string, string>;
}

function contextFor(decorator: MethodDecorator | null, request: RequestShape): ExecutionContext {
  class Target {
    handler(): void {
      // Placeholder handler that only carries metadata.
    }
  }
  const handler = Object.getOwnPropertyDescriptor(Target.prototype, 'handler');
  if (decorator && handler) {
    decorator(Target.prototype, 'handler', handler);
  }
  const fullRequest = { method: 'GET', params: {}, ...request };
  return {
    getHandler: () => Target.prototype.handler,
    getClass: () => Target,
    switchToHttp: () => ({ getRequest: () => fullRequest }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  const guard = new PermissionGuard(new Reflector());

  it('lets public handlers through without a user', () => {
    expect(guard.canActivate(contextFor(Public(), {}))).toBe(true);
  });

  it('fails closed when a handler declares no requirement', () => {
    expect(() => guard.canActivate(contextFor(null, { user: seller }))).toThrow(ForbiddenError);
  });

  it('requires a user on protected handlers', () => {
    expect(() => guard.canActivate(contextFor(AllowAuthenticated(), {}))).toThrow(
      UnauthorizedError,
    );
  });

  it('accepts any signed-in user with AllowAuthenticated', () => {
    expect(guard.canActivate(contextFor(AllowAuthenticated(), { user: seller }))).toBe(true);
  });

  it('checks module levels, translating resources with RESOURCE_MODULE', () => {
    expect(
      guard.canActivate(contextFor(RequirePermission('cotizaciones', 'write'), { user: seller })),
    ).toBe(true);
    expect(
      guard.canActivate(contextFor(RequirePermission('clientes', 'read'), { user: seller })),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(RequirePermission('clientes', 'write'), { user: seller })),
    ).toThrow(new ForbiddenError('Tu rol solo permite consultar este módulo.'));
    expect(() =>
      guard.canActivate(contextFor(RequirePermission('administracion', 'read'), { user: seller })),
    ).toThrow(new ForbiddenError('Tu rol no tiene acceso a este módulo.'));
  });

  it('resolves resource parameters and the level from the HTTP method', () => {
    const decorator = RequireResourcePermission();
    expect(
      guard.canActivate(contextFor(decorator, { user: seller, params: { resource: 'clientes' } })),
    ).toBe(true);
    expect(() =>
      guard.canActivate(
        contextFor(decorator, { user: seller, method: 'POST', params: { resource: 'clientes' } }),
      ),
    ).toThrow(ForbiddenError);
    expect(
      guard.canActivate(
        contextFor(RequireResourcePermission('resource', 'read'), {
          user: seller,
          method: 'POST',
          params: { resource: 'clientes' },
        }),
      ),
    ).toBe(true);
  });

  it('answers 404 for unknown resources', () => {
    expect(() =>
      guard.canActivate(
        contextFor(RequireResourcePermission(), { user: seller, params: { resource: 'nada' } }),
      ),
    ).toThrow(NotFoundException);
  });
});

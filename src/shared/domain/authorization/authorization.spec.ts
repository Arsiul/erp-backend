import { ForbiddenError } from '../errors/domain-error';
import { isModuleId, MODULE_IDS, type ModuleId } from '../module-id';
import {
  assertAccess,
  hasAccess,
  isAccessLevel,
  NO_ACCESS_MESSAGE,
  READ_ONLY_MESSAGE,
  type AccessLevel,
  type Permissions,
} from './access-level';
import { actorOf } from './authenticated-user';
import { capabilitiesFor, RESOURCE_CAPABILITIES } from './capabilities';
import { isResourceKey, RESOURCE_KEYS, RESOURCE_MODULE } from './resources';

const permissionsWith = (
  level: AccessLevel,
  overrides: Partial<Permissions> = {},
): Permissions => ({
  ...(Object.fromEntries(MODULE_IDS.map((module) => [module, level])) as Record<
    ModuleId,
    AccessLevel
  >),
  ...overrides,
});

describe('authorization', () => {
  it('recognises modules, levels and resources', () => {
    expect(isModuleId('tesoreria')).toBe(true);
    expect(isModuleId('rrhh')).toBe(false);
    expect(isAccessLevel('write')).toBe(true);
    expect(isAccessLevel('admin')).toBe(false);
    expect(isAccessLevel(2)).toBe(false);
    expect(isResourceKey('cuentas-cobrar')).toBe(true);
    expect(isResourceKey('reportes')).toBe(false);
  });

  it('maps every resource to a known module', () => {
    RESOURCE_KEYS.forEach((resource) => {
      expect(MODULE_IDS).toContain(RESOURCE_MODULE[resource]);
    });
  });

  it('ranks access levels', () => {
    const permissions = permissionsWith('none', { comercial: 'read', compras: 'write' });
    expect(hasAccess(permissions, 'comercial', 'read')).toBe(true);
    expect(hasAccess(permissions, 'comercial', 'write')).toBe(false);
    expect(hasAccess(permissions, 'compras', 'write')).toBe(true);
    expect(hasAccess(permissions, 'maestros', 'none')).toBe(true);
    expect(hasAccess(permissions, 'maestros', 'read')).toBe(false);
  });

  it('rejects with the frontend messages', () => {
    const permissions = permissionsWith('none', { comercial: 'read' });
    expect(() => {
      assertAccess(permissions, 'comercial', 'read');
    }).not.toThrow();
    expect(() => {
      assertAccess(permissions, 'comercial', 'write');
    }).toThrow(new ForbiddenError(READ_ONLY_MESSAGE));
    expect(() => {
      assertAccess(permissions, 'maestros', 'read');
    }).toThrow(new ForbiddenError(NO_ACCESS_MESSAGE));
  });

  it('turns capabilities off where the role cannot write', () => {
    const capabilities = capabilitiesFor(permissionsWith('read', { administracion: 'write' }));
    expect(capabilities.usuarios).toEqual(RESOURCE_CAPABILITIES.usuarios);
    expect(capabilities.clientes).toEqual({
      create: false,
      update: false,
      remove: false,
      actions: [],
    });
    expect(Object.keys(capabilities)).toEqual([...RESOURCE_KEYS]);
  });

  it('builds the audit actor of a user', () => {
    expect(actorOf({ id: 'usr-1', name: 'Ana' })).toEqual({ userId: 'usr-1', userName: 'Ana' });
  });
});

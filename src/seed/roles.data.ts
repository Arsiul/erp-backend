import type { AccessLevel } from '../shared/domain/authorization/access-level';
import { MODULE_IDS, type ModuleId } from '../shared/domain/module-id';

/**
 * System roles and their permission matrix. They are configuration, not demo data: the ids match
 * the frontend (`erp-frontend/src/services/mocks/seed/base.ts`) so both sides name the same roles.
 */
export interface SeedRole {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly system: boolean;
  readonly defaultAccess: AccessLevel;
  readonly access: Readonly<Partial<Record<ModuleId, AccessLevel>>>;
}

export const ADMIN_ROLE_ID = 'role-admin';

export const BASE_ROLES: readonly SeedRole[] = [
  {
    id: ADMIN_ROLE_ID,
    name: 'Administrador',
    description: 'Acceso total, incluida la administración de usuarios y la configuración.',
    system: true,
    defaultAccess: 'write',
    access: {},
  },
  {
    id: 'role-ventas',
    name: 'Ventas',
    description: 'Cotiza, vende, factura y consulta el stock y las cuentas por cobrar.',
    system: false,
    defaultAccess: 'none',
    access: {
      maestros: 'read',
      comercial: 'write',
      inventario: 'read',
      documentos: 'write',
      reportes: 'read',
    },
  },
  {
    id: 'role-compras',
    name: 'Compras y almacén',
    description: 'Gestiona órdenes, recepciones, facturas de proveedor e inventario.',
    system: false,
    defaultAccess: 'none',
    access: {
      maestros: 'write',
      compras: 'write',
      inventario: 'write',
      documentos: 'write',
      reportes: 'read',
    },
  },
  {
    id: 'role-tesoreria',
    name: 'Tesorería',
    description: 'Registra cobros y pagos y concilia las cuentas bancarias.',
    system: false,
    defaultAccess: 'none',
    access: {
      maestros: 'read',
      comercial: 'read',
      compras: 'read',
      tesoreria: 'write',
      documentos: 'read',
      reportes: 'read',
    },
  },
  {
    id: 'role-consulta',
    name: 'Consulta',
    description: 'Solo lectura de todos los módulos operativos.',
    system: false,
    defaultAccess: 'read',
    access: { administracion: 'none' },
  },
];

/** Full permission matrix of a role: one access level per module. */
export const permissionMatrix = (role: SeedRole): { module: ModuleId; access: AccessLevel }[] =>
  MODULE_IDS.map((module) => ({ module, access: role.access[module] ?? role.defaultAccess }));

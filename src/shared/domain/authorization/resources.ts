import type { ModuleId } from '../module-id';

/** Every list screen of the frontend; the key is also the REST path segment. */
export const RESOURCE_KEYS = [
  'clientes',
  'proveedores',
  'productos',
  'categorias',
  'almacenes',
  'cotizaciones',
  'ventas',
  'comprobantes',
  'notas-credito',
  'cuentas-cobrar',
  'ordenes-compra',
  'recepciones',
  'facturas-proveedor',
  'cuentas-pagar',
  'stock',
  'kardex',
  'ajustes',
  'transferencias',
  'cuentas-bancarias',
  'movimientos',
  'documentos',
  'usuarios',
  'roles',
  'auditoria',
] as const;

export type ResourceKey = (typeof RESOURCE_KEYS)[number];

/** Permission module of each resource, identical to `RESOURCE_MODULE` in the frontend. */
export const RESOURCE_MODULE = {
  clientes: 'maestros',
  proveedores: 'maestros',
  productos: 'maestros',
  categorias: 'maestros',
  almacenes: 'maestros',
  'cuentas-bancarias': 'maestros',
  cotizaciones: 'comercial',
  ventas: 'comercial',
  comprobantes: 'comercial',
  'notas-credito': 'comercial',
  'cuentas-cobrar': 'comercial',
  'ordenes-compra': 'compras',
  recepciones: 'compras',
  'facturas-proveedor': 'compras',
  'cuentas-pagar': 'compras',
  stock: 'inventario',
  kardex: 'inventario',
  ajustes: 'inventario',
  transferencias: 'inventario',
  movimientos: 'tesoreria',
  documentos: 'documentos',
  usuarios: 'administracion',
  roles: 'administracion',
  auditoria: 'administracion',
} as const satisfies Record<ResourceKey, ModuleId>;

/** Resources whose rows are written by the system: they never get an "unseen" mark. */
export const AUTOMATIC_RESOURCES: readonly ResourceKey[] = ['auditoria', 'kardex'];

export const isResourceKey = (value: string): value is ResourceKey =>
  (RESOURCE_KEYS as readonly string[]).includes(value);

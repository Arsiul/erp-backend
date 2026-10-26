/** Permission modules, identical to `ModuleId` in the frontend. */
export type ModuleId =
  | 'maestros'
  | 'comercial'
  | 'compras'
  | 'inventario'
  | 'tesoreria'
  | 'documentos'
  | 'reportes'
  | 'administracion';

/** Menu order, identical to `MODULE_IDS` in the frontend. */
export const MODULE_IDS = [
  'maestros',
  'comercial',
  'compras',
  'inventario',
  'tesoreria',
  'documentos',
  'reportes',
  'administracion',
] as const satisfies readonly ModuleId[];

export const isModuleId = (value: string): value is ModuleId =>
  (MODULE_IDS as readonly string[]).includes(value);

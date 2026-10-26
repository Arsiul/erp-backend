import { hasAccess, type Permissions } from './access-level';
import { RESOURCE_KEYS, RESOURCE_MODULE, type ResourceKey } from './resources';

export interface ResourceAction {
  readonly id: string;
  /** Verb written to the audit trail ("Aprobó", "Anuló"…). */
  readonly label: string;
}

/** What a resource allows; the frontend shows or hides buttons with it. */
export interface ResourceCapabilities {
  readonly create: boolean;
  readonly update: boolean;
  readonly remove: boolean;
  readonly actions: readonly ResourceAction[];
}

const ACTIVATION: readonly ResourceAction[] = [
  { id: 'activate', label: 'Activó' },
  { id: 'deactivate', label: 'Desactivó' },
];
const CANCEL: ResourceAction = { id: 'cancel', label: 'Anuló' };

const crud = (actions: readonly ResourceAction[] = []): ResourceCapabilities => ({
  create: true,
  update: true,
  remove: true,
  actions,
});

const NOTHING: ResourceCapabilities = { create: false, update: false, remove: false, actions: [] };

/**
 * Operations each resource supports, identical to the rules of the frontend mocks
 * (`capabilities()` in `services/mocks/business`). The F3+ modules keep their use cases in line
 * with this catalog: an operation missing here answers 405 (CRUD) or 404 (actions).
 */
export const RESOURCE_CAPABILITIES: Readonly<Record<ResourceKey, ResourceCapabilities>> = {
  clientes: crud(ACTIVATION),
  proveedores: crud(ACTIVATION),
  productos: crud(ACTIVATION),
  categorias: crud(ACTIVATION),
  almacenes: crud(ACTIVATION),
  'cuentas-bancarias': crud(ACTIVATION),
  cotizaciones: crud([
    { id: 'send', label: 'Envió' },
    { id: 'accept', label: 'Aceptó' },
    { id: 'reject', label: 'Rechazó' },
  ]),
  ventas: { create: true, update: true, remove: false, actions: [CANCEL] },
  comprobantes: { create: true, update: false, remove: false, actions: [CANCEL] },
  'notas-credito': { create: true, update: false, remove: false, actions: [] },
  'cuentas-cobrar': NOTHING,
  'ordenes-compra': crud([{ id: 'approve', label: 'Aprobó' }, CANCEL]),
  recepciones: { create: true, update: true, remove: false, actions: [CANCEL] },
  'facturas-proveedor': { create: true, update: false, remove: false, actions: [CANCEL] },
  'cuentas-pagar': NOTHING,
  stock: { create: false, update: true, remove: false, actions: [] },
  kardex: NOTHING,
  ajustes: { create: true, update: false, remove: false, actions: [] },
  transferencias: {
    create: true,
    update: true,
    remove: false,
    actions: [{ id: 'complete', label: 'Completó' }, CANCEL],
  },
  movimientos: {
    create: true,
    update: true,
    remove: false,
    actions: [{ id: 'void', label: 'Anuló' }],
  },
  documentos: crud(),
  usuarios: crud(ACTIVATION),
  roles: crud(),
  auditoria: NOTHING,
};

/** Capabilities usable with the given permissions: everything off where the role cannot write. */
export function capabilitiesFor(
  permissions: Permissions,
): Record<ResourceKey, ResourceCapabilities> {
  return Object.fromEntries(
    RESOURCE_KEYS.map((resource) => [
      resource,
      hasAccess(permissions, RESOURCE_MODULE[resource], 'write')
        ? RESOURCE_CAPABILITIES[resource]
        : NOTHING,
    ]),
  ) as Record<ResourceKey, ResourceCapabilities>;
}

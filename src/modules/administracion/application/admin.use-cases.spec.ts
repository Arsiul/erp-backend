import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import type { AuditEntry, AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import type { PasswordHasher } from '../../../shared/domain/ports/password-hasher.port';
import type { SessionRevoker } from '../../../shared/domain/ports/session-revoker.port';
import type { UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import type { UnseenRecords } from '../../../shared/domain/ports/unseen-records.port';
import { limaDayEnd, limaDayStart } from '../../../shared/domain/time/lima-time';
import type { ActiveStatus } from '../../../shared/domain/validation/field-rules';
import { type AuditRecord, PASSWORD_RESET_ACTION } from '../domain/audit-record';
import {
  CREATED_ACTION,
  REMOVED_ACTION,
  UPDATED_ACTION,
} from '../../../shared/domain/audit/audit-actions';
import type { AuditCriteria, AuditLogRepository } from '../domain/ports/audit-log.repository';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import type { RoleRepository } from '../domain/ports/role.repository';
import type { SettingsRepository } from '../domain/ports/settings.repository';
import type { UnseenQuery } from '../domain/ports/unseen-query';
import type { UserCriteria, UserRepository } from '../domain/ports/user.repository';
import type { RoleRecord, RoleValues } from '../domain/role';
import { normalizePermissions } from '../domain/role-rules';
import type { Settings } from '../domain/settings';
import type { UserRecord, UserValues } from '../domain/user';
import {
  SELF_DEACTIVATION,
  SELF_REMOVAL,
  SELF_ROLE_CHANGE,
  USER_HAS_AUDITS,
} from '../domain/user-rules';
import { AuditQueries } from './audit.queries';
import {
  type ActingUser,
  INVALID_DATE,
  mergeDefined,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { UNPAGED_LIST_LIMIT } from '../../../shared/application/pagination/pagination';
import {
  requireAction,
  UNKNOWN_ACTION,
} from '../../../shared/application/listing/resource-actions';
import { RolesUseCases } from './roles.use-cases';
import { SETTINGS_MISSING, SettingsUseCases } from './settings.use-cases';
import { UnseenUseCases } from './unseen.use-cases';
import { UsersUseCases } from './users.use-cases';

const ADMIN: ActingUser = { id: 'admin', name: 'Administrador' };
const PERMISSIONS = normalizePermissions({ administracion: 'write' });

class ImmediateUnitOfWork implements UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

class MemoryAudit implements AuditLogger {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  actions(): string[] {
    return this.entries.map((entry) => `${entry.action} ${entry.reference}`);
  }
}

class MemoryUnseen implements UnseenRecords, UnseenQuery {
  readonly created: string[] = [];
  readonly forgotten: string[] = [];
  readonly seen: string[] = [];

  recordCreated(resource: ResourceKey, recordId: string, authorId: string): Promise<void> {
    this.created.push(`${resource}/${recordId} by ${authorId}`);
    return Promise.resolve();
  }

  forget(resource: ResourceKey, recordId: string): Promise<void> {
    this.forgotten.push(`${resource}/${recordId}`);
    return Promise.resolve();
  }

  listFor(userId: string, resource: ResourceKey): Promise<string[]> {
    return Promise.resolve([`${userId}:${resource}`]);
  }

  markSeen(userId: string, resource: ResourceKey, recordId: string): Promise<void> {
    this.seen.push(`${userId}:${resource}/${recordId}`);
    return Promise.resolve();
  }
}

class MemoryRevoker implements SessionRevoker {
  readonly revoked: string[] = [];

  revokeAllForUser(userId: string): Promise<void> {
    this.revoked.push(userId);
    return Promise.resolve();
  }
}

class PrefixHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return Promise.resolve(`h:${plain}`);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return Promise.resolve(hash === `h:${plain}`);
  }
}

function found<T>(row: T | undefined): T {
  if (row === undefined) {
    throw new Error('missing row');
  }
  return row;
}

class MemoryRoles implements RoleRepository {
  readonly rows = new Map<string, RoleRecord>();
  readonly users = new Map<string, number>();
  lastCriteria: ListCriteria | undefined;
  private seq = 0;

  constructor(...roles: RoleRecord[]) {
    for (const role of roles) {
      this.rows.set(role.id, role);
    }
  }

  isNameTaken(name: string, exceptId?: string): Promise<boolean> {
    return Promise.resolve(
      [...this.rows.values()].some((role) => role.name === name && role.id !== exceptId),
    );
  }

  list(criteria: ListCriteria): Promise<ListResult<RoleRecord>> {
    this.lastCriteria = criteria;
    const items = [...this.rows.values()];
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<RoleRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  create(values: RoleValues): Promise<RoleRecord> {
    this.seq += 1;
    const role: RoleRecord = { id: `role-${String(this.seq)}`, system: false, ...values };
    this.rows.set(role.id, role);
    return Promise.resolve(role);
  }

  update(id: string, values: RoleValues): Promise<RoleRecord> {
    const role = { ...found(this.rows.get(id)), ...values };
    this.rows.set(id, role);
    return Promise.resolve(role);
  }

  remove(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  countUsers(id: string): Promise<number> {
    return Promise.resolve(this.users.get(id) ?? 0);
  }
}

class MemoryUsers implements UserRepository {
  readonly rows = new Map<string, UserRecord>();
  readonly hashes = new Map<string, string>();
  readonly audits = new Map<string, number>();
  lastCriteria: UserCriteria | undefined;
  private seq = 0;

  constructor(
    private readonly roleNames: ReadonlyMap<string, string>,
    ...users: UserRecord[]
  ) {
    for (const user of users) {
      this.rows.set(user.id, user);
    }
  }

  isEmailTaken(email: string, exceptId?: string): Promise<boolean> {
    return Promise.resolve(
      [...this.rows.values()].some((user) => user.email === email && user.id !== exceptId),
    );
  }

  findRoleName(roleId: string): Promise<string | null> {
    return Promise.resolve(this.roleNames.get(roleId) ?? null);
  }

  list(criteria: UserCriteria): Promise<ListResult<UserRecord>> {
    this.lastCriteria = criteria;
    const items = [...this.rows.values()];
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  create(values: UserValues, passwordHash: string): Promise<UserRecord> {
    this.seq += 1;
    const user: UserRecord = { id: `usr-${String(this.seq)}`, lastAccessAt: null, ...values };
    this.rows.set(user.id, user);
    this.hashes.set(user.id, passwordHash);
    return Promise.resolve(user);
  }

  update(id: string, values: UserValues): Promise<UserRecord> {
    const user = { ...found(this.rows.get(id)), ...values };
    this.rows.set(id, user);
    return Promise.resolve(user);
  }

  setStatus(id: string, status: ActiveStatus): Promise<UserRecord> {
    const user = { ...found(this.rows.get(id)), status };
    this.rows.set(id, user);
    return Promise.resolve(user);
  }

  setPasswordHash(id: string, passwordHash: string): Promise<void> {
    this.hashes.set(id, passwordHash);
    return Promise.resolve();
  }

  remove(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  countAudits(id: string): Promise<number> {
    return Promise.resolve(this.audits.get(id) ?? 0);
  }
}

class MemoryAuditLog implements AuditLogRepository {
  lastCriteria: AuditCriteria | undefined;

  constructor(private readonly rows: AuditRecord[]) {}

  list(criteria: AuditCriteria): Promise<ListResult<AuditRecord>> {
    this.lastCriteria = criteria;
    return Promise.resolve({ items: this.rows, total: this.rows.length });
  }

  findById(id: string): Promise<AuditRecord | null> {
    return Promise.resolve(this.rows.find((row) => row.id === id) ?? null);
  }
}

class MemorySettings implements SettingsRepository {
  constructor(public current: Settings | null) {}

  get(): Promise<Settings | null> {
    return Promise.resolve(this.current);
  }

  save(settings: Settings): Promise<Settings> {
    this.current = settings;
    return Promise.resolve(settings);
  }
}

describe('list query', () => {
  it('maps an empty request to a descending list capped at the unpaged limit', () => {
    expect(toListCriteria({})).toEqual({
      q: '',
      from: undefined,
      to: undefined,
      order: 'desc',
      window: { skip: 0, take: UNPAGED_LIST_LIMIT },
    });
  });

  it('maps search, Lima day range, order and page window', () => {
    expect(
      toListCriteria({
        q: '  ana ',
        from: '2026-03-01',
        to: '2026-03-31',
        sort: 'asc',
        page: 3,
        pageSize: 20,
      }),
    ).toEqual({
      q: 'ana',
      from: limaDayStart('2026-03-01'),
      to: limaDayEnd('2026-03-31'),
      order: 'asc',
      window: { skip: 40, take: 20 },
    });
    expect(toListCriteria({ from: '', to: '' })).toMatchObject({ from: undefined, to: undefined });
  });

  it('rejects malformed days', () => {
    expect(() => toListCriteria({ from: '01/03/2026' })).toThrow(INVALID_DATE);
    expect(() => toListCriteria({ to: 'mañana' })).toThrow(BusinessError);
  });

  it('merges only the defined fields of a patch', () => {
    const current: { a?: number | undefined; b: string } = { a: 1, b: 'x' };
    expect(mergeDefined(current, { a: undefined, b: 'y' })).toEqual({ a: 1, b: 'y' });
  });
});

describe('resource actions', () => {
  it('finds a declared action or answers not found', () => {
    expect(requireAction('usuarios', 'activate').label).toBe('Activó');
    expect(() => requireAction('roles', 'activate')).toThrow(UNKNOWN_ACTION);
    expect(() => requireAction('roles', 'activate')).toThrow(NotFoundError);
  });
});

describe('AuditQueries', () => {
  const entry: AuditRecord = {
    id: 'a1',
    date: new Date('2026-03-10T15:45:00Z'),
    userName: 'Ana',
    module: 'administracion',
    resource: 'usuarios',
    action: CREATED_ACTION,
    reference: 'Luis',
  };

  it('lists with module and resource filters', async () => {
    const log = new MemoryAuditLog([entry]);
    const queries = new AuditQueries(log);

    const unpaged = await queries.list({ module: 'administracion', resource: 'usuarios' });
    expect(unpaged).toMatchObject({ total: 1, paged: false });
    expect(typeof unpaged.items[0]?.date).toBe('string');
    expect(log.lastCriteria).toMatchObject({ module: 'administracion', resource: 'usuarios' });
    await expect(queries.list({ page: 1 })).resolves.toMatchObject({ paged: true });
  });

  it('gets one entry and has no actions', async () => {
    const queries = new AuditQueries(new MemoryAuditLog([entry]));
    await expect(queries.get('a1')).resolves.toMatchObject({ id: 'a1', reference: 'Luis' });
    await expect(queries.get('a404')).rejects.toBeInstanceOf(NotFoundError);
    await expect(queries.runAction('a1', 'activate')).rejects.toThrow(UNKNOWN_ACTION);
    await expect(queries.runAction('a404', 'activate')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('RolesUseCases', () => {
  const system: RoleRecord = {
    id: 'role-admin',
    name: 'Administrador',
    description: '',
    permissions: PERMISSIONS,
    system: true,
  };
  const sales: RoleRecord = { ...system, id: 'role-ventas', name: 'Ventas', system: false };

  function setup() {
    const roles = new MemoryRoles(system, sales);
    const audit = new MemoryAudit();
    const unseen = new MemoryUnseen();
    return {
      roles,
      audit,
      unseen,
      useCases: new RolesUseCases(new ImmediateUnitOfWork(), roles, audit, unseen),
    };
  }

  it('lists and gets roles', async () => {
    const { roles, useCases } = setup();
    await expect(useCases.list({ q: 'ven' })).resolves.toMatchObject({ total: 2, paged: false });
    expect(roles.lastCriteria?.q).toBe('ven');
    await expect(useCases.list({ page: 1 })).resolves.toMatchObject({ paged: true });
    await expect(useCases.get('role-ventas')).resolves.toBe(sales);
    await expect(useCases.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates a role, marks it unseen and audits it', async () => {
    const { useCases, unseen, audit } = setup();
    const created = await useCases.create(
      { name: 'Caja', permissions: { tesoreria: 'write' } },
      ADMIN,
    );

    expect(created).toMatchObject({ id: 'role-1', name: 'Caja', description: '' });
    expect(created.permissions.tesoreria).toBe('write');
    expect(unseen.created).toEqual(['roles/role-1 by admin']);
    expect(audit.entries).toEqual([
      {
        actor: { userId: 'admin', userName: 'Administrador' },
        module: 'administracion',
        resource: 'roles',
        action: CREATED_ACTION,
        reference: 'Caja',
      },
    ]);
  });

  it('updates a custom role keeping the fields left out', async () => {
    const { useCases, audit } = setup();
    const updated = await useCases.update('role-ventas', { description: 'Mostrador' }, ADMIN);

    expect(updated).toMatchObject({ name: 'Ventas', description: 'Mostrador' });
    expect(updated.permissions).toEqual(PERMISSIONS);
    expect(audit.actions()).toEqual([`${UPDATED_ACTION} Ventas`]);
  });

  it('rejects editing a system role or taking another name', async () => {
    const { useCases } = setup();
    await expect(useCases.update('role-admin', { name: 'Root' }, ADMIN)).rejects.toThrow(
      'Los roles del sistema no se modifican; crea uno nuevo.',
    );
    await expect(useCases.update('role-ventas', { name: 'Administrador' }, ADMIN)).rejects.toThrow(
      'Ya existe un rol con ese nombre.',
    );
    await expect(useCases.update('nope', {}, ADMIN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removes an unused role and forgets its unseen marks', async () => {
    const { useCases, roles, unseen, audit } = setup();
    await useCases.remove('role-ventas', ADMIN);

    expect(roles.rows.has('role-ventas')).toBe(false);
    expect(unseen.forgotten).toEqual(['roles/role-ventas']);
    expect(audit.actions()).toEqual([`${REMOVED_ACTION} Ventas`]);
  });

  it('keeps roles that still have users', async () => {
    const { useCases, roles } = setup();
    roles.users.set('role-ventas', 2);
    await expect(useCases.remove('role-ventas', ADMIN)).rejects.toThrow(
      'El rol tiene usuarios; asígnales otro rol antes de eliminarlo.',
    );
    expect(roles.rows.has('role-ventas')).toBe(true);
  });

  it('declares no actions', async () => {
    const { useCases } = setup();
    await expect(useCases.runAction('role-ventas', 'activate')).rejects.toThrow(UNKNOWN_ACTION);
    await expect(useCases.runAction('nope', 'activate')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('SettingsUseCases', () => {
  const settings: Settings = {
    companyName: 'Andes Tech SAC',
    ruc: '20123456789',
    address: '',
    phone: '',
    email: '',
    igvRate: 0.18,
    invoiceSeries: 'F001',
    receiptSeries: 'B001',
    creditNoteSeries: 'FC01',
    quoteValidityDays: 15,
  };

  it('reports missing settings', async () => {
    const useCases = new SettingsUseCases(
      new ImmediateUnitOfWork(),
      new MemorySettings(null),
      new MemoryAudit(),
    );
    await expect(useCases.get()).rejects.toThrow(SETTINGS_MISSING);
  });

  it('validates, saves and audits the settings', async () => {
    const repo = new MemorySettings(settings);
    const audit = new MemoryAudit();
    const useCases = new SettingsUseCases(new ImmediateUnitOfWork(), repo, audit);

    await expect(useCases.get()).resolves.toBe(settings);
    await expect(useCases.save({ ...settings, igvRate: 0.1 }, ADMIN)).resolves.toMatchObject({
      igvRate: 0.1,
    });
    expect(audit.entries[0]).toMatchObject({
      resource: 'configuracion',
      action: UPDATED_ACTION,
      reference: 'Configuración',
    });
    await expect(useCases.save({ ...settings, ruc: '1' }, ADMIN)).rejects.toBeInstanceOf(
      BusinessError,
    );
    expect(repo.current?.igvRate).toBe(0.1);
  });
});

describe('UnseenUseCases', () => {
  it('delegates to the unseen query', async () => {
    const unseen = new MemoryUnseen();
    const useCases = new UnseenUseCases(unseen);
    await expect(useCases.list('u1', 'roles')).resolves.toEqual(['u1:roles']);
    await useCases.markSeen('u1', 'roles', 'r1');
    expect(unseen.seen).toEqual(['u1:roles/r1']);
  });
});

describe('UsersUseCases', () => {
  const admin: UserRecord = {
    id: 'admin',
    name: 'Administrador',
    email: 'admin@erp.pe',
    roleId: 'role-admin',
    roleName: 'Administrador',
    status: 'active',
    lastAccessAt: new Date('2026-03-10T15:45:00Z'),
  };
  const seller: UserRecord = {
    ...admin,
    id: 'usr-ventas',
    name: 'Vendedor',
    email: 'ventas@erp.pe',
    roleId: 'role-ventas',
    roleName: 'Ventas',
    lastAccessAt: null,
  };

  function setup() {
    const users = new MemoryUsers(
      new Map([
        ['role-admin', 'Administrador'],
        ['role-ventas', 'Ventas'],
      ]),
      admin,
      seller,
    );
    const audit = new MemoryAudit();
    const unseen = new MemoryUnseen();
    const sessions = new MemoryRevoker();
    const useCases = new UsersUseCases(
      new ImmediateUnitOfWork(),
      users,
      new PrefixHasher(),
      audit,
      unseen,
      sessions,
    );
    return { users, audit, unseen, sessions, useCases };
  }

  it('lists with status and role filters and gets users as views', async () => {
    const { users, useCases } = setup();
    const result = await useCases.list({ status: 'active', roleId: 'role-ventas' });

    expect(result).toMatchObject({ total: 2, paged: false });
    expect(typeof result.items[0]?.lastAccessAt).toBe('string');
    expect(users.lastCriteria).toMatchObject({ status: 'active', roleId: 'role-ventas' });
    await expect(useCases.list({ page: 2 })).resolves.toMatchObject({ paged: true });
    await expect(useCases.get('usr-ventas')).resolves.toMatchObject({ lastAccessAt: '' });
    await expect(useCases.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('creates a user with a hashed password', async () => {
    const { users, unseen, audit, useCases } = setup();
    const created = await useCases.create(
      { name: 'Luis', email: 'Luis@ERP.pe', roleId: 'role-ventas', password: 'secreto-123' },
      ADMIN,
    );

    expect(created).toMatchObject({ id: 'usr-1', email: 'luis@erp.pe', roleName: 'Ventas' });
    expect(users.hashes.get('usr-1')).toBe('h:secreto-123');
    expect(unseen.created).toEqual(['usuarios/usr-1 by admin']);
    expect(audit.actions()).toEqual([`${CREATED_ACTION} Luis`]);
  });

  it('rejects a weak password on create', async () => {
    const { users, useCases } = setup();
    await expect(
      useCases.create({ name: 'Luis', email: 'luis@erp.pe', roleId: 'role-ventas' }, ADMIN),
    ).rejects.toBeInstanceOf(BusinessError);
    expect(users.rows.size).toBe(2);
  });

  it('updates another user and revokes sessions when deactivating', async () => {
    const { sessions, audit, useCases } = setup();
    await expect(
      useCases.update('usr-ventas', { name: 'Vendedora' }, ADMIN),
    ).resolves.toMatchObject({ name: 'Vendedora', email: 'ventas@erp.pe' });
    expect(sessions.revoked).toEqual([]);

    await useCases.update('usr-ventas', { status: 'inactive' }, ADMIN);
    expect(sessions.revoked).toEqual(['usr-ventas']);
    expect(audit.actions()).toEqual([`${UPDATED_ACTION} Vendedora`, `${UPDATED_ACTION} Vendedora`]);
  });

  it('guards self updates and duplicate emails', async () => {
    const { useCases } = setup();
    await expect(useCases.update('admin', { roleId: 'role-ventas' }, ADMIN)).rejects.toThrow(
      SELF_ROLE_CHANGE,
    );
    await expect(useCases.update('admin', { status: 'inactive' }, ADMIN)).rejects.toThrow(
      SELF_DEACTIVATION,
    );
    await expect(useCases.update('usr-ventas', { email: 'admin@erp.pe' }, ADMIN)).rejects.toThrow(
      'Ya existe un usuario con ese correo.',
    );
    await expect(useCases.update('nope', {}, ADMIN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removes a user without operations', async () => {
    const { users, unseen, audit, useCases } = setup();
    await useCases.remove('usr-ventas', ADMIN);

    expect(users.rows.has('usr-ventas')).toBe(false);
    expect(unseen.forgotten).toEqual(['usuarios/usr-ventas']);
    expect(audit.actions()).toEqual([`${REMOVED_ACTION} Vendedor`]);
  });

  it('keeps users with operations and the acting user', async () => {
    const { users, useCases } = setup();
    users.audits.set('usr-ventas', 4);
    await expect(useCases.remove('usr-ventas', ADMIN)).rejects.toThrow(USER_HAS_AUDITS);
    await expect(useCases.remove('admin', ADMIN)).rejects.toThrow(SELF_REMOVAL);
    await expect(useCases.remove('nope', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deactivates and reactivates through actions', async () => {
    const { sessions, audit, useCases } = setup();
    await expect(useCases.runAction('usr-ventas', 'deactivate', ADMIN)).resolves.toMatchObject({
      status: 'inactive',
    });
    expect(sessions.revoked).toEqual(['usr-ventas']);
    await expect(useCases.runAction('usr-ventas', 'deactivate', ADMIN)).rejects.toThrow(
      'El registro ya está inactivo.',
    );

    await expect(useCases.runAction('usr-ventas', 'activate', ADMIN)).resolves.toMatchObject({
      status: 'active',
    });
    expect(sessions.revoked).toEqual(['usr-ventas']);
    expect(audit.actions()).toEqual(['Desactivó Vendedor', 'Activó Vendedor']);
  });

  it('rejects self deactivation and unknown actions', async () => {
    const { useCases } = setup();
    await expect(useCases.runAction('admin', 'deactivate', ADMIN)).rejects.toThrow(
      SELF_DEACTIVATION,
    );
    await expect(useCases.runAction('admin', 'activate', ADMIN)).rejects.toThrow(
      'El registro ya está activo.',
    );
    await expect(useCases.runAction('admin', 'archive', ADMIN)).rejects.toThrow(UNKNOWN_ACTION);
  });

  it('resets a password and ends the sessions', async () => {
    const { users, sessions, audit, useCases } = setup();
    await useCases.resetPassword('usr-ventas', { password: 'nuevo-secreto-1' }, ADMIN);

    expect(users.hashes.get('usr-ventas')).toBe('h:nuevo-secreto-1');
    expect(sessions.revoked).toEqual(['usr-ventas']);
    expect(audit.actions()).toEqual([`${PASSWORD_RESET_ACTION} Vendedor`]);
    await expect(
      useCases.resetPassword('usr-ventas', { password: 'corta' }, ADMIN),
    ).rejects.toBeInstanceOf(BusinessError);
  });
});

import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { MODULE_IDS } from '../../../shared/domain/module-id';
import { formatLimaDateTime } from '../../../shared/domain/time/lima-time';
import { type AuditRecord, toAuditView } from './audit-record';
import { AUDIT_LOG_REPOSITORY } from './ports/audit-log.repository';
import { ROLE_REPOSITORY } from './ports/role.repository';
import { SETTINGS_REPOSITORY } from './ports/settings.repository';
import { UNSEEN_QUERY } from './ports/unseen-query';
import { USER_REPOSITORY } from './ports/user.repository';
import type { RoleRecord } from './role';
import {
  assertRoleEditable,
  assertRoleRemovable,
  normalizePermissions,
  type RoleLookups,
  roleValues,
} from './role-rules';
import { type SettingsInput, validateSettings } from './settings';
import { toUserView, type UserRecord } from './user';
import {
  assertCanDeactivate,
  assertCanRemoveUser,
  assertOwnUserUpdate,
  SELF_DEACTIVATION,
  SELF_REMOVAL,
  SELF_ROLE_CHANGE,
  USER_HAS_AUDITS,
  type UserLookups,
  userValues,
} from './user-rules';

const noneEverywhere = Object.fromEntries(MODULE_IDS.map((id) => [id, 'none']));

describe('role rules', () => {
  const lookups = (taken: string[]): RoleLookups & { calls: unknown[][] } => {
    const calls: unknown[][] = [];
    return {
      calls,
      isNameTaken(name: string, exceptId?: string): Promise<boolean> {
        calls.push([name, exceptId]);
        return Promise.resolve(taken.includes(name));
      },
    };
  };

  it('fills every module, defaulting to none', () => {
    expect(normalizePermissions({ comercial: 'write', otro: 'write' })).toEqual({
      ...noneEverywhere,
      comercial: 'write',
    });
    expect(normalizePermissions(null)).toEqual(noneEverywhere);
    expect(normalizePermissions('read')).toEqual(noneEverywhere);
  });

  it('rejects an unknown access level', () => {
    expect(() => normalizePermissions({ comercial: 'admin' })).toThrow(
      'El nivel de acceso no es válido.',
    );
  });

  it('builds the role values and checks the name against other roles', async () => {
    const lookup = lookups([]);
    await expect(
      roleValues({ name: '  Caja ', description: ' Turno ', permissions: {} }, lookup, 'r9'),
    ).resolves.toEqual({ name: 'Caja', description: 'Turno', permissions: noneEverywhere });
    expect(lookup.calls).toEqual([['Caja', 'r9']]);
  });

  it('requires a unique name', async () => {
    await expect(roleValues({ name: ' ' }, lookups([]))).rejects.toThrow(
      'Escribe el nombre del rol.',
    );
    await expect(roleValues({ name: 'Ventas' }, lookups(['Ventas']))).rejects.toThrow(
      'Ya existe un rol con ese nombre.',
    );
  });

  const role: RoleRecord = {
    id: 'r1',
    name: 'Ventas',
    description: '',
    permissions: normalizePermissions({}),
    system: false,
  };

  it('protects system roles', () => {
    expect(() => {
      assertRoleEditable(role);
    }).not.toThrow();
    expect(() => {
      assertRoleEditable({ ...role, system: true });
    }).toThrow('Los roles del sistema no se modifican; crea uno nuevo.');
    expect(() => {
      assertRoleRemovable({ ...role, system: true }, 0);
    }).toThrow('Los roles del sistema no se eliminan.');
  });

  it('only removes roles without users', () => {
    expect(() => {
      assertRoleRemovable(role, 0);
    }).not.toThrow();
    expect(() => {
      assertRoleRemovable(role, 2);
    }).toThrow('El rol tiene usuarios; asígnales otro rol antes de eliminarlo.');
  });
});

describe('settings', () => {
  const valid: SettingsInput = {
    companyName: ' Andes Tech SAC ',
    ruc: '20123456789',
    address: 'Av. Lima 123',
    phone: '',
    email: 'ventas@andes.pe',
    igvRate: 0.18,
    invoiceSeries: 'f001',
    receiptSeries: 'B001',
    creditNoteSeries: 'FC01',
    quoteValidityDays: 15,
  };

  it('normalizes valid settings', () => {
    expect(validateSettings(valid)).toEqual({
      ...valid,
      companyName: 'Andes Tech SAC',
      invoiceSeries: 'F001',
    });
  });

  it.each<[SettingsInput, string]>([
    [{ ruc: '2012345678' }, 'El RUC debe tener 11 dígitos.'],
    [{ ruc: undefined }, 'El RUC debe tener 11 dígitos.'],
    [{ igvRate: 0.6 }, 'El IGV debe estar entre 0 % y 50 %.'],
    [{ igvRate: '0.18' }, 'El IGV debe estar entre 0 % y 50 %.'],
    [{ igvRate: Number.NaN }, 'El IGV debe estar entre 0 % y 50 %.'],
    [{ quoteValidityDays: 0 }, 'La vigencia de las cotizaciones debe estar entre 1 y 365 días.'],
    [{ quoteValidityDays: 1.5 }, 'La vigencia de las cotizaciones debe estar entre 1 y 365 días.'],
    [{ companyName: '' }, 'Escribe la razón social.'],
    [{ invoiceSeries: '1001' }, 'La serie de facturas debe tener 4 caracteres'],
    [{ receiptSeries: 'B01' }, 'La serie de boletas debe tener 4 caracteres'],
    [{ creditNoteSeries: undefined }, 'La serie de notas de crédito debe tener 4 caracteres'],
    [{ receiptSeries: 'F001' }, 'Cada tipo de comprobante necesita una serie distinta.'],
  ])('rejects %p', (patch, message) => {
    expect(() => validateSettings({ ...valid, ...patch })).toThrow(message);
  });
});

describe('user rules', () => {
  const lookups: UserLookups = {
    isEmailTaken: (email, exceptId) =>
      Promise.resolve(email === 'tomado@erp.pe' && exceptId !== 'u2'),
    findRoleName: (roleId) => Promise.resolve(roleId === 'r1' ? 'Ventas' : null),
  };
  const input = { name: ' Ana ', email: ' Ana@ERP.pe ', roleId: 'r1' };

  it('builds the user values with the role name', async () => {
    await expect(userValues(input, lookups)).resolves.toEqual({
      name: 'Ana',
      email: 'ana@erp.pe',
      roleId: 'r1',
      roleName: 'Ventas',
      status: 'active',
    });
    await expect(
      userValues({ ...input, email: 'tomado@erp.pe', status: 'inactive' }, lookups, 'u2'),
    ).resolves.toMatchObject({ status: 'inactive' });
  });

  it.each<[Record<string, unknown>, string]>([
    [{ email: '' }, 'Escribe el correo.'],
    [{ email: 'ana@' }, 'El correo no es válido.'],
    [{ email: 'tomado@erp.pe' }, 'Ya existe un usuario con ese correo.'],
    [{ roleId: 7 }, 'Selecciona el rol.'],
    [{ roleId: '' }, 'Selecciona el rol.'],
    [{ roleId: 'r404' }, 'Selecciona el rol.'],
    [{ name: '' }, 'Escribe el nombre.'],
    [{ status: 'borrado' }, 'El estado no es válido.'],
  ])('rejects %p', async (patch, message) => {
    await expect(userValues({ ...input, ...patch }, lookups)).rejects.toThrow(message);
  });

  const current: UserRecord = {
    id: 'u1',
    name: 'Ana',
    email: 'ana@erp.pe',
    roleId: 'r1',
    roleName: 'Ventas',
    status: 'active',
    lastAccessAt: null,
  };
  const next = { ...current };

  it('stops users from changing their own role or deactivating themselves', () => {
    expect(() => {
      assertOwnUserUpdate(current, next, 'u1');
    }).not.toThrow();
    expect(() => {
      assertOwnUserUpdate(current, { ...next, roleId: 'r2' }, 'u1');
    }).toThrow(SELF_ROLE_CHANGE);
    expect(() => {
      assertOwnUserUpdate(current, { ...next, status: 'inactive' }, 'u1');
    }).toThrow(SELF_DEACTIVATION);
    expect(() => {
      assertOwnUserUpdate(current, { ...next, roleId: 'r2', status: 'inactive' }, 'admin');
    }).not.toThrow();
  });

  it('guards deactivation and removal', () => {
    expect(() => {
      assertCanDeactivate('u1', 'admin');
    }).not.toThrow();
    expect(() => {
      assertCanDeactivate('u1', 'u1');
    }).toThrow(SELF_DEACTIVATION);
    expect(() => {
      assertCanRemoveUser('u1', 'admin', 0);
    }).not.toThrow();
    expect(() => {
      assertCanRemoveUser('u1', 'u1', 0);
    }).toThrow(SELF_REMOVAL);
    expect(() => {
      assertCanRemoveUser('u1', 'admin', 3);
    }).toThrow(USER_HAS_AUDITS);
    expect(() => {
      assertCanRemoveUser('u1', 'admin', 3);
    }).toThrow(BusinessError);
  });

  it('formats the last access for the view', () => {
    const at = new Date('2026-03-10T15:45:00Z');
    expect(toUserView(current).lastAccessAt).toBe('');
    expect(toUserView({ ...current, lastAccessAt: at })).toEqual({
      ...current,
      lastAccessAt: formatLimaDateTime(at),
    });
  });
});

describe('audit record', () => {
  it('formats the date in Lima time', () => {
    const entry: AuditRecord = {
      id: 'a1',
      date: new Date('2026-03-10T15:45:00Z'),
      userName: 'Ana',
      module: 'administracion',
      resource: 'usuarios',
      action: 'Registró',
      reference: 'Luis',
    };
    expect(toAuditView(entry)).toEqual({ ...entry, date: formatLimaDateTime(entry.date) });
  });
});

describe('administration ports', () => {
  it('exposes unique injection tokens', () => {
    const tokens = [
      AUDIT_LOG_REPOSITORY,
      ROLE_REPOSITORY,
      SETTINGS_REPOSITORY,
      UNSEEN_QUERY,
      USER_REPOSITORY,
    ];
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});

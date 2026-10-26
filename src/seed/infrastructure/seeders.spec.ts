import type { PasswordHasher } from '../../shared/domain/ports/password-hasher.port';
import { MODULE_IDS } from '../../shared/domain/module-id';
import type { PrismaTransactionHost } from '../../shared/infrastructure/prisma/prisma-transaction-host';
import { BootstrapConfigError, type BootstrapVariable, type EnvReader } from '../bootstrap-values';
import { BASE_ROLES } from '../roles.data';
import { InitialAdminSeeder } from './initial-admin.seeder';
import { RolesSeeder } from './roles.seeder';
import { SettingsSeeder } from './settings.seeder';

interface PermissionRow {
  roleId: string;
  module: string;
  access: string;
}

function fakeClient(counts: { users?: number; settings?: number } = {}) {
  return {
    role: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    rolePermission: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    settings: {
      count: jest.fn().mockResolvedValue(counts.settings ?? 0),
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      count: jest.fn().mockResolvedValue(counts.users ?? 0),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

const hostOf = (client: ReturnType<typeof fakeClient>) =>
  ({ client }) as unknown as PrismaTransactionHost;

const reader =
  (values: Partial<Record<BootstrapVariable, string>>): EnvReader =>
  (key) =>
    values[key];

const ENV = reader({
  INITIAL_ADMIN_NAME: 'Administrador',
  INITIAL_ADMIN_EMAIL: 'Admin@Empresa.pe',
  INITIAL_ADMIN_PASSWORD: 'una-clave-segura',
  COMPANY_NAME: 'Mi Empresa S.A.C.',
  COMPANY_RUC: '20000000001',
});

const hash = jest.fn<Promise<string>, [string]>().mockResolvedValue('hashed');
const hasher = { hash, verify: jest.fn() } as unknown as PasswordHasher;

beforeEach(() => jest.clearAllMocks());

describe('RolesSeeder', () => {
  it('creates the system roles and the full matrix, keeping existing rows', async () => {
    const client = fakeClient();

    await new RolesSeeder(hostOf(client)).run();

    const [roles] = client.role.createMany.mock.calls[0] as [
      { data: { id: string }[]; skipDuplicates: boolean },
    ];
    expect(roles.skipDuplicates).toBe(true);
    expect(roles.data.map((role) => role.id)).toEqual([
      'role-admin',
      'role-ventas',
      'role-compras',
      'role-tesoreria',
      'role-consulta',
    ]);

    const [matrix] = client.rolePermission.createMany.mock.calls[0] as [
      { data: PermissionRow[]; skipDuplicates: boolean },
    ];
    expect(matrix.skipDuplicates).toBe(true);
    expect(matrix.data).toHaveLength(BASE_ROLES.length * MODULE_IDS.length);
    const access = (roleId: string, module: string) =>
      matrix.data.find((row) => row.roleId === roleId && row.module === module)?.access;
    expect(access('role-admin', 'administracion')).toBe('write');
    expect(access('role-ventas', 'comercial')).toBe('write');
    expect(access('role-ventas', 'compras')).toBe('none');
    expect(access('role-consulta', 'tesoreria')).toBe('read');
    expect(access('role-consulta', 'administracion')).toBe('none');
  });
});

describe('SettingsSeeder', () => {
  it('keeps an existing settings row', async () => {
    const client = fakeClient({ settings: 1 });

    await new SettingsSeeder(hostOf(client), reader({})).run();

    expect(client.settings.create).not.toHaveBeenCalled();
  });

  it('creates the row from COMPANY_* with the defaults', async () => {
    const client = fakeClient();

    await new SettingsSeeder(hostOf(client), ENV).run();

    expect(client.settings.create).toHaveBeenCalledWith({
      data: {
        id: 1,
        companyName: 'Mi Empresa S.A.C.',
        ruc: '20000000001',
        igvRate: '0.18',
        invoiceSeries: 'F001',
        receiptSeries: 'B001',
        creditNoteSeries: 'FC01',
        quoteValidityDays: 15,
      },
    });
  });

  it('fails when the row is missing and COMPANY_* is not set', async () => {
    await expect(new SettingsSeeder(hostOf(fakeClient()), reader({})).run()).rejects.toThrow(
      BootstrapConfigError,
    );
  });
});

describe('InitialAdminSeeder', () => {
  it('does nothing once any user exists, so no password is overwritten', async () => {
    const client = fakeClient({ users: 3 });

    await new InitialAdminSeeder(hostOf(client), hasher, reader({})).run();

    expect(hash).not.toHaveBeenCalled();
    expect(client.user.create).not.toHaveBeenCalled();
  });

  it('creates the administrator with the admin role and a hashed password', async () => {
    const client = fakeClient();

    await new InitialAdminSeeder(hostOf(client), hasher, ENV).run();

    expect(hash).toHaveBeenCalledWith('una-clave-segura');
    expect(client.user.create).toHaveBeenCalledWith({
      data: {
        name: 'Administrador',
        email: 'admin@empresa.pe',
        roleId: 'role-admin',
        passwordHash: 'hashed',
      },
    });
  });

  it('fails when there are no users and INITIAL_ADMIN_* is not set', async () => {
    const client = fakeClient();

    await expect(new InitialAdminSeeder(hostOf(client), hasher, reader({})).run()).rejects.toThrow(
      BootstrapConfigError,
    );
    expect(client.user.create).not.toHaveBeenCalled();
  });
});

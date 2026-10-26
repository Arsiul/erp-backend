import { JwtService } from '@nestjs/jwt';
import { ApiClient, expectStatus } from './support/ciclos/api-client';
import { MasterFixtures } from './support/ciclos/masters';
import { API, bodyOf, type Credentials, E2eContext, type FixtureRole } from './support/e2e-context';

/*
 * Expected behaviour from the frontend: role matrix in mocks/seed/base.ts 40-92, resource →
 * module in types/resources.ts 71-98, messages in services/session.service.ts 188-198,
 * capabilities in services/resources.service.ts 96-101 and filtered alerts in
 * services/alerts.service.ts 140-150.
 */

type Operation = 'read' | 'write';

interface Probe {
  readonly path: string;
  readonly operation: Operation;
}

interface Capabilities {
  readonly create: boolean;
  readonly update: boolean;
  readonly remove: boolean;
  readonly actions: readonly { readonly id: string }[];
}

interface Session {
  readonly permissions: Record<string, string>;
  readonly capabilities: Record<string, Capabilities>;
}

interface Alert {
  readonly id: string;
}

const NO_ACCESS = 'Tu rol no tiene acceso a este módulo.';
const READ_ONLY = 'Tu rol solo permite consultar este módulo.';
const SESSION_ENDED = 'Tu sesión terminó. Vuelve a iniciar sesión.';

/** One read and one write per module; the guard answers before the body is validated. */
const PROBES: Readonly<Record<string, readonly Probe[]>> = {
  maestros: [
    { path: '/clientes', operation: 'read' },
    { path: '/clientes', operation: 'write' },
  ],
  comercial: [
    { path: '/ventas', operation: 'read' },
    { path: '/cotizaciones', operation: 'write' },
  ],
  compras: [
    { path: '/ordenes-compra', operation: 'read' },
    { path: '/recepciones', operation: 'write' },
  ],
  inventario: [
    { path: '/kardex', operation: 'read' },
    { path: '/ajustes', operation: 'write' },
  ],
  tesoreria: [
    { path: '/movimientos', operation: 'read' },
    { path: '/movimientos', operation: 'write' },
  ],
  documentos: [
    { path: '/documentos', operation: 'read' },
    { path: '/documentos', operation: 'write' },
  ],
  administracion: [
    { path: '/usuarios', operation: 'read' },
    { path: '/roles', operation: 'write' },
  ],
};

/** mocks/seed/base.ts 40-92. */
const MATRIX: Readonly<Record<Exclude<FixtureRole, 'role-admin'>, Record<string, string>>> = {
  'role-ventas': {
    maestros: 'read',
    comercial: 'write',
    compras: 'none',
    inventario: 'read',
    tesoreria: 'none',
    documentos: 'write',
    reportes: 'read',
    administracion: 'none',
  },
  'role-compras': {
    maestros: 'write',
    comercial: 'none',
    compras: 'write',
    inventario: 'write',
    tesoreria: 'none',
    documentos: 'write',
    reportes: 'read',
    administracion: 'none',
  },
  'role-tesoreria': {
    maestros: 'read',
    comercial: 'read',
    compras: 'read',
    inventario: 'none',
    tesoreria: 'write',
    documentos: 'read',
    reportes: 'read',
    administracion: 'none',
  },
  'role-consulta': {
    maestros: 'read',
    comercial: 'read',
    compras: 'read',
    inventario: 'read',
    tesoreria: 'read',
    documentos: 'read',
    reportes: 'read',
    administracion: 'none',
  },
};

const ROLES = Object.keys(MATRIX) as (keyof typeof MATRIX)[];

/** session.service.ts 191-196: a write is refused as read-only even when the module is hidden. */
const refusal = (level: string, operation: Operation): string | null => {
  if (operation === 'write') {
    return level === 'write' ? null : READ_ONLY;
  }
  return level === 'none' ? NO_ACCESS : null;
};

jest.setTimeout(120_000);

describe('Permisos por rol (e2e)', () => {
  let ctx: E2eContext;
  let admin: ApiClient;
  const clients = new Map<string, ApiClient>();

  const me = (token: string) =>
    ctx.http.get(`${API}/auth/me`).set('Authorization', `Bearer ${token}`);
  const refresh = (cookie: string) => ctx.http.post(`${API}/auth/refresh`).set('Cookie', cookie);

  beforeAll(async () => {
    ctx = await E2eContext.start();
    admin = new ApiClient(ctx, await ctx.tokenFor('role-admin'));
    for (const role of ROLES) {
      clients.set(role, new ApiClient(ctx, await ctx.tokenFor(role)));
    }
  });

  afterAll(async () => {
    await ctx.close();
  });

  const client = (role: string): ApiClient => {
    const api = clients.get(role);
    if (api === undefined) {
      throw new Error(`No se encontró el cliente de ${role}.`);
    }
    return api;
  };

  it.each(ROLES)('applies the module matrix of %s with the frontend messages', async (role) => {
    const api = client(role);
    const session = bodyOf<Session>(await expectStatus(me(api.token), 200));
    expect(session.permissions).toEqual(MATRIX[role]);

    for (const [module, probes] of Object.entries(PROBES)) {
      const level = MATRIX[role][module] ?? 'none';
      for (const probe of probes) {
        const expected = refusal(level, probe.operation);
        const request = probe.operation === 'read' ? api.get(probe.path) : api.post(probe.path, {});
        const response = await request;
        if (expected === null) {
          expect([module, probe.path, response.status]).not.toEqual([module, probe.path, 403]);
          expect(response.status).toBeLessThan(500);
        } else {
          expect([module, probe.path, response.status, response.body]).toEqual([
            module,
            probe.path,
            403,
            { statusCode: 403, code: 'FORBIDDEN', message: expected },
          ]);
        }
      }
    }
  });

  it.each(ROLES)('hides every capability %s cannot write', async (role) => {
    const { capabilities } = bodyOf<Session>(await expectStatus(me(client(role).token), 200));
    const none = { create: false, update: false, remove: false, actions: [] };
    const writes = (module: string): boolean => MATRIX[role][module] === 'write';

    expect(capabilities['clientes']).toEqual(
      writes('maestros')
        ? { create: true, update: true, remove: true, actions: expect.any(Array) as unknown[] }
        : none,
    );
    expect(capabilities['ventas']).toEqual(
      writes('comercial')
        ? { create: true, update: true, remove: false, actions: [{ id: 'cancel', label: 'Anuló' }] }
        : none,
    );
    expect(capabilities['ordenes-compra']?.actions.map((action) => action.id) ?? []).toEqual(
      writes('compras') ? ['approve', 'cancel'] : [],
    );
    expect(capabilities['movimientos']?.actions.map((action) => action.id) ?? []).toEqual(
      writes('tesoreria') ? ['void'] : [],
    );
    expect(capabilities['usuarios']).toEqual(none);
    expect(capabilities['cuentas-cobrar']).toEqual(none);
  });

  it('filters the alerts to the modules each role can read', async () => {
    const masters = new MasterFixtures(admin);
    const warehouse = await masters.warehouse();
    const category = await masters.category();
    const stocked = await masters.product(category.id, { salePrice: 20, costPrice: 8 });
    await masters.stock(stocked.id, warehouse.id, 50);
    const scarce = await admin.create<{ id: string }>('productos', {
      sku: `SKU-MIN-${String(Date.now()).slice(-6)}`,
      name: 'Producto bajo el mínimo',
      categoryId: category.id,
      unit: 'und',
      salePrice: 10,
      costPrice: 4,
      minStock: 5,
    });
    await masters.stock(scarce.id, warehouse.id, 2);
    const customer = await masters.customerWithRuc(30, 5000);
    const supplier = await masters.supplier(30);

    await admin.create('ventas', {
      customerId: customer.id,
      warehouseId: warehouse.id,
      seller: 'Luis Vendedor',
      lines: [{ productId: stocked.id, quantity: 1 }],
    });
    const order = await admin.create<{ id: string }>('ordenes-compra', {
      supplierId: supplier.id,
      warehouseId: warehouse.id,
      lines: [{ productId: stocked.id, quantity: 2, unitPrice: 8 }],
    });
    await admin.act('ordenes-compra', order.id, 'approve');
    await admin.create('recepciones', {
      purchaseOrderId: order.id,
      guideNumber: 'T001-000555',
      lines: [{ productId: stocked.id, quantity: 2 }],
    });

    const watched = ['sales-to-invoice', 'receipts-to-bill', 'stock-critical'];
    const seen = async (api: ApiClient): Promise<string[]> =>
      (await api.list<Alert>('/alerts'))
        .map((alert) => alert.id)
        .filter((id) => watched.includes(id))
        .sort();

    expect(await seen(admin)).toEqual(['receipts-to-bill', 'sales-to-invoice', 'stock-critical']);
    expect(await seen(client('role-ventas'))).toEqual(['sales-to-invoice', 'stock-critical']);
    expect(await seen(client('role-compras'))).toEqual(['receipts-to-bill', 'stock-critical']);
    expect(await seen(client('role-tesoreria'))).toEqual(['receipts-to-bill', 'sales-to-invoice']);
    expect(await seen(client('role-consulta'))).toEqual([
      'receipts-to-bill',
      'sales-to-invoice',
      'stock-critical',
    ]);
  });

  it('answers 401 without a token, with an expired, a foreign or an orphan one', async () => {
    const jwt = ctx.app.get(JwtService);
    const user: Credentials = await ctx.createUser('role-ventas');
    const anHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const expired = await jwt.signAsync(
      { sub: user.id, rid: 'role-ventas', iat: anHourAgo },
      { expiresIn: 60 },
    );
    const foreign = await jwt.signAsync(
      { sub: user.id, rid: 'role-ventas' },
      { expiresIn: 600, secret: 'una-clave-que-no-es-la-del-servidor' },
    );
    const orphan = await jwt.signAsync(
      { sub: '00000000-0000-4000-8000-000000000000', rid: 'role-admin' },
      { expiresIn: 600 },
    );
    const unauthorized = { statusCode: 401, code: 'UNAUTHORIZED', message: SESSION_ENDED };

    expect(bodyOf(await expectStatus(ctx.http.get(`${API}/ventas`), 401))).toEqual(unauthorized);
    for (const token of [expired, foreign, orphan, 'no-es-un-jwt']) {
      expect(bodyOf(await expectStatus(new ApiClient(ctx, token).get('/ventas'), 401))).toEqual(
        unauthorized,
      );
    }
    const valid = await jwt.signAsync({ sub: user.id, rid: 'role-ventas' }, { expiresIn: 600 });
    await expectStatus(new ApiClient(ctx, valid).get('/ventas'), 200);
  });

  it('revokes the session on logout, on deactivation and on a permission change', async () => {
    const role = await admin.create<{ id: string }>('roles', {
      name: `Rol temporal ${String(Date.now()).slice(-6)}`,
      description: 'Rol creado por la prueba de permisos',
      permissions: { comercial: 'write' },
    });
    const password = 'clave-temporal-9';
    const user = await admin.create<{ id: string; email: string }>('usuarios', {
      name: 'Usuaria Temporal',
      email: `temporal-${String(Date.now()).slice(-6)}@e2e.test`,
      roleId: role.id,
      password,
    });

    const first = await ctx.signIn({ email: user.email, password });
    await expectStatus(ctx.http.post(`${API}/auth/logout`).set('Cookie', first.cookie), 204);
    expect(bodyOf(await expectStatus(refresh(first.cookie), 401))).toMatchObject({
      code: 'UNAUTHORIZED',
    });

    const second = await ctx.signIn({ email: user.email, password });
    const api = new ApiClient(ctx, second.token);
    await expectStatus(api.get('/ventas'), 200);
    await expectStatus(
      admin.patch(`/roles/${role.id}`, { permissions: { comercial: 'read' } }),
      200,
    );
    expect((await api.rejected(api.post('/ventas', {}), 403)).message).toBe(READ_ONLY);
    await expectStatus(
      admin.patch(`/roles/${role.id}`, { permissions: { comercial: 'none' } }),
      200,
    );
    expect((await api.rejected(api.get('/ventas'), 403)).message).toBe(NO_ACCESS);

    await admin.act('usuarios', user.id, 'deactivate');
    expect(bodyOf(await expectStatus(me(second.token), 401))).toEqual({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: SESSION_ENDED,
    });
    await expectStatus(refresh(second.cookie), 401);
  });
});

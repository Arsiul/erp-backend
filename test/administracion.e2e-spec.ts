import { randomUUID } from 'node:crypto';
import { API, BOOTSTRAP, bodyOf, E2eContext, runSeed } from './support/e2e-context';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

interface UserBody {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  status: string;
  lastAccessAt: string;
}

interface RoleBody {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, string>;
  system: boolean;
}

interface AuditBody {
  id: string;
  date: string;
  userName: string;
  module: string;
  resource: string;
  action: string;
  reference: string;
}

interface Capabilities {
  create: boolean;
  update: boolean;
  remove: boolean;
  actions: { id: string; label: string }[];
}

const bearer = (token: string) => `Bearer ${token}`;

describe('Administración (e2e)', () => {
  let ctx: E2eContext;
  let admin: string;
  let adminId: string;

  beforeAll(async () => {
    ctx = await E2eContext.start();
    admin = (await ctx.signIn(ctx.admin)).token;
    const me = await ctx.http.get(`${API}/auth/me`).set('Authorization', bearer(admin));
    adminId = bodyOf<{ user: { id: string } }>(me).user.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const get = (path: string, token = admin) =>
    ctx.http.get(`${API}${path}`).set('Authorization', bearer(token));
  const post = (path: string, body: object = {}, token = admin) =>
    ctx.http.post(`${API}${path}`).set('Authorization', bearer(token)).send(body);
  const patch = (path: string, body: object, token = admin) =>
    ctx.http.patch(`${API}${path}`).set('Authorization', bearer(token)).send(body);
  const put = (path: string, body: object, token = admin) =>
    ctx.http.put(`${API}${path}`).set('Authorization', bearer(token)).send(body);
  const remove = (path: string, token = admin) =>
    ctx.http.delete(`${API}${path}`).set('Authorization', bearer(token));

  const newUser = (overrides: object = {}, token = admin) =>
    post(
      '/usuarios',
      {
        name: 'Lucía Paredes',
        email: `lucia-${randomUUID().slice(0, 8)}@e2e.test`,
        roleId: 'role-ventas',
        password: 'clave-inicial-1',
        ...overrides,
      },
      token,
    );

  describe('authorization', () => {
    it('requires a token', async () => {
      for (const path of ['/usuarios', '/roles', '/auditoria', '/settings', '/capabilities']) {
        const response = await ctx.http.get(`${API}${path}`).expect(401);
        expect(bodyOf<ErrorBody>(response).code).toBe('UNAUTHORIZED');
      }
    });

    it('requires the permission of the resource', async () => {
      const ventas = await ctx.tokenFor('role-ventas');
      const consulta = await ctx.tokenFor('role-consulta');

      const forbidden = await get('/usuarios', ventas).expect(403);
      expect(bodyOf<ErrorBody>(forbidden)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
      await get('/roles', consulta).expect(403);
      await get('/auditoria', ventas).expect(403);
      await post('/usuarios', {}, consulta).expect(403);
      await put('/settings', {}, ventas).expect(403);
      await put('/settings', {}, consulta).expect(403);
    });

    it('lets every signed-in user read the settings', async () => {
      await get('/settings', await ctx.tokenFor('role-consulta')).expect(200);
    });
  });

  describe('/usuarios', () => {
    it('creates a user without exposing the password', async () => {
      const response = await newUser({ email: 'Nueva.Usuaria@E2E.test' }).expect(201);

      const body = bodyOf<UserBody>(response);
      expect(typeof body.id).toBe('string');
      expect(body).toEqual({
        id: body.id,
        name: 'Lucía Paredes',
        email: 'nueva.usuaria@e2e.test',
        roleId: 'role-ventas',
        roleName: 'Ventas',
        status: 'active',
        lastAccessAt: '',
      });
      await ctx.login('nueva.usuaria@e2e.test', 'clave-inicial-1').expect(200);
    });

    it('rejects a duplicate email, a missing password and a short one', async () => {
      const email = `dup-${randomUUID().slice(0, 8)}@e2e.test`;
      await newUser({ email }).expect(201);

      const duplicate = await newUser({ email: email.toUpperCase() }).expect(422);
      expect(bodyOf<ErrorBody>(duplicate).message).toBe('Ya existe un usuario con ese correo.');

      await newUser({ password: undefined }).expect(422);
      const short = await newUser({ password: 'corta' }).expect(422);
      expect(bodyOf<ErrorBody>(short).message).toBe(
        'La contraseña debe tener al menos 8 caracteres.',
      );

      const badEmail = await newUser({ email: 'no-es-correo' }).expect(422);
      expect(bodyOf<ErrorBody>(badEmail).message).toBe('El correo no es válido.');
      await newUser({ roleId: 'role-inexistente' }).expect(422);
    });

    it('lists, searches and pages', async () => {
      const marker = `buscable-${randomUUID().slice(0, 8)}`;
      await newUser({ name: `Persona ${marker}` }).expect(201);
      await newUser({ name: `Persona ${marker} dos` }).expect(201);

      const all = await get('/usuarios').expect(200);
      expect(bodyOf<UserBody[]>(all).length).toBeGreaterThanOrEqual(3);
      expect(all.headers['x-total-count']).toBeUndefined();

      const found = await get(`/usuarios?q=${marker}`).expect(200);
      expect(bodyOf<UserBody[]>(found)).toHaveLength(2);

      const page = await get(`/usuarios?q=${marker}&page=2&pageSize=1`).expect(200);
      expect(bodyOf<UserBody[]>(page)).toHaveLength(1);
      expect(page.headers['x-total-count']).toBe('2');

      const invalid = await get('/usuarios?status=borrado').expect(400);
      expect(bodyOf<ErrorBody>(invalid).code).toBe('VALIDATION_ERROR');
    });

    it('reads one user and answers 404 for an unknown id', async () => {
      const created = bodyOf<UserBody>(await newUser().expect(201));

      const found = await get(`/usuarios/${created.id}`).expect(200);
      expect(bodyOf<UserBody>(found).email).toBe(created.email);

      const missing = await get(`/usuarios/${randomUUID()}`).expect(404);
      expect(bodyOf<ErrorBody>(missing).code).toBe('NOT_FOUND');
    });

    it('updates a user and ignores the derived fields', async () => {
      const created = bodyOf<UserBody>(await newUser().expect(201));

      const response = await patch(`/usuarios/${created.id}`, {
        name: 'Nombre Cambiado',
        roleId: 'role-compras',
        roleName: 'Ignorado',
        lastAccessAt: '2020-01-01T00:00',
      }).expect(200);

      expect(bodyOf<UserBody>(response)).toMatchObject({
        name: 'Nombre Cambiado',
        roleId: 'role-compras',
        roleName: 'Compras y almacén',
        lastAccessAt: '',
      });
    });

    it('does not let the administrator change or deactivate itself', async () => {
      const role = await patch(`/usuarios/${adminId}`, { roleId: 'role-ventas' }).expect(422);
      expect(bodyOf<ErrorBody>(role).message).toBe('No puedes cambiar tu propio rol.');

      const deactivate = await post(`/usuarios/${adminId}/deactivate`).expect(422);
      expect(bodyOf<ErrorBody>(deactivate).message).toBe('No puedes desactivar tu propio usuario.');

      const removal = await remove(`/usuarios/${adminId}`).expect(422);
      expect(bodyOf<ErrorBody>(removal).message).toBe('No puedes eliminar tu propio usuario.');
    });

    it('deactivates a user, closing its sessions, and activates it again', async () => {
      const user = await ctx.createUser('role-ventas');
      const { token, cookie } = await ctx.signIn(user);

      const inactive = await post(`/usuarios/${user.id}/deactivate`).expect(200);
      expect(bodyOf<UserBody>(inactive).status).toBe('inactive');
      await get('/auth/me', token).expect(401);
      await ctx.http.post(`${API}/auth/refresh`).set('Cookie', cookie).expect(401);

      const active = await post(`/usuarios/${user.id}/activate`).expect(200);
      expect(bodyOf<UserBody>(active).status).toBe('active');
      await ctx.signIn(user);

      await post(`/usuarios/${user.id}/archivar`).expect(404);
    });

    it('resets the password of a user', async () => {
      const user = await ctx.createUser('role-tesoreria');

      await post(`/usuarios/${user.id}/reset-password`, { password: 'corta' }).expect(422);
      await post(`/usuarios/${user.id}/reset-password`, { password: 'clave-restablecida' }).expect(
        204,
      );

      await ctx.login(user.email, user.password).expect(422);
      await ctx.login(user.email, 'clave-restablecida').expect(200);
    });

    it('deletes a user without operations and keeps one with operations', async () => {
      const fresh = bodyOf<UserBody>(await newUser().expect(201));
      await remove(`/usuarios/${fresh.id}`).expect(204);
      await get(`/usuarios/${fresh.id}`).expect(404);

      const operator = await ctx.createUser('role-admin');
      const operatorToken = (await ctx.signIn(operator)).token;
      await newUser({}, operatorToken).expect(201);

      const kept = await remove(`/usuarios/${operator.id}`).expect(422);
      expect(bodyOf<ErrorBody>(kept).message).toBe(
        'El usuario tiene operaciones registradas; desactívalo en lugar de eliminarlo.',
      );
    });
  });

  describe('/roles', () => {
    const newRole = (overrides: object = {}) =>
      post('/roles', {
        name: `Rol ${randomUUID().slice(0, 8)}`,
        description: 'Rol de prueba',
        permissions: { comercial: 'write', reportes: 'read' },
        ...overrides,
      });

    it('lists the system roles', async () => {
      const response = await get('/roles').expect(200);

      const ids = bodyOf<RoleBody[]>(response).map((role) => role.id);
      expect(ids).toEqual(
        expect.arrayContaining([
          'role-admin',
          'role-ventas',
          'role-compras',
          'role-tesoreria',
          'role-consulta',
        ]),
      );
    });

    it('creates a role with every module and rejects a duplicate name', async () => {
      const response = await newRole({ name: 'Supervisor' }).expect(201);

      const role = bodyOf<RoleBody>(response);
      expect(role).toMatchObject({ name: 'Supervisor', system: false });
      expect(role.permissions).toEqual({
        maestros: 'none',
        comercial: 'write',
        compras: 'none',
        inventario: 'none',
        tesoreria: 'none',
        documentos: 'none',
        reportes: 'read',
        administracion: 'none',
      });

      const duplicate = await newRole({ name: 'supervisor' }).expect(422);
      expect(bodyOf<ErrorBody>(duplicate).message).toBe('Ya existe un rol con ese nombre.');

      await newRole({ permissions: { comercial: 'todo' } }).expect(422);
    });

    it('updates a custom role and protects the system roles', async () => {
      const created = bodyOf<RoleBody>(await newRole().expect(201));
      const updated = await patch(`/roles/${created.id}`, {
        description: 'Descripción nueva',
      }).expect(200);
      expect(bodyOf<RoleBody>(updated).description).toBe('Descripción nueva');

      const edit = await patch('/roles/role-admin', { name: 'Administrador 2' }).expect(422);
      expect(bodyOf<ErrorBody>(edit).message).toBe(
        'Los roles del sistema no se modifican; crea uno nuevo.',
      );
      const removal = await remove('/roles/role-admin').expect(422);
      expect(bodyOf<ErrorBody>(removal).message).toBe('Los roles del sistema no se eliminan.');
    });

    it('deletes an unused role and keeps one with users', async () => {
      const used = bodyOf<RoleBody>(await newRole().expect(201));
      await newUser({ roleId: used.id }).expect(201);
      const kept = await remove(`/roles/${used.id}`).expect(422);
      expect(bodyOf<ErrorBody>(kept).message).toBe(
        'El rol tiene usuarios; asígnales otro rol antes de eliminarlo.',
      );

      const unused = bodyOf<RoleBody>(await newRole().expect(201));
      await remove(`/roles/${unused.id}`).expect(204);
      await get(`/roles/${unused.id}`).expect(404);
      await post(`/roles/${used.id}/activate`).expect(404);
    });

    it('marks a new role as unseen for the other users until they see it', async () => {
      const other = (await ctx.signIn(await ctx.createUser('role-admin'))).token;
      const created = bodyOf<RoleBody>(await newRole().expect(201));

      expect(bodyOf<string[]>(await get('/roles/unseen', other).expect(200))).toContain(created.id);
      expect(bodyOf<string[]>(await get('/roles/unseen').expect(200))).not.toContain(created.id);

      await post(`/roles/${created.id}/seen`, {}, other).expect(204);
      expect(bodyOf<string[]>(await get('/roles/unseen', other).expect(200))).not.toContain(
        created.id,
      );

      await get('/roles/unseen', await ctx.tokenFor('role-consulta')).expect(403);
    });
  });

  describe('/auditoria', () => {
    it('lists the operations, filters and pages them', async () => {
      await newUser().expect(201);

      const response = await get('/auditoria?module=administracion&resource=usuarios').expect(200);
      const entries = bodyOf<AuditBody[]>(response);
      const created = entries.find((entry) => entry.action === 'Registró');
      expect(created).toMatchObject({
        userName: BOOTSTRAP.INITIAL_ADMIN_NAME,
        module: 'administracion',
        resource: 'usuarios',
      });
      expect(created?.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

      const page = await get('/auditoria?page=1&pageSize=2').expect(200);
      expect(bodyOf<AuditBody[]>(page)).toHaveLength(2);
      expect(Number(page.headers['x-total-count'])).toBeGreaterThan(2);

      const one = await get(`/auditoria/${created?.id ?? ''}`).expect(200);
      expect(bodyOf<AuditBody>(one).id).toBe(created?.id);
      await get(`/auditoria/${randomUUID()}`).expect(404);
    });

    it('cannot be written', async () => {
      const response = await post('/auditoria', {}).expect(405);
      expect(bodyOf<ErrorBody>(response).code).toBe('OPERATION_NOT_ALLOWED');
      await patch(`/auditoria/${randomUUID()}`, {}).expect(405);
      await remove(`/auditoria/${randomUUID()}`).expect(405);
    });

    it('rejects an unknown module filter', async () => {
      const response = await get('/auditoria?module=contabilidad').expect(400);
      expect(bodyOf<ErrorBody>(response).code).toBe('VALIDATION_ERROR');
    });
  });

  describe('/settings', () => {
    it('starts from the bootstrap company and the defaults', async () => {
      const response = await get('/settings').expect(200);

      expect(response.body).toMatchObject({
        companyName: BOOTSTRAP.COMPANY_NAME,
        ruc: BOOTSTRAP.COMPANY_RUC,
        igvRate: 0.18,
        invoiceSeries: 'F001',
        receiptSeries: 'B001',
        creditNoteSeries: 'FC01',
        quoteValidityDays: 15,
      });
    });

    it('updates the settings and validates them', async () => {
      const current = bodyOf<Record<string, unknown>>(await get('/settings').expect(200));

      const updated = await put('/settings', {
        ...current,
        address: 'Av. Siempre Viva 123',
        quoteValidityDays: 30,
      }).expect(200);
      expect(updated.body).toMatchObject({
        address: 'Av. Siempre Viva 123',
        quoteValidityDays: 30,
      });

      const ruc = await put('/settings', { ...current, ruc: '123' }).expect(422);
      expect(bodyOf<ErrorBody>(ruc).message).toBe('El RUC debe tener 11 dígitos.');
      const igv = await put('/settings', { ...current, igvRate: 0.9 }).expect(422);
      expect(bodyOf<ErrorBody>(igv).message).toBe('El IGV debe estar entre 0 % y 50 %.');
      await put('/settings', { ...current, receiptSeries: 'F001' }).expect(422);
    });
  });

  describe('capabilities', () => {
    it('depends on the write permission of the role', async () => {
      const consulta = await ctx.tokenFor('role-consulta');

      const forAdmin = bodyOf<Record<string, Capabilities>>(await get('/capabilities').expect(200));
      expect(forAdmin['usuarios']).toEqual({
        create: true,
        update: true,
        remove: true,
        actions: [
          { id: 'activate', label: 'Activó' },
          { id: 'deactivate', label: 'Desactivó' },
        ],
      });
      expect(forAdmin['auditoria']).toEqual({
        create: false,
        update: false,
        remove: false,
        actions: [],
      });

      const forConsulta = bodyOf<Record<string, Capabilities>>(
        await get('/capabilities', consulta).expect(200),
      );
      expect(forConsulta['usuarios']).toEqual(forAdmin['auditoria']);

      const one = await get('/usuarios/capabilities').expect(200);
      expect(one.body).toEqual(forAdmin['usuarios']);
      await get('/inexistente/capabilities').expect(404);
    });
  });

  describe('seed', () => {
    it('can run again without overwriting the administrator, the settings or the roles', async () => {
      await runSeed({
        INITIAL_ADMIN_PASSWORD: 'otra-clave-de-arranque',
        COMPANY_NAME: 'Otra Empresa S.A.C.',
      });

      await ctx.login(ctx.admin.email, ctx.admin.password).expect(200);
      await ctx.login(ctx.admin.email, 'otra-clave-de-arranque').expect(422);
      expect(bodyOf<{ companyName: string }>(await get('/settings')).companyName).toBe(
        BOOTSTRAP.COMPANY_NAME,
      );
      expect(await ctx.prisma.role.count({ where: { id: { startsWith: 'role-' } } })).toBe(5);
      expect(await ctx.prisma.user.count({ where: { email: ctx.admin.email } })).toBe(1);
    });
  });
});

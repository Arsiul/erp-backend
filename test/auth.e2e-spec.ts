import { API, bodyOf, E2eContext, refreshCookieOf } from './support/e2e-context';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

interface SessionBody {
  user: { id: string; name: string; email: string; roleId: string; status: string };
  permissions: Record<string, string>;
}

interface TokenBody {
  accessToken: string;
  expiresIn: number;
  session: SessionBody;
}

describe('Auth (e2e)', () => {
  let ctx: E2eContext;

  beforeAll(async () => {
    ctx = await E2eContext.start();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('POST /auth/login', () => {
    it('returns the access token, the session and an httpOnly refresh cookie', async () => {
      const response = await ctx.login(ctx.admin.email, ctx.admin.password).expect(200);

      const body = bodyOf<TokenBody>(response);
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.expiresIn).toBeGreaterThan(0);
      expect(body.session.user).toMatchObject({
        email: ctx.admin.email,
        roleId: 'role-admin',
        status: 'active',
      });
      expect(body.session.permissions['administracion']).toBe('write');

      const header = (response.headers['set-cookie'] as unknown as string[]).find((cookie) =>
        cookie.startsWith('erp_rt='),
      );
      expect(header).toMatch(/HttpOnly/i);
      expect(header).toMatch(/Path=\/api\/v1\/auth/);
    });

    it('accepts the email in any case', async () => {
      await ctx.login(ctx.admin.email.toUpperCase(), ctx.admin.password).expect(200);
    });

    it('rejects a wrong password and an unknown email with the same error', async () => {
      const user = await ctx.createUser('role-ventas');

      const wrong = await ctx.login(user.email, 'otra-clave-cualquiera').expect(422);
      const unknown = await ctx.login('nadie@e2e.test', 'otra-clave-cualquiera').expect(422);

      for (const response of [wrong, unknown]) {
        expect(bodyOf<ErrorBody>(response)).toEqual({
          statusCode: 422,
          code: 'INVALID_CREDENTIALS',
          message: 'Correo o contraseña incorrectos.',
        });
      }
    });

    it('records the failed attempt in the audit log', async () => {
      await ctx.login('intruso@e2e.test', 'otra-clave-cualquiera').expect(422);

      const entry = await ctx.prisma.auditLog.findFirst({
        where: { action: 'Inicio de sesión fallido', reference: 'intruso@e2e.test' },
      });
      expect(entry).toMatchObject({ module: 'administracion', resource: 'usuarios' });
    });

    it('tells an inactive user only after a valid password', async () => {
      const user = await ctx.createUser('role-consulta', { status: 'inactive' });

      const wrong = await ctx.login(user.email, 'otra-clave-cualquiera').expect(422);
      expect(bodyOf<ErrorBody>(wrong).code).toBe('INVALID_CREDENTIALS');

      const right = await ctx.login(user.email, user.password).expect(422);
      expect(bodyOf<ErrorBody>(right).code).toBe('USER_INACTIVE');
    });

    it('locks the account on the fifth failure, even for the right password', async () => {
      const user = await ctx.createUser('role-compras');

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const response = await ctx.login(user.email, 'otra-clave-cualquiera').expect(422);
        expect(bodyOf<ErrorBody>(response).code).toBe('INVALID_CREDENTIALS');
      }
      const fifth = await ctx.login(user.email, 'otra-clave-cualquiera').expect(422);
      expect(bodyOf<ErrorBody>(fifth)).toMatchObject({
        code: 'ACCOUNT_LOCKED',
        message: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.',
      });

      const locked = await ctx.login(user.email, user.password).expect(422);
      expect(bodyOf<ErrorBody>(locked).code).toBe('ACCOUNT_LOCKED');
    });

    it('locks an unknown email on the fifth failure, like an existing account', async () => {
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const response = await ctx.login('nadie-f6@erp.pe', 'otra-clave-cualquiera').expect(422);
        expect(bodyOf<ErrorBody>(response).code).toBe('INVALID_CREDENTIALS');
      }
      const fifth = await ctx.login('nadie-f6@erp.pe', 'otra-clave-cualquiera').expect(422);
      expect(bodyOf<ErrorBody>(fifth)).toEqual({
        statusCode: 422,
        code: 'ACCOUNT_LOCKED',
        message: 'Demasiados intentos. Vuelve a intentarlo en 15 minutos.',
      });
    });

    it('throttles a sixth try within a minute from the same IP', async () => {
      const fromOneIp = (): ReturnType<E2eContext['login']> =>
        ctx.http
          .post(`${API}/auth/login`)
          .set('X-Forwarded-For', '203.0.113.8')
          .send({ email: 'otro-f6@erp.pe', password: 'otra-clave-cualquiera' });
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await fromOneIp().expect(422);
      }
      const throttled = await fromOneIp().expect(429);
      expect(bodyOf<ErrorBody>(throttled).code).toBe('TOO_MANY_REQUESTS');
    });

    it('rejects a body without credentials', async () => {
      await ctx.login('', '').expect(422);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the refresh token and revokes the family when an old one is reused', async () => {
      const user = await ctx.createUser('role-tesoreria');
      const { cookie: first } = await ctx.signIn(user);

      const rotated = await ctx.http.post(`${API}/auth/refresh`).set('Cookie', first).expect(200);
      expect(bodyOf<TokenBody>(rotated).session.user.email).toBe(user.email);
      const second = refreshCookieOf(rotated);
      expect(second).toBeDefined();
      expect(second).not.toBe(first);

      const reused = await ctx.http.post(`${API}/auth/refresh`).set('Cookie', first).expect(401);
      expect(bodyOf<ErrorBody>(reused).code).toBe('UNAUTHORIZED');

      await ctx.http
        .post(`${API}/auth/refresh`)
        .set('Cookie', second ?? '')
        .expect(401);
    });

    it('requires the refresh cookie', async () => {
      await ctx.http.post(`${API}/auth/refresh`).expect(401);
      await ctx.http.post(`${API}/auth/refresh`).set('Cookie', 'erp_rt=basura').expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session', async () => {
      const { cookie } = await ctx.signIn(await ctx.createUser('role-ventas'));

      await ctx.http.post(`${API}/auth/logout`).set('Cookie', cookie).expect(204);

      await ctx.http.post(`${API}/auth/refresh`).set('Cookie', cookie).expect(401);
    });

    it('succeeds without a cookie', async () => {
      await ctx.http.post(`${API}/auth/logout`).expect(204);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the session of the token', async () => {
      const user = await ctx.createUser('role-consulta');
      const { token } = await ctx.signIn(user);

      const response = await ctx.http
        .get(`${API}/auth/me`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = bodyOf<SessionBody>(response);
      expect(body.user).toMatchObject({ id: user.id, email: user.email, roleId: 'role-consulta' });
      expect(body.permissions['administracion']).toBe('none');
    });

    it('rejects a missing or invalid token', async () => {
      const missing = await ctx.http.get(`${API}/auth/me`).expect(401);
      expect(bodyOf<ErrorBody>(missing)).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });

      await ctx.http.get(`${API}/auth/me`).set('Authorization', 'Bearer no-es-un-jwt').expect(401);
    });

    it('rejects the token of a user deactivated after signing in', async () => {
      const user = await ctx.createUser('role-ventas');
      const { token } = await ctx.signIn(user);
      await ctx.prisma.user.update({ where: { id: user.id }, data: { status: 'inactive' } });

      await ctx.http.get(`${API}/auth/me`).set('Authorization', `Bearer ${token}`).expect(401);
    });
  });

  describe('PUT /auth/password', () => {
    it('throttles a sixth try within a minute from the same IP', async () => {
      const user = await ctx.createUser('role-compras');
      const { token } = await ctx.signIn(user);
      const fromOneIp = (): ReturnType<E2eContext['login']> =>
        ctx.http
          .put(`${API}/auth/password`)
          .set('Authorization', `Bearer ${token}`)
          .set('X-Forwarded-For', '203.0.113.9')
          .send({ currentPassword: 'otra-clave-cualquiera', newPassword: 'nueva-clave-segura' });
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        await fromOneIp().expect(422);
      }
      await fromOneIp().expect(429);
    });

    it('rejects a wrong current password', async () => {
      const user = await ctx.createUser('role-compras');
      const { token } = await ctx.signIn(user);

      await ctx.http
        .put(`${API}/auth/password`)
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'otra-clave-cualquiera', newPassword: 'nueva-clave-segura' })
        .expect(422);
    });

    it('rejects a short new password', async () => {
      const user = await ctx.createUser('role-compras');
      const { token } = await ctx.signIn(user);

      const response = await ctx.http
        .put(`${API}/auth/password`)
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: user.password, newPassword: 'corta' })
        .expect(422);
      expect(bodyOf<ErrorBody>(response).message).toBe(
        'La contraseña debe tener al menos 8 caracteres.',
      );
    });

    it('changes the password, issues a new session and closes the others', async () => {
      const user = await ctx.createUser('role-tesoreria');
      const current = await ctx.signIn(user);
      const other = await ctx.signIn(user);

      const response = await ctx.http
        .put(`${API}/auth/password`)
        .set('Authorization', `Bearer ${current.token}`)
        .set('Cookie', current.cookie)
        .send({ currentPassword: user.password, newPassword: 'nueva-clave-segura' })
        .expect(200);

      expect(bodyOf<TokenBody>(response).accessToken).toEqual(expect.any(String));
      const renewed = refreshCookieOf(response);
      expect(renewed).toBeDefined();

      await ctx.http.post(`${API}/auth/refresh`).set('Cookie', other.cookie).expect(401);
      await ctx.http
        .post(`${API}/auth/refresh`)
        .set('Cookie', renewed ?? '')
        .expect(200);

      await ctx.login(user.email, user.password).expect(422);
      await ctx.login(user.email, 'nueva-clave-segura').expect(200);

      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: 'Cambió su contraseña', userId: user.id },
      });
      expect(audit).not.toBeNull();
    });
  });
});

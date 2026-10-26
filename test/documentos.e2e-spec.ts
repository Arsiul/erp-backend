import { LINKED_RECORD_MISSING } from '../src/modules/documentos/domain/document';
import {
  FILE_TYPE_NOT_ALLOWED,
  MAX_DOCUMENT_BYTES,
} from '../src/modules/documentos/domain/document-file';
import { API, bodyOf, E2eContext } from './support/e2e-context';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

interface DocumentBody {
  id: string;
  name: string;
  category: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  linkedResource: string;
  linkedId: string;
  linkedLabel: string;
  uploadedBy: string;
}

const PDF = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n');
const RUC = '20100070970';

/** Booting the app and migrating the database outlasts Jest's 5 s default on slow machines. */
jest.setTimeout(600_000);

describe('Documentos (e2e)', () => {
  let ctx: E2eContext;
  let admin: string;
  let tesoreria: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token = admin) => ctx.http.get(`${API}${path}`).set(auth(token));
  const upload = (name: string, bytes: Buffer, fileName: string, token = admin) =>
    ctx.http
      .post(`${API}/documentos`)
      .set(auth(token))
      .attach('file', bytes, fileName)
      .field('name', name)
      .field('category', 'contract');

  beforeAll(async () => {
    ctx = await E2eContext.start();
    admin = (await ctx.signIn(ctx.admin)).token;
    tesoreria = await ctx.tokenFor('role-tesoreria');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('uploads, lists, downloads, edits and removes a document', async () => {
    const created = bodyOf<DocumentBody>(
      await upload('Contrato marco', PDF, 'contrato.pdf').expect(201),
    );
    expect(created).toMatchObject({
      name: 'Contrato marco',
      category: 'contract',
      fileName: 'contrato.pdf',
      fileSize: PDF.length,
      mimeType: 'application/pdf',
      linkedResource: '',
    });
    expect(created).not.toHaveProperty('content');

    const listed = bodyOf<DocumentBody[]>(await get('/documentos?category=contract').expect(200));
    expect(listed.map(({ id }) => id)).toEqual([created.id]);

    const file = await get(`/documentos/${created.id}/file`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      })
      .expect(200);
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
    expect(file.headers).toMatchObject({
      'content-type': 'application/pdf',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, no-store',
    });
    expect(file.headers['content-disposition']).toMatch(/^inline;.*contrato\.pdf/);

    const edited = bodyOf<DocumentBody>(
      await ctx.http
        .patch(`${API}/documentos/${created.id}`)
        .set(auth(admin))
        .send({ name: 'Contrato 2026', category: 'other' })
        .expect(200),
    );
    expect(edited).toMatchObject({
      name: 'Contrato 2026',
      category: 'other',
      fileSize: PDF.length,
    });

    await ctx.http.delete(`${API}/documentos/${created.id}`).set(auth(admin)).expect(204);
    await get(`/documentos/${created.id}`).expect(404);

    const audit = await ctx.prisma.auditLog.findMany({
      where: { resource: 'documentos' },
      orderBy: { seq: 'asc' },
      select: { module: true, action: true },
    });
    expect(audit.map(({ action }) => action)).toEqual(['Registró', 'Actualizó', 'Eliminó']);
    expect(audit.every(({ module }) => module === 'documentos')).toBe(true);
  });

  it('rejects disallowed types, oversized files and roles without write access', async () => {
    const type = await upload('Programa', Buffer.from('MZ\x90\x00'), 'programa.exe').expect(422);
    expect(bodyOf<ErrorBody>(type)).toMatchObject({
      statusCode: 422,
      message: FILE_TYPE_NOT_ALLOWED,
    });

    const big = Buffer.concat([PDF, Buffer.alloc(MAX_DOCUMENT_BYTES)]);
    await upload('Grande', big, 'grande.pdf').expect(413);

    await get('/documentos', tesoreria).expect(200);
    await upload('Ajeno', PDF, 'ajeno.pdf', tesoreria).expect(403);

    await ctx.http
      .post(`${API}/documentos`)
      .set(auth(admin))
      .attach('file', PDF, 'extra.pdf')
      .field('name', 'Extra')
      .field('owner', 'otro')
      .expect(400);
  });

  it('links a document to an existing record only', async () => {
    const missing = await upload('Guía', PDF, 'guia.pdf')
      .field('linkedResource', 'clientes')
      .field('linkedId', 'no-existe')
      .expect(422);
    expect(bodyOf<ErrorBody>(missing).message).toBe(LINKED_RECORD_MISSING);

    const customer = bodyOf<{ id: string }>(
      await ctx.http
        .post(`${API}/clientes`)
        .set(auth(admin))
        .send({ name: 'Comercial Andina', documentType: 'RUC', documentNumber: RUC })
        .expect(201),
    );
    const linked = bodyOf<DocumentBody>(
      await upload('Guía', PDF, 'guia.pdf')
        .field('linkedResource', 'clientes')
        .field('linkedId', customer.id)
        .expect(201),
    );
    expect(linked).toMatchObject({
      linkedResource: 'clientes',
      linkedId: customer.id,
      linkedLabel: RUC,
    });
  });
});

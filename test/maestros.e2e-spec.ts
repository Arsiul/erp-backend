import { CATEGORY_IN_USE } from '../src/modules/maestros/domain/category';
import { CUSTOMER_DOCUMENT_TAKEN } from '../src/modules/maestros/domain/customer';
import { API, bodyOf, E2eContext } from './support/e2e-context';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
}

interface RecordBody {
  id: string;
  code: string;
  status: string;
}

interface CustomerBody extends RecordBody {
  name: string;
  documentNumber: string;
  phone: string;
  creditDays: number;
  creditLimit: number;
}

interface ProductBody {
  id: string;
  sku: string;
  categoryName: string;
  minStock: number;
}

interface BankAccountBody {
  id: string;
  name: string;
  openingBalance: number;
  balance: number;
}

const RUC = '20100070970';

/** Booting the app and migrating the database outlasts Jest's 5 s default on slow machines. */
jest.setTimeout(600_000);

describe('Maestros (e2e)', () => {
  let ctx: E2eContext;
  let admin: string;
  let ventas: string;
  let compras: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token = admin) => ctx.http.get(`${API}${path}`).set(auth(token));
  const post = (path: string, body: object, token = admin) =>
    ctx.http.post(`${API}${path}`).set(auth(token)).send(body);
  const patch = (path: string, body: object, token = admin) =>
    ctx.http.patch(`${API}${path}`).set(auth(token)).send(body);
  const remove = (path: string, token = admin) => ctx.http.delete(`${API}${path}`).set(auth(token));

  beforeAll(async () => {
    ctx = await E2eContext.start();
    admin = (await ctx.signIn(ctx.admin)).token;
    ventas = await ctx.tokenFor('role-ventas');
    compras = await ctx.tokenFor('role-compras');
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates, edits, deactivates and removes a customer with its audit trail', async () => {
    const created = bodyOf<CustomerBody>(
      await post('/clientes', {
        name: 'Comercial Andina S.A.C.',
        documentType: 'RUC',
        documentNumber: RUC,
        creditDays: 30,
        creditLimit: 5000,
      }).expect(201),
    );
    expect(created).toMatchObject({ code: 'CLI-0001', status: 'active', creditLimit: 5000 });

    const taken = await post('/clientes', {
      name: 'Otro',
      documentType: 'RUC',
      documentNumber: RUC,
    }).expect(422);
    expect(bodyOf<ErrorBody>(taken)).toMatchObject({
      statusCode: 422,
      message: CUSTOMER_DOCUMENT_TAKEN,
    });

    const edited = bodyOf<CustomerBody>(
      await patch(`/clientes/${created.id}`, { phone: '01 555 1234' }).expect(200),
    );
    expect(edited).toMatchObject({ name: 'Comercial Andina S.A.C.', phone: '01 555 1234' });

    await post(`/clientes/${created.id}/deactivate`, {}).expect(200);
    const again = await post(`/clientes/${created.id}/deactivate`, {}).expect(422);
    expect(bodyOf<ErrorBody>(again).message).toBe('El registro ya está inactivo.');
    await post(`/clientes/${created.id}/archivar`, {}).expect(404);

    await remove(`/clientes/${created.id}`).expect(204);
    await get(`/clientes/${created.id}`).expect(404);

    const audit = await ctx.prisma.auditLog.findMany({
      where: { resource: 'clientes' },
      orderBy: { seq: 'asc' },
      select: { module: true, action: true, reference: true },
    });
    expect(audit.map(({ action }) => action)).toEqual([
      'Registró',
      'Actualizó',
      'Desactivó',
      'Eliminó',
    ]);
    expect(audit.every(({ module, reference }) => module === 'maestros' && reference === RUC)).toBe(
      true,
    );
  });

  it('lists with filters and reports the total only when paged', async () => {
    await post('/clientes', {
      name: 'Ana Pérez',
      documentType: 'DNI',
      documentNumber: '45678912',
    }).expect(201);
    await post('/clientes', {
      name: 'Luis Rojas',
      documentType: 'DNI',
      documentNumber: '45678913',
    }).expect(201);

    const all = await get('/clientes?documentType=DNI').expect(200);
    expect(bodyOf<CustomerBody[]>(all)).toHaveLength(2);
    expect(all.headers['x-total-count']).toBeUndefined();

    const paged = await get('/clientes?q=rojas&page=1&pageSize=10').expect(200);
    expect(bodyOf<CustomerBody[]>(paged).map(({ name }) => name)).toEqual(['Luis Rojas']);
    expect(paged.headers['x-total-count']).toBe('1');
  });

  it('rejects unknown fields and enforces the module permissions', async () => {
    const extra = await post('/proveedores', { name: 'X', ruc: RUC, owner: 'otro' }).expect(400);
    expect(bodyOf<ErrorBody>(extra).code).toBe('VALIDATION_ERROR');

    await get('/proveedores', ventas).expect(200);
    await post('/proveedores', { name: 'Aceros', ruc: RUC }, ventas).expect(403);
    const supplier = bodyOf<RecordBody>(
      await post('/proveedores', { name: 'Aceros', ruc: RUC }, compras).expect(201),
    );
    expect(supplier.code).toBe('PRV-0001');
    await post('/proveedores', { name: 'Malo', ruc: '30100070970' }).expect(422);
  });

  it('creates stock rows for products and warehouses and keeps the minimum stock in sync', async () => {
    const category = bodyOf<RecordBody>(
      await post('/categorias', { name: 'Ferretería' }).expect(201),
    );
    expect(category.code).toBe('CAT-001');
    const central = bodyOf<RecordBody>(await post('/almacenes', { name: 'Central' }).expect(201));
    expect(central.code).toBe('ALM-01');

    const product = bodyOf<ProductBody>(
      await post('/productos', {
        sku: 'tor-01',
        name: 'Tornillo',
        categoryId: category.id,
        unit: 'UND',
        salePrice: 2.5,
        minStock: 4,
      }).expect(201),
    );
    expect(product).toMatchObject({ sku: 'TOR-01', categoryName: 'Ferretería', minStock: 4 });

    const norte = bodyOf<RecordBody>(await post('/almacenes', { name: 'Norte' }).expect(201));
    const rows = () =>
      ctx.prisma.stockItem.findMany({
        where: { productId: product.id },
        select: { warehouseId: true, minStock: true },
      });
    expect((await rows()).map(({ warehouseId }) => warehouseId).sort()).toEqual(
      [central.id, norte.id].sort(),
    );

    await patch(`/productos/${product.id}`, { minStock: 9 }).expect(200);
    expect((await rows()).every(({ minStock }) => minStock === 9)).toBe(true);

    const inUse = await remove(`/categorias/${category.id}`).expect(422);
    expect(bodyOf<ErrorBody>(inUse).message).toBe(CATEGORY_IN_USE);

    await post(`/categorias/${category.id}/deactivate`, {}).expect(200);
    await post('/productos', {
      sku: 'CLA-01',
      name: 'Clavo',
      categoryId: category.id,
      unit: 'UND',
      salePrice: 1,
    }).expect(422);
    await patch(`/productos/${product.id}`, { name: 'Tornillo 1/2' }).expect(200);
  });

  it('opens a bank account with its balance and edits it without touching the balance', async () => {
    const account = bodyOf<BankAccountBody>(
      await post('/cuentas-bancarias', {
        bank: 'BCP',
        name: 'Soles',
        accountNumber: '191-1234567-0-01',
        openingBalance: 1500.5,
      }).expect(201),
    );
    expect(account).toMatchObject({ openingBalance: 1500.5, balance: 1500.5 });
    const edited = bodyOf<BankAccountBody>(
      await patch(`/cuentas-bancarias/${account.id}`, { name: 'Soles principal' }).expect(200),
    );
    expect(edited).toMatchObject({ name: 'Soles principal', balance: 1500.5 });
    await post('/cuentas-bancarias', {
      bank: 'BBVA',
      name: 'Otra',
      accountNumber: '191-1234567-0-01',
    }).expect(422);
  });

  it('never returns more than 200 rows per page, whatever pageSize asks', async () => {
    await ctx.prisma.category.createMany({
      data: Array.from({ length: 250 }, (_, i) => ({
        code: `CAT-P${String(i).padStart(3, '0')}`,
        name: `Categoría paginada ${String(i)}`,
      })),
    });
    const total = await ctx.prisma.category.count();

    const paged = await get('/categorias?page=1&pageSize=1000').expect(200);
    expect(bodyOf<RecordBody[]>(paged)).toHaveLength(200);
    expect(paged.headers['x-total-count']).toBe(String(total));

    const all = await get('/categorias').expect(200);
    expect(bodyOf<RecordBody[]>(all)).toHaveLength(total);
    expect(all.headers['x-total-count']).toBeUndefined();
  });
});

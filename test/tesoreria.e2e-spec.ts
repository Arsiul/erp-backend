import { API, bodyOf, E2eContext } from './support/e2e-context';

interface ErrorBody {
  message: string;
}

interface MovementBody {
  id: string;
  number: string;
  date: string;
  type: string;
  concept: string;
  counterparty: string;
  reference: string;
  method: string;
  amount: number;
  status: string;
  notes: string;
  accountName: string;
}

describe('Tesorería (e2e)', () => {
  let ctx: E2eContext;
  let admin: string;
  let tesoreria: string;
  let ventas: string;
  let consulta: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token = admin) => ctx.http.get(`${API}${path}`).set(auth(token));
  const post = (path: string, body: object, token = admin) =>
    ctx.http.post(`${API}${path}`).set(auth(token)).send(body);
  const patch = (path: string, body: object, token = admin) =>
    ctx.http.patch(`${API}${path}`).set(auth(token)).send(body);

  const balanceOf = async (id: string): Promise<number> => {
    const account = await ctx.prisma.bankAccount.findUniqueOrThrow({ where: { id } });
    return Number(account.balance);
  };
  const messageOf = (res: { body: ErrorBody }) => bodyOf(res).message;

  beforeAll(async () => {
    ctx = await E2eContext.start();
    admin = (await ctx.signIn(ctx.admin)).token;
    tesoreria = await ctx.tokenFor('role-tesoreria');
    ventas = await ctx.tokenFor('role-ventas');
    consulta = await ctx.tokenFor('role-consulta');
    await ctx.prisma.bankAccount.createMany({
      data: [
        {
          id: 'ba-1',
          bank: 'BCP',
          name: 'BCP Soles',
          accountNumber: '191-1',
          openingBalance: 100,
          balance: 100,
        },
        {
          id: 'ba-2',
          bank: 'BBVA',
          name: 'BBVA Antigua',
          accountNumber: '011-2',
          status: 'inactive',
        },
      ],
    });
    const day = new Date('2026-10-01');
    await ctx.prisma.customer.create({
      data: {
        id: 'cus-1',
        code: 'CL1',
        name: 'Cliente SAC',
        documentType: 'RUC',
        documentNumber: '20111111111',
      },
    });
    await ctx.prisma.warehouse.create({ data: { id: 'wh-1', code: 'W1', name: 'Central' } });
    await ctx.prisma.sale.create({
      data: {
        id: 'sale-1',
        number: 'VEN-00001',
        customerId: 'cus-1',
        customerName: 'Cliente SAC',
        warehouseId: 'wh-1',
        warehouseName: 'Central',
        issuedAt: day,
        seller: 'Administrador',
        subtotal: 67.8,
        igv: 12.2,
        total: 80,
      },
    });
    await ctx.prisma.invoice.create({
      data: {
        id: 'inv-1',
        kind: 'factura',
        number: 'F001-00000001',
        saleId: 'sale-1',
        saleNumber: 'VEN-00001',
        customerId: 'cus-1',
        customerName: 'Cliente SAC',
        customerDocument: '20111111111',
        warehouseId: 'wh-1',
        issuedAt: day,
        dueAt: day,
        subtotal: 67.8,
        igv: 12.2,
        total: 80,
      },
    });
    await ctx.prisma.receivable.create({
      data: {
        id: 'cxc-1',
        invoiceId: 'inv-1',
        documentNumber: 'F001-00000001',
        customerId: 'cus-1',
        customerName: 'Cliente SAC',
        issuedAt: day,
        dueAt: day,
        amount: 80,
        balance: 80,
      },
    });
    await ctx.prisma.supplier.create({
      data: { id: 'sup-1', code: 'PR1', name: 'Proveedor SRL', ruc: '20222222222' },
    });
    await ctx.prisma.supplierInvoice.create({
      data: {
        id: 'si-1',
        documentNumber: 'F010-123',
        supplierId: 'sup-1',
        supplierName: 'Proveedor SRL',
        issuedAt: day,
        dueAt: day,
        subtotal: 50.85,
        igv: 9.15,
        total: 60,
      },
    });
    await ctx.prisma.payable.create({
      data: {
        id: 'cxp-1',
        supplierInvoiceId: 'si-1',
        documentNumber: 'F010-123',
        supplierId: 'sup-1',
        supplierName: 'Proveedor SRL',
        issuedAt: day,
        dueAt: day,
        amount: 60,
        balance: 60,
      },
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const other = { accountId: 'ba-1', concept: 'other', counterparty: 'SUNAT' };

  it('requires a session and write permission', async () => {
    await ctx.http.get(`${API}/movimientos`).expect(401);
    await post('/movimientos', { ...other, amount: 1 }, ventas).expect(403);
    await post('/movimientos', { ...other, amount: 1 }, consulta).expect(403);
    await get('/movimientos', consulta).expect(200);
  });

  it('registers other income and expenses moving the balance', async () => {
    const income = bodyOf<MovementBody>(
      await post('/movimientos', { ...other, amount: 50, notes: 'aporte' }, tesoreria).expect(201),
    );
    expect(income).toMatchObject({
      number: 'MOV-00001',
      type: 'income',
      method: 'transfer',
      status: 'posted',
      accountName: 'BCP Soles',
      amount: 50,
    });
    expect(income.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await balanceOf('ba-1')).toBe(150);

    const expense = bodyOf<MovementBody>(
      await post('/movimientos', {
        ...other,
        type: 'expense',
        amount: 20.5,
        date: '2026-10-02',
        method: 'cash',
      }).expect(201),
    );
    expect(expense).toMatchObject({ number: 'MOV-00002', date: '2026-10-02', method: 'cash' });
    expect(await balanceOf('ba-1')).toBe(129.5);
  });

  it('rejects invalid movements without touching the balance', async () => {
    const cases: [object, string][] = [
      [
        { ...other, type: 'expense', amount: 1000 },
        'BCP Soles no tiene saldo suficiente (S/ 129.50).',
      ],
      [
        { ...other, accountId: 'ba-2', amount: 5 },
        'No puedes usar la cuenta porque está en estado inactivo.',
      ],
      [{ ...other, accountId: '', amount: 5 }, 'Selecciona la cuenta.'],
      [{ ...other, amount: 0 }, 'El importe debe ser mayor que cero.'],
      [{ ...other, amount: 1e15 }, 'El importe supera el máximo permitido.'],
      [
        { ...other, concept: 'payment', payableId: 'cxp-1', amount: 1e15 },
        'El importe supera el máximo permitido.',
      ],
      [{ ...other, counterparty: ' ', amount: 5 }, 'Escribe a quién corresponde el movimiento.'],
      [{ ...other, concept: 'collection', amount: 5 }, 'Selecciona la cuenta por cobrar.'],
      [
        { ...other, concept: 'collection', receivableId: 'nope', amount: 5 },
        'Selecciona la cuenta por cobrar.',
      ],
      [{ ...other, concept: 'payment', amount: 5 }, 'Selecciona la cuenta por pagar.'],
      [
        { ...other, concept: 'collection', receivableId: 'cxc-1', amount: 81 },
        'El cobro supera el saldo de F001-00000001 (S/ 80.00).',
      ],
    ];
    for (const [body, message] of cases) {
      expect(messageOf(await post('/movimientos', body).expect(422))).toBe(message);
    }
    expect(await balanceOf('ba-1')).toBe(129.5);
    expect(await ctx.prisma.cashMovement.count()).toBe(2);
  });

  it('settles receivables and payables and voiding reverts them', async () => {
    const collection = bodyOf<MovementBody>(
      await post('/movimientos', {
        accountId: 'ba-1',
        concept: 'collection',
        receivableId: 'cxc-1',
        type: 'expense',
        amount: 30,
      }).expect(201),
    );
    expect(collection).toMatchObject({
      type: 'income',
      counterparty: 'Cliente SAC',
      reference: 'F001-00000001',
    });
    const payment = bodyOf<MovementBody>(
      await post('/movimientos', {
        accountId: 'ba-1',
        concept: 'payment',
        payableId: 'cxp-1',
        reference: 'OP-1',
        amount: 60,
      }).expect(201),
    );
    expect(payment).toMatchObject({
      type: 'expense',
      counterparty: 'Proveedor SRL',
      reference: 'OP-1',
    });
    expect(await balanceOf('ba-1')).toBe(99.5);
    const receivable = await ctx.prisma.receivable.findUniqueOrThrow({ where: { id: 'cxc-1' } });
    expect([Number(receivable.balance), receivable.status]).toEqual([50, 'partial']);
    const payable = await ctx.prisma.payable.findUniqueOrThrow({ where: { id: 'cxp-1' } });
    expect([Number(payable.balance), payable.status]).toEqual([0, 'paid']);

    await post(`/movimientos/${collection.id}/void`, {}).expect(200);
    await post(`/movimientos/${payment.id}/void`, {}, tesoreria).expect(200);
    expect(await balanceOf('ba-1')).toBe(129.5);
    const reverted = await ctx.prisma.receivable.findUniqueOrThrow({ where: { id: 'cxc-1' } });
    expect([Number(reverted.balance), reverted.status]).toEqual([80, 'pending']);
    const reopened = await ctx.prisma.payable.findUniqueOrThrow({ where: { id: 'cxp-1' } });
    expect([Number(reopened.balance), reopened.status]).toEqual([60, 'pending']);
  });

  it('edits only the notes and voids once', async () => {
    const [first] = bodyOf<MovementBody[]>(await get('/movimientos?q=MOV-00001').expect(200));
    if (!first) {
      throw new Error('Missing MOV-00001');
    }
    const updated = bodyOf<MovementBody>(
      await patch(`/movimientos/${first.id}`, {
        ...first,
        notes: ' revisado ',
        amount: 999,
      }).expect(200),
    );
    expect(updated).toMatchObject({ notes: 'revisado', amount: 50 });

    const voided = bodyOf<MovementBody>(
      await post(`/movimientos/${first.id}/void`, {}).expect(200),
    );
    expect(voided.status).toBe('voided');
    expect(await balanceOf('ba-1')).toBe(79.5);
    expect(messageOf(await post(`/movimientos/${first.id}/void`, {}).expect(422))).toBe(
      'El movimiento ya está anulado.',
    );
    expect(messageOf(await patch(`/movimientos/${first.id}`, { notes: 'x' }).expect(422))).toBe(
      'El movimiento está anulado.',
    );
    await post(`/movimientos/${first.id}/archive`, {}).expect(404);
    await post(`/movimientos/nope/void`, {}).expect(404);
    await get('/movimientos/nope').expect(404);
  });

  it('filters and pages the list', async () => {
    const all = await get('/movimientos').expect(200);
    expect(bodyOf<MovementBody[]>(all)).toHaveLength(4);
    expect(all.headers['x-total-count']).toBeUndefined();

    const voided = bodyOf<MovementBody[]>(await get('/movimientos?status=voided').expect(200));
    expect(voided.map((row) => row.number).sort()).toEqual(['MOV-00001', 'MOV-00003', 'MOV-00004']);
    const cash = bodyOf<MovementBody[]>(
      await get('/movimientos?method=cash&type=expense').expect(200),
    );
    expect(cash.map((row) => row.number)).toEqual(['MOV-00002']);
    const collections = bodyOf<MovementBody[]>(
      await get('/movimientos?concept=collection').expect(200),
    );
    expect(collections.map((row) => row.number)).toEqual(['MOV-00003']);
    const byName = bodyOf<MovementBody[]>(await get('/movimientos?q=proveedor').expect(200));
    expect(byName.map((row) => row.number)).toEqual(['MOV-00004']);
    const october2 = bodyOf<MovementBody[]>(
      await get('/movimientos?from=2026-10-02&to=2026-10-02').expect(200),
    );
    expect(october2.map((row) => row.number)).toEqual(['MOV-00002']);
    const page = await get('/movimientos?page=1&pageSize=2&sort=asc').expect(200);
    expect(bodyOf<MovementBody[]>(page).map((row) => row.number)).toEqual([
      'MOV-00001',
      'MOV-00002',
    ]);
    expect(page.headers['x-total-count']).toBe('4');
    await get('/movimientos?type=transfer').expect(400);
  });

  it('audits every change and marks new movements as unseen', async () => {
    const audit = await ctx.prisma.auditLog.findMany({ where: { module: 'tesoreria' } });
    const actions = audit.map((entry) => `${entry.resource} ${entry.action} ${entry.reference}`);
    expect(actions).toEqual(
      expect.arrayContaining([
        'movimientos Registró MOV-00001',
        'movimientos Actualizó MOV-00001',
        'movimientos Anuló MOV-00001',
        'movimientos Anuló MOV-00004',
      ]),
    );
    expect(
      await ctx.prisma.unseenRecord.count({ where: { resource: 'movimientos' } }),
    ).toBeGreaterThan(0);
  });
});

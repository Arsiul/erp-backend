import { BUYER, ComprasWorld } from '../../../../test/support/compras/compras-doubles';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';

describe('PurchaseOrdersUseCases', () => {
  let world: ComprasWorld;

  beforeEach(() => {
    world = new ComprasWorld();
  });

  const draft = () =>
    world.orders.create(
      {
        supplierId: 's1',
        warehouseId: 'w1',
        lines: [{ productId: 'p1', quantity: 2 }],
        notes: ' urgente ',
      },
      BUYER,
    );

  it('creates a draft numbered by the sequence with IGV from settings and the cost price', async () => {
    const order = await draft();
    const second = await draft();

    expect(order).toMatchObject({
      number: 'OC-00001',
      status: 'draft',
      supplierName: 'Distribuidora Andina',
      warehouseName: 'Almacén Central',
      issuedAt: '2026-10-25',
      expectedAt: '2026-11-01',
      subtotal: 100,
      igv: 18,
      total: 118,
      notes: 'urgente',
    });
    expect(order.lines[0]).toMatchObject({ productId: 'p1', unitPrice: 50, receivedQuantity: 0 });
    expect(second.number).toBe('OC-00002');
    expect(world.unseen.created).toEqual([
      `ordenes-compra/${order.id} by u-buyer`,
      `ordenes-compra/${second.id} by u-buyer`,
    ]);
    expect(world.audit.entries[0]).toMatchObject({
      actor: { userId: 'u-buyer', userName: 'Comprador' },
      module: 'compras',
      resource: 'ordenes-compra',
      action: 'Registró',
      reference: 'OC-00001',
    });
  });

  it('does not consume the sequence when the order is rejected', async () => {
    await expect(
      world.orders.create({ supplierId: 's-off', warehouseId: 'w1', lines: [] }, BUYER),
    ).rejects.toThrow('No puedes usar el proveedor porque está en estado inactivo.');
    expect((await draft()).number).toBe('OC-00001');
  });

  it('requires a supplier and an active warehouse', async () => {
    await expect(world.orders.create({ warehouseId: 'w1', lines: [] }, BUYER)).rejects.toThrow(
      'Selecciona el proveedor.',
    );
    await expect(world.orders.create({ supplierId: 's1', lines: [] }, BUYER)).rejects.toThrow(
      'Selecciona el almacén de destino.',
    );
    await expect(
      world.orders.create({ supplierId: 's1', warehouseId: 'w-off', lines: [] }, BUYER),
    ).rejects.toThrow('No puedes usar el almacén de destino porque está en estado inactivo.');
  });

  it('lists with filters, trims ids and reports whether it was paged', async () => {
    await draft();
    const all = await world.orders.list({ supplierId: ' ', warehouseId: ' w1 ' });
    expect(all).toMatchObject({ total: 1, paged: false });
    expect(world.orderRows.lastCriteria).toMatchObject({
      supplierId: undefined,
      warehouseId: 'w1',
    });

    const paged = await world.orders.list({ status: 'approved', page: 1, pageSize: 10 });
    expect(paged).toMatchObject({ items: [], total: 0, paged: true });
  });

  it('gets one order or answers 404', async () => {
    const order = await draft();
    await expect(world.orders.get(order.id)).resolves.toMatchObject({ number: 'OC-00001' });
    await expect(world.orders.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('edits a draft merging the patch over what it had', async () => {
    const order = await draft();
    const updated = await world.orders.update(
      order.id,
      { lines: [{ productId: 'p2', quantity: 3, unitPrice: 25 }] },
      BUYER,
    );

    expect(updated).toMatchObject({
      supplierId: 's1',
      subtotal: 75,
      total: 88.5,
      notes: 'urgente',
    });
    expect(world.audit.actions()).toContain('ordenes-compra Actualizó OC-00001');
  });

  it('refuses to edit or remove an order that left draft', async () => {
    const id = await world.approvedOrder();
    await expect(world.orders.update(id, { notes: 'x' }, BUYER)).rejects.toThrow(
      'Solo se editan órdenes en borrador.',
    );
    await expect(world.orders.remove(id, BUYER)).rejects.toThrow(
      'Solo se eliminan órdenes en borrador; anula las demás.',
    );
    await expect(world.orders.update('nope', {}, BUYER)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('removes a draft and forgets its unseen mark', async () => {
    const order = await draft();
    await world.orders.remove(order.id, BUYER);

    expect(world.orderRows.rows.size).toBe(0);
    expect(world.unseen.forgotten).toEqual([`ordenes-compra/${order.id}`]);
    expect(world.audit.actions()).toContain('ordenes-compra Eliminó OC-00001');
  });

  it('approves a draft once and only with an active supplier', async () => {
    const order = await draft();
    const approved = await world.orders.runAction(order.id, 'approve', BUYER);
    expect(approved.status).toBe('approved');
    expect(world.audit.actions()).toContain('ordenes-compra Aprobó OC-00001');

    await expect(world.orders.runAction(order.id, 'approve', BUYER)).rejects.toThrow(
      'Solo se aprueban órdenes en borrador.',
    );

    const other = await draft();
    world.catalog.suppliers.set('s1', {
      id: 's1',
      name: 'Distribuidora Andina',
      paymentDays: 30,
      status: 'inactive',
    });
    await expect(world.orders.runAction(other.id, 'approve', BUYER)).rejects.toThrow(
      'No puedes usar el proveedor porque está en estado inactivo.',
    );
  });

  it('cancels a draft or an approved order but not one that received goods', async () => {
    const order = await draft();
    await expect(world.orders.runAction(order.id, 'cancel', BUYER)).resolves.toMatchObject({
      status: 'cancelled',
    });

    const id = await world.approvedOrder();
    await world.receipts.create(
      { purchaseOrderId: id, guideNumber: 'T001-1', lines: [{ productId: 'p1', quantity: 1 }] },
      BUYER,
    );
    await expect(world.orders.runAction(id, 'cancel', BUYER)).rejects.toThrow(
      'La orden ya recibió mercadería o está cerrada; anula sus recepciones primero.',
    );
  });

  it('answers 404 for an unknown action or order', async () => {
    const order = await draft();
    await expect(world.orders.runAction(order.id, 'close', BUYER)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(world.orders.runAction('nope', 'approve', BUYER)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('rejects an expected date before the issue date', async () => {
    await expect(
      world.orders.create(
        {
          supplierId: 's1',
          warehouseId: 'w1',
          issuedAt: '2026-10-20',
          expectedAt: '2026-10-19',
          lines: [{ productId: 'p1', quantity: 1 }],
        },
        BUYER,
      ),
    ).rejects.toBeInstanceOf(BusinessError);
  });
});

import { BUYER, ComprasWorld } from '../../../../test/support/compras/compras-doubles';
import { NotFoundError } from '../../../shared/domain/errors/domain-error';

describe('ReceiptsUseCases', () => {
  let world: ComprasWorld;
  let orderId: string;

  beforeEach(async () => {
    world = new ComprasWorld();
    orderId = await world.approvedOrder();
  });

  const receive = (lines: unknown, guideNumber = 'T001-100') =>
    world.receipts.create({ purchaseOrderId: orderId, guideNumber, lines }, BUYER);

  const orderStatus = async () => (await world.orders.get(orderId)).status;

  it('receives part of the order, enters stock at the order price and keeps the cost', async () => {
    const receipt = await receive([
      { productId: 'p2', quantity: 2, unitPrice: 999 },
      { productId: 'p1', quantity: 4 },
      { productId: 'p3', quantity: 0 },
    ]);

    expect(receipt).toMatchObject({
      number: 'REC-00001',
      status: 'pending_bill',
      purchaseOrderNumber: 'OC-00001',
      supplierName: 'Distribuidora Andina',
      warehouseName: 'Almacén Central',
      receivedAt: '2026-10-25',
      guideNumber: 'T001-100',
      subtotal: 240,
    });
    expect(world.stock.moves.map((move) => `${move.productId} ${String(move.quantity)}`)).toEqual([
      'p1 4',
      'p2 2',
    ]);
    expect(world.stock.moves[0]).toMatchObject({
      origin: 'receipt',
      reference: 'REC-00001',
      date: '2026-10-25',
    });
    expect(world.stock.moves[1]?.unitCost?.toNumber()).toBe(20);
    expect(world.catalog.costPrices).toEqual(['p2=20.00', 'p1=50.00']);
    expect(await orderStatus()).toBe('partial');
    const order = await world.orders.get(orderId);
    expect(order.lines.map((line) => line.receivedQuantity)).toEqual([4, 2]);
    expect(world.unseen.created).toContain(`recepciones/${receipt.id} by u-buyer`);
    expect(world.audit.actions()).toContain('recepciones Registró REC-00001');
  });

  it('completes the order with a second receipt and then refuses more', async () => {
    await receive([{ productId: 'p1', quantity: 4 }]);
    await receive([
      { productId: 'p1', quantity: 6 },
      { productId: 'p2', quantity: 5 },
    ]);

    expect(await orderStatus()).toBe('received');
    expect(world.stock.balance('p1', 'w1')).toBe(10);
    await expect(receive([{ productId: 'p1', quantity: 1 }])).rejects.toThrow(
      'La orden OC-00001 no está aprobada o ya se recibió completa.',
    );
  });

  it('refuses more units than remain and products outside the order', async () => {
    await receive([{ productId: 'p2', quantity: 3 }]);
    await expect(receive([{ productId: 'p2', quantity: 3 }])).rejects.toThrow(
      'De Mouse solo quedan 2 unidades por recibir.',
    );
    await expect(receive([{ productId: 'p3', quantity: 1 }])).rejects.toThrow(
      'Monitor no está en la orden OC-00001.',
    );
    await expect(receive([{ productId: 'p1', quantity: 0 }])).rejects.toThrow(
      'Agrega al menos un producto.',
    );
    expect((await receive([{ productId: 'p1', quantity: 1 }])).number).toBe('REC-00002');
  });

  it('requires an existing order, its active warehouse, the guide and a date after the order', async () => {
    await expect(world.receipts.create({ lines: [] }, BUYER)).rejects.toThrow(
      'Selecciona la orden de compra.',
    );
    await expect(
      world.receipts.create({ purchaseOrderId: 'nope', lines: [] }, BUYER),
    ).rejects.toThrow('Selecciona la orden de compra.');
    await expect(receive([{ productId: 'p1', quantity: 1 }], ' ')).rejects.toThrow(
      'Escribe el número de la guía de remisión.',
    );
    await expect(
      world.receipts.create(
        {
          purchaseOrderId: orderId,
          guideNumber: 'G',
          receivedAt: '2026-10-19',
          lines: [{ productId: 'p1', quantity: 1 }],
        },
        BUYER,
      ),
    ).rejects.toThrow('La recepción no puede ser anterior a la orden.');

    world.catalog.warehouses.set('w1', { id: 'w1', name: 'Almacén Central', status: 'inactive' });
    await expect(receive([{ productId: 'p1', quantity: 1 }])).rejects.toThrow(
      'No puedes usar el almacén de la orden porque está en estado inactivo.',
    );
    expect(world.stock.moves).toEqual([]);
  });

  it('lists with filters and gets one receipt', async () => {
    const receipt = await receive([{ productId: 'p1', quantity: 1 }]);

    await expect(
      world.receipts.list({ purchaseOrderId: ` ${orderId} `, supplierId: '', page: 2 }),
    ).resolves.toMatchObject({ total: 1, paged: true });
    expect(world.receiptRows.lastCriteria).toMatchObject({
      purchaseOrderId: orderId,
      supplierId: undefined,
    });
    await expect(world.receipts.get(receipt.id)).resolves.toMatchObject({ number: 'REC-00001' });
    await expect(world.receipts.get('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('edits only the guide number', async () => {
    const receipt = await receive([{ productId: 'p1', quantity: 1 }]);

    await expect(
      world.receipts.update(receipt.id, { guideNumber: ' T002-9 ' }, BUYER),
    ).resolves.toMatchObject({ guideNumber: 'T002-9' });
    await expect(world.receipts.update(receipt.id, {}, BUYER)).resolves.toMatchObject({
      guideNumber: 'T002-9',
    });
    expect(world.audit.actions()).toContain('recepciones Actualizó REC-00001');
    await expect(world.receipts.update('nope', {}, BUYER)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cancels a receipt: takes the stock out and reopens the order', async () => {
    const first = await receive([{ productId: 'p1', quantity: 4 }]);
    await receive([{ productId: 'p2', quantity: 5 }]);

    const cancelled = await world.receipts.runAction(first.id, 'cancel', BUYER);

    expect(cancelled.status).toBe('cancelled');
    expect(world.stock.balance('p1', 'w1')).toBe(0);
    expect(world.stock.moves.at(-1)).toMatchObject({
      quantity: -4,
      origin: 'receipt_cancel',
      reference: 'REC-00001',
    });
    expect(world.stock.moves.at(-1)?.unitCost).toBeUndefined();
    expect(await orderStatus()).toBe('partial');
    expect(world.audit.actions()).toContain('recepciones Anuló REC-00001');

    await expect(world.receipts.update(first.id, { guideNumber: 'X' }, BUYER)).rejects.toThrow(
      'La recepción está anulada.',
    );
    await expect(world.receipts.runAction(first.id, 'cancel', BUYER)).rejects.toThrow(
      'Solo se anulan recepciones sin facturar; anula la factura del proveedor primero.',
    );
  });

  it('returns the order to approved when its only receipt is cancelled', async () => {
    const receipt = await receive([{ productId: 'p1', quantity: 2 }]);
    await world.receipts.runAction(receipt.id, 'cancel', BUYER);

    expect(await orderStatus()).toBe('approved');
    await expect(world.orders.runAction(orderId, 'cancel', BUYER)).resolves.toMatchObject({
      status: 'cancelled',
    });
  });

  it('answers 404 for unknown receipts, actions and a vanished order', async () => {
    const receipt = await receive([{ productId: 'p1', quantity: 2 }]);

    await expect(world.receipts.runAction('nope', 'cancel', BUYER)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(world.receipts.runAction(receipt.id, 'bill', BUYER)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    world.orderRows.rows.delete(orderId);
    await expect(world.receipts.runAction(receipt.id, 'cancel', BUYER)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

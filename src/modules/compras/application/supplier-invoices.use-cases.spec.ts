import { BUYER, ComprasWorld } from '../../../../test/support/compras/compras-doubles';
import { NotFoundError } from '../../../shared/domain/errors/domain-error';

describe('SupplierInvoicesUseCases', () => {
  let world: ComprasWorld;
  let receiptId: string;

  beforeEach(async () => {
    world = new ComprasWorld();
    const orderId = await world.approvedOrder();
    const receipt = await world.receipts.create(
      {
        purchaseOrderId: orderId,
        guideNumber: 'T001-1',
        lines: [{ productId: 'p1', quantity: 4 }],
      },
      BUYER,
    );
    receiptId = receipt.id;
  });

  const bill = (documentNumber = 'f001-77', extra: Record<string, unknown> = {}) =>
    world.invoices.create({ documentNumber, receiptId: ` ${receiptId} `, ...extra }, BUYER);

  it('registers the invoice from the receipt, opens its payable and bills the receipt', async () => {
    const invoice = await bill();

    expect(invoice).toMatchObject({
      documentNumber: 'F001-77',
      supplierId: 's1',
      supplierName: 'Distribuidora Andina',
      receiptId,
      receiptNumber: 'REC-00001',
      issuedAt: '2026-10-25',
      dueAt: '2026-11-24',
      subtotal: 200,
      igv: 36,
      total: 236,
      status: 'registered',
    });
    const [payable] = [...world.payableRows.rows.values()];
    expect(payable).toMatchObject({ supplierInvoiceId: invoice.id, status: 'pending' });
    expect(payable?.balance.toNumber()).toBe(236);
    await expect(world.receipts.get(receiptId)).resolves.toMatchObject({
      status: 'billed',
      supplierInvoiceNumber: 'F001-77',
    });
    expect(world.unseen.created).toEqual(
      expect.arrayContaining([
        `facturas-proveedor/${invoice.id} by u-buyer`,
        `cuentas-pagar/${payable?.id ?? ''} by u-buyer`,
      ]),
    );
    expect(world.audit.actions()).toContain(
      'facturas-proveedor Registró F001-77 · Distribuidora Andina',
    );
  });

  it('registers an invoice without a receipt from the typed subtotal', async () => {
    const invoice = await world.invoices.create(
      { documentNumber: 'E001-5', supplierId: 's2', subtotal: 100, receiptId: '  ' },
      BUYER,
    );
    expect(invoice).toMatchObject({ receiptId: '', receiptNumber: '', total: 118 });
    expect(invoice.dueAt).toBe('2026-10-25');
  });

  it('requires a supplier without receipt and a subtotal above zero', async () => {
    await expect(
      world.invoices.create({ documentNumber: 'E001-5', subtotal: 100 }, BUYER),
    ).rejects.toThrow('Selecciona el proveedor.');
    await expect(
      world.invoices.create({ documentNumber: 'E001-5', supplierId: 's2', subtotal: 0 }, BUYER),
    ).rejects.toThrow('El subtotal debe ser mayor que cero.');
    await expect(
      world.invoices.create({ documentNumber: 'E001-5', supplierId: 's2' }, BUYER),
    ).rejects.toThrow('Escribe el subtotal de la factura.');
  });

  it('refuses a duplicate number of the same supplier and a billed receipt', async () => {
    await bill();
    await expect(
      world.invoices.create({ documentNumber: 'F001-77', supplierId: 's1', subtotal: 5 }, BUYER),
    ).rejects.toThrow('Ya registraste la factura F001-77 de Distribuidora Andina.');
    await expect(bill('F001-78')).rejects.toThrow(
      'La recepción REC-00001 ya fue facturada o está anulada.',
    );
  });

  it('rejects another supplier, an unknown receipt and a due date before the issue', async () => {
    await expect(bill('F1', { supplierId: 's2' })).rejects.toThrow(
      'La factura debe ser del proveedor de la recepción.',
    );
    await expect(
      world.invoices.create({ documentNumber: 'F1', receiptId: 'nope' }, BUYER),
    ).rejects.toThrow('Selecciona la recepción.');
    await expect(bill('F1', { issuedAt: '2026-10-25', dueAt: '2026-10-24' })).rejects.toThrow(
      'El vencimiento no puede ser anterior a la emisión.',
    );
    expect(world.payableRows.rows.size).toBe(0);
  });

  it('cancels the invoice and its payable and frees the receipt to bill again', async () => {
    const invoice = await bill();
    const cancelled = await world.invoices.runAction(invoice.id, 'cancel', BUYER);

    expect(cancelled.status).toBe('cancelled');
    expect([...world.payableRows.rows.values()][0]?.status).toBe('cancelled');
    await expect(world.receipts.get(receiptId)).resolves.toMatchObject({
      status: 'pending_bill',
      supplierInvoiceNumber: '',
    });
    expect(world.audit.actions()).toContain(
      'facturas-proveedor Anuló F001-77 · Distribuidora Andina',
    );
    await expect(world.invoices.runAction(invoice.id, 'cancel', BUYER)).rejects.toThrow(
      'La factura ya está anulada.',
    );

    await expect(bill()).resolves.toMatchObject({ documentNumber: 'F001-77' });
  });

  it('refuses to cancel an invoice with payments', async () => {
    const invoice = await bill();
    const [payable] = [...world.payableRows.rows.values()];
    world.payableRows.pay(payable?.id ?? '', 50);

    await expect(world.invoices.runAction(invoice.id, 'cancel', BUYER)).rejects.toThrow(
      'La factura tiene pagos; anúlalos en Tesorería antes.',
    );
  });

  it('cancels an invoice without receipt or payable', async () => {
    const invoice = await world.invoices.create(
      { documentNumber: 'E001-5', supplierId: 's2', subtotal: 100 },
      BUYER,
    );
    world.payableRows.rows.clear();
    await expect(world.invoices.runAction(invoice.id, 'cancel', BUYER)).resolves.toMatchObject({
      status: 'cancelled',
    });
  });

  it('leaves alone a receipt that is no longer billed when the invoice is cancelled', async () => {
    const invoice = await bill();
    await world.receiptRows.setStatus(receiptId, 'cancelled', '');
    await world.invoices.runAction(invoice.id, 'cancel', BUYER);
    await expect(world.receipts.get(receiptId)).resolves.toMatchObject({ status: 'cancelled' });
  });

  it('lists with filters, gets one and answers 404', async () => {
    const invoice = await bill();

    await expect(
      world.invoices.list({ status: 'registered', supplierId: ' s1 ', receiptId: '' }),
    ).resolves.toMatchObject({ total: 1, paged: false });
    expect(world.invoiceRows.lastCriteria).toMatchObject({
      status: 'registered',
      supplierId: 's1',
      receiptId: undefined,
    });
    await expect(world.invoices.get(invoice.id)).resolves.toMatchObject({ id: invoice.id });
    await expect(world.invoices.get('nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(world.invoices.runAction('nope', 'cancel', BUYER)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(world.invoices.runAction(invoice.id, 'pay', BUYER)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

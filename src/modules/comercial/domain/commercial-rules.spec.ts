import { BusinessError } from '../../../shared/domain/errors/domain-error';
import type {
  CommercialSettings,
  CustomerRef,
  DocumentLine,
  InvoiceRecord,
  ProductRef,
  QuoteRecord,
  ReceivableRecord,
  SaleRecord,
} from './commercial';
import {
  assertCreditableLines,
  assertCreditChange,
  assertCreditSale,
  assertInvoiceCancellable,
  assertInvoiceDate,
  assertInvoiceIssued,
  assertQuoteConvertible,
  assertQuoteCustomer,
  assertQuoteEditable,
  assertQuoteRemovable,
  assertQuoteValidity,
  assertReceivableUntouched,
  assertSaleCancellable,
  assertSaleEditable,
  assertSaleInvoiceable,
  assertWithinBalance,
  creditNoteSeries,
  customerDocument,
  invoiceKind,
  invoiceSeries,
  lineProductIds,
  normalizeLines,
  positiveRows,
  quoteActionStatus,
  requireReceivable,
  requireSeller,
  seriesNumber,
  seriesSequence,
  totalsOf,
} from './commercial-rules';

const SETTINGS: CommercialSettings = {
  igvRate: '0.18',
  invoiceSeries: 'F001',
  receiptSeries: 'B001',
  creditNoteSeries: 'FC01',
  quoteValidityDays: 15,
};

const RUC: CustomerRef = {
  id: 'c1',
  name: 'Andes SAC',
  documentType: 'RUC',
  documentNumber: '20123456789',
  creditDays: 30,
  creditLimit: 1000,
  status: 'active',
};
const DNI: CustomerRef = { ...RUC, id: 'c2', name: 'Ana', documentType: 'DNI', creditDays: 0 };

const LAPTOP: ProductRef = { id: 'p1', name: 'Laptop', sku: 'LAP', salePrice: 100 };
const MOUSE: ProductRef = { id: 'p2', name: 'Mouse', sku: 'MOU', salePrice: 10.5 };
const PRODUCTS = new Map([
  [LAPTOP.id, LAPTOP],
  [MOUSE.id, MOUSE],
]);

const line = (product: ProductRef, quantity: number, unitPrice = product.salePrice) =>
  ({
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    quantity,
    unitPrice,
  }) satisfies DocumentLine;

const quote = (patch: Partial<QuoteRecord> = {}): QuoteRecord => ({
  id: 'q1',
  number: 'COT-00001',
  customerId: 'c1',
  customerName: 'Andes SAC',
  issuedAt: '2026-10-20',
  validUntil: '2026-11-04',
  seller: 'Rosa',
  lines: [line(LAPTOP, 1)],
  subtotal: 100,
  igv: 18,
  total: 118,
  status: 'draft',
  saleNumber: '',
  notes: '',
  ...patch,
});

const sale = (patch: Partial<SaleRecord> = {}): SaleRecord => ({
  id: 's1',
  number: 'VTA-00001',
  customerId: 'c1',
  customerName: 'Andes SAC',
  warehouseId: 'w1',
  warehouseName: 'Central',
  quoteId: '',
  quoteNumber: '',
  issuedAt: '2026-10-20',
  seller: 'Rosa',
  paymentTerm: 'cash',
  lines: [line(LAPTOP, 2)],
  subtotal: 200,
  igv: 36,
  total: 236,
  status: 'pending_invoice',
  invoiceId: '',
  invoiceNumber: '',
  notes: '',
  ...patch,
});

const invoice = (patch: Partial<InvoiceRecord> = {}): InvoiceRecord => ({
  id: 'i1',
  kind: 'factura',
  number: 'F001-00000001',
  saleId: 's1',
  saleNumber: 'VTA-00001',
  customerId: 'c1',
  customerName: 'Andes SAC',
  customerDocument: 'RUC 20123456789',
  warehouseId: 'w1',
  issuedAt: '2026-10-20',
  dueAt: '2026-11-19',
  lines: [line(LAPTOP, 2)],
  subtotal: 200,
  igv: 36,
  total: 236,
  creditedAmount: 0,
  status: 'issued',
  ...patch,
});

const receivable = (patch: Partial<ReceivableRecord> = {}): ReceivableRecord => ({
  id: 'r1',
  invoiceId: 'i1',
  documentNumber: 'F001-00000001',
  customerId: 'c1',
  customerName: 'Andes SAC',
  issuedAt: '2026-10-20',
  dueAt: '2026-11-19',
  amount: 236,
  paidAmount: 0,
  creditedAmount: 0,
  balance: 236,
  status: 'pending',
  ...patch,
});

describe('commercial rules', () => {
  it('numbers documents like the frontend', () => {
    expect(seriesNumber('F001', 12)).toBe('F001-00000012');
    expect(seriesSequence('B001')).toBe('serie:B001');
  });

  it('requires the seller', () => {
    expect(requireSeller(' Rosa ')).toBe('Rosa');
    expect(() => requireSeller('')).toThrow('Elige el vendedor.');
  });

  it('collects product ids and positive rows', () => {
    const rows = [
      { productId: 'p1', quantity: 1 },
      { productId: 'p1', quantity: 0 },
      { productId: '', quantity: 2 },
      'junk',
    ];
    expect(lineProductIds(rows)).toEqual(['p1']);
    expect(lineProductIds('nope')).toEqual([]);
    expect(positiveRows(rows)).toHaveLength(2);
  });

  it('normalizes lines with default and explicit prices', () => {
    const lines = normalizeLines(
      [
        { productId: 'p1', quantity: '2' },
        { productId: 'p2', quantity: 3, unitPrice: '9.999' },
      ],
      PRODUCTS,
      (product) => product.salePrice,
    );
    expect(lines).toEqual([line(LAPTOP, 2), line(MOUSE, 3, 10)]);
    expect(totalsOf(lines, SETTINGS.igvRate)).toEqual({ subtotal: 230, igv: 41.4, total: 271.4 });
  });

  it('rejects invalid lines', () => {
    const price = (product: ProductRef) => product.salePrice;
    expect(() => normalizeLines([], PRODUCTS, price)).toThrow('Agrega al menos un producto.');
    expect(() => normalizeLines([{ productId: 'zz', quantity: 1 }], PRODUCTS, price)).toThrow(
      'Uno de los productos ya no existe.',
    );
    expect(() =>
      normalizeLines(
        [
          { productId: 'p1', quantity: 1 },
          { productId: 'p1', quantity: 2 },
        ],
        PRODUCTS,
        price,
      ),
    ).toThrow('Laptop está repetido; junta las cantidades en una línea.');
    expect(() => normalizeLines([{ productId: 'p1', quantity: 1.5 }], PRODUCTS, price)).toThrow(
      'La cantidad de Laptop debe ser un entero mayor que cero.',
    );
    expect(() =>
      normalizeLines([{ productId: 'p1', quantity: 1, unitPrice: -1 }], PRODUCTS, price),
    ).toThrow('El precio de Laptop no es válido.');
    expect(() =>
      normalizeLines([{ productId: 'p1', quantity: 1 }], PRODUCTS, () => undefined),
    ).toThrow('El precio de Laptop no es válido.');
  });

  it('guards the quote life cycle', () => {
    expect(() => {
      assertQuoteEditable(quote({ status: 'sent' }));
    }).not.toThrow();
    expect(() => {
      assertQuoteEditable(quote({ status: 'accepted' }));
    }).toThrow('Solo se editan cotizaciones en borrador o enviadas.');
    expect(() => {
      assertQuoteValidity('2026-10-20', '2026-10-19');
    }).toThrow('La validez no puede ser anterior a la emisión.');
    expect(() => {
      assertQuoteValidity('2026-10-20', '2026-10-20');
    }).not.toThrow();
    expect(() => {
      assertQuoteRemovable(quote());
    }).not.toThrow();
    expect(() => {
      assertQuoteRemovable(quote({ status: 'sent' }));
    }).toThrow('Solo se eliminan cotizaciones en borrador; rechaza las demás.');
  });

  it('resolves the quote actions', () => {
    const today = '2026-10-25';
    expect(quoteActionStatus('send', quote(), today)).toBe('sent');
    expect(() => quoteActionStatus('send', quote({ status: 'sent' }), today)).toThrow(
      'Solo se envían cotizaciones en borrador.',
    );
    expect(quoteActionStatus('accept', quote({ status: 'sent' }), today)).toBe('accepted');
    expect(() => quoteActionStatus('accept', quote({ status: 'rejected' }), today)).toThrow(
      'Solo se aceptan cotizaciones en borrador o enviadas.',
    );
    expect(() => quoteActionStatus('accept', quote({ validUntil: '2026-10-24' }), today)).toThrow(
      'La cotización venció; actualiza su validez antes de aceptarla.',
    );
    expect(quoteActionStatus('reject', quote({ status: 'accepted' }), today)).toBe('rejected');
    expect(() => quoteActionStatus('reject', quote({ status: 'converted' }), today)).toThrow(
      'La cotización ya está cerrada.',
    );
    expect(() => quoteActionStatus('reject', quote({ status: 'rejected' }), today)).toThrow(
      'La cotización ya está cerrada.',
    );
  });

  it('guards sales and their credit', () => {
    expect(() => {
      assertQuoteConvertible(quote({ status: 'accepted' }));
    }).not.toThrow();
    expect(() => {
      assertQuoteConvertible(quote());
    }).toThrow('La cotización COT-00001 no está aceptada.');
    expect(() => {
      assertQuoteCustomer(null, RUC);
    }).not.toThrow();
    expect(() => {
      assertQuoteCustomer(quote(), DNI);
    }).toThrow('La venta debe ser para el cliente de la cotización.');
    expect(() => {
      assertCreditSale(RUC, 600, 400);
    }).not.toThrow();
    expect(() => {
      assertCreditSale(DNI, 10, 0);
    }).toThrow('Ana no tiene crédito aprobado; véndele al contado.');
    expect(() => {
      assertCreditSale(RUC, 600.01, 400);
    }).toThrow('La venta supera el crédito disponible de Andes SAC (S/ 600.00).');
    expect(() => {
      assertCreditChange(RUC, 1000, 0);
    }).not.toThrow();
    expect(() => {
      assertCreditChange(RUC, 1000, 1);
    }).toThrow('Andes SAC no tiene crédito suficiente para esta venta.');
    expect(() => {
      assertCreditChange(DNI, 1, 0);
    }).toThrow(BusinessError);
    expect(() => {
      assertSaleEditable(sale());
    }).not.toThrow();
    expect(() => {
      assertSaleEditable(sale({ status: 'invoiced' }));
    }).toThrow('Solo se editan ventas pendientes de facturar.');
    expect(() => {
      assertSaleCancellable(sale());
    }).not.toThrow();
    expect(() => {
      assertSaleCancellable(sale({ status: 'cancelled' }));
    }).toThrow(
      'Solo se anulan ventas sin facturar; para una facturada, anula el comprobante primero.',
    );
  });

  it('guards invoices', () => {
    expect(() => {
      assertSaleInvoiceable(sale());
    }).not.toThrow();
    expect(() => {
      assertSaleInvoiceable(sale({ status: 'invoiced' }));
    }).toThrow('La venta VTA-00001 ya fue facturada o está anulada.');
    expect(invoiceKind(undefined, RUC)).toBe('factura');
    expect(invoiceKind('', DNI)).toBe('boleta');
    expect(invoiceKind('boleta', RUC)).toBe('boleta');
    expect(() => invoiceKind('factura', DNI)).toThrow(
      'La factura exige un cliente con RUC; emite una boleta.',
    );
    expect(() => invoiceKind('ticket', RUC)).toThrow('Elige factura o boleta.');
    expect(() => {
      assertInvoiceDate('2026-10-19', sale());
    }).toThrow('El comprobante no puede ser anterior a la venta.');
    expect(() => {
      assertInvoiceDate('2026-10-20', sale());
    }).not.toThrow();
    expect(invoiceSeries('factura', SETTINGS)).toBe('F001');
    expect(invoiceSeries('boleta', SETTINGS)).toBe('B001');
    expect(creditNoteSeries('factura', SETTINGS)).toBe('FC01');
    expect(creditNoteSeries('boleta', SETTINGS)).toBe('BC01');
    expect(customerDocument(RUC)).toBe('RUC 20123456789');
  });

  it('guards invoice cancellation', () => {
    expect(requireReceivable(receivable(), invoice())).toEqual(receivable());
    expect(() => requireReceivable(null, invoice())).toThrow(
      'El comprobante F001-00000001 no tiene cuenta por cobrar.',
    );
    expect(() => {
      assertInvoiceCancellable(invoice({ status: 'cancelled' }));
    }).toThrow('El comprobante ya está anulado.');
    expect(() => {
      assertInvoiceCancellable(invoice());
    }).not.toThrow();
    expect(() => {
      assertReceivableUntouched(receivable({ paidAmount: 1 }), invoice());
    }).toThrow('El comprobante tiene cobros; anúlalos en Tesorería antes.');
    expect(() => {
      assertReceivableUntouched(receivable(), invoice({ creditedAmount: 1 }));
    }).toThrow('El comprobante tiene notas de crédito; ya no se puede anular.');
    expect(() => {
      assertReceivableUntouched(receivable(), invoice());
    }).not.toThrow();
  });

  it('guards credit notes', () => {
    expect(() => {
      assertInvoiceIssued(invoice());
    }).not.toThrow();
    expect(() => {
      assertInvoiceIssued(invoice({ status: 'cancelled' }));
    }).toThrow('El comprobante F001-00000001 está anulado.');
    const credited = new Map([['p1', 1]]);
    expect(() => {
      assertCreditableLines([line(LAPTOP, 1)], invoice(), credited);
    }).not.toThrow();
    expect(() => {
      assertCreditableLines([line(MOUSE, 1)], invoice(), credited);
    }).toThrow('Mouse no está en el comprobante F001-00000001.');
    expect(() => {
      assertCreditableLines([line(LAPTOP, 2)], invoice(), credited);
    }).toThrow('De Laptop solo quedan 1 unidades por acreditar.');
    expect(() => {
      assertCreditableLines([line(LAPTOP, 2, 101)], invoice(), new Map());
    }).toThrow('El precio de Laptop supera el facturado.');
    expect(() => {
      assertWithinBalance(236, receivable());
    }).not.toThrow();
    expect(() => {
      assertWithinBalance(236.01, receivable());
    }).toThrow('La nota (S/ 236.01) supera el saldo por cobrar (S/ 236.00).');
  });
});

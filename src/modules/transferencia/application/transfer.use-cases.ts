import { Inject, Injectable } from '@nestjs/common';
import type { ActingUser } from '../../../shared/application/listing/list-query';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError, DomainError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { QuotesUseCases } from '../../comercial/application/quotes.use-cases';
import { SalesUseCases } from '../../comercial/application/sales.use-cases';
import { PurchaseOrdersUseCases } from '../../compras/application/purchase-orders.use-cases';
import { BankAccountsUseCases } from '../../maestros/application/bank-accounts.use-cases';
import { CategoriesUseCases } from '../../maestros/application/categories.use-cases';
import { CustomersUseCases } from '../../maestros/application/customers.use-cases';
import { ProductsUseCases } from '../../maestros/application/products.use-cases';
import { SuppliersUseCases } from '../../maestros/application/suppliers.use-cases';
import { WarehousesUseCases } from '../../maestros/application/warehouses.use-cases';
import { parseCsv, toCsv, type CsvRow, type CsvValue } from '../domain/csv';
import {
  amount,
  dateValue,
  enumValue,
  isoDate,
  label,
  numberValue,
  optional,
} from '../domain/csv-values';

export interface ImportIssue {
  readonly line: number;
  readonly message: string;
}

export type ImportResult =
  | { readonly ok: true; readonly created: number; readonly updated: number }
  | { readonly ok: false; readonly errors: readonly ImportIssue[] };

/** One prepared write; `run` calls the module's own use case so its business rules apply. */
interface Operation {
  readonly line: number;
  readonly run: () => Promise<'created' | 'updated'>;
}

interface Definition {
  readonly file: string;
  readonly columns: readonly string[];
  readonly required: readonly string[];
  readonly rows: () => Promise<CsvValue[][]>;
  /** Absent for export-only resources. Throws a BusinessError for a row that cannot be imported. */
  readonly prepare?: (rows: readonly CsvRow[], actor: ActingUser) => Promise<Operation[]>;
}

const IMPORT_TIMEOUT_MS = 120_000;
const MAX_ROWS = 5_000;

@Injectable()
export class TransferUseCases {
  private readonly definitions: Partial<Record<ResourceKey, Definition>>;

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly tx: PrismaTransactionHost,
    private readonly customers: CustomersUseCases,
    private readonly suppliers: SuppliersUseCases,
    private readonly categories: CategoriesUseCases,
    private readonly products: ProductsUseCases,
    private readonly warehouses: WarehousesUseCases,
    private readonly bankAccounts: BankAccountsUseCases,
    private readonly quotes: QuotesUseCases,
    private readonly sales: SalesUseCases,
    private readonly purchaseOrders: PurchaseOrdersUseCases,
  ) {
    this.definitions = this.define();
  }

  private get db() {
    return this.tx.client;
  }

  supports(resource: ResourceKey): { exportable: boolean; importable: boolean } {
    const def = this.definitions[resource];
    return { exportable: def !== undefined, importable: def?.prepare !== undefined };
  }

  async exportCsv(resource: ResourceKey): Promise<{ file: string; csv: string }> {
    const def = this.require(resource);
    return { file: `${def.file}.csv`, csv: toCsv(def.columns, await def.rows()) };
  }

  template(resource: ResourceKey): { file: string; csv: string } {
    const def = this.require(resource);
    return { file: `${def.file}-plantilla.csv`, csv: toCsv(def.columns, []) };
  }

  /** All or nothing: everything is validated first, then written in one transaction. */
  async importCsv(resource: ResourceKey, text: string, actor: ActingUser): Promise<ImportResult> {
    const def = this.require(resource);
    if (!def.prepare) {
      throw new BusinessError('Este módulo solo permite exportar.');
    }
    const { headers, rows } = parseCsv(text);
    const missing = def.required.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      return fail(1, `Faltan columnas obligatorias: ${missing.join(', ')}.`);
    }
    if (rows.length === 0) return fail(1, 'El archivo no tiene filas de datos.');
    if (rows.length > MAX_ROWS) return fail(1, `El archivo supera el máximo de ${MAX_ROWS} filas.`);

    const prepare = def.prepare;
    let operations: Operation[];
    try {
      operations = await prepare(rows, actor);
    } catch (error) {
      if (error instanceof ImportFailure) return { ok: false, errors: error.issues };
      throw error;
    }

    let current = 0;
    try {
      const counts = await this.uow.run(
        async () => {
          let created = 0;
          let updated = 0;
          for (const op of operations) {
            current = op.line;
            if ((await op.run()) === 'created') created++;
            else updated++;
          }
          return { created, updated };
        },
        { timeoutMs: IMPORT_TIMEOUT_MS },
      );
      return { ok: true, ...counts };
    } catch (error) {
      if (error instanceof DomainError) return fail(current, error.message);
      throw error;
    }
  }

  private require(resource: ResourceKey): Definition {
    const def = this.definitions[resource];
    if (!def) throw new NotFoundError('Este módulo no tiene importación ni exportación.');
    return def;
  }

  // ---------------------------------------------------------------- lookups

  private async customerId(ref: string): Promise<string> {
    const found = await this.db.customer.findFirst({
      where: { OR: [{ code: ref }, { documentNumber: ref }] },
      select: { id: true },
    });
    if (!found) throw new BusinessError(`No existe el cliente ${ref}.`);
    return found.id;
  }

  private async supplierId(ref: string): Promise<string> {
    const found = await this.db.supplier.findFirst({
      where: { OR: [{ code: ref }, { ruc: ref }] },
      select: { id: true },
    });
    if (!found) throw new BusinessError(`No existe el proveedor ${ref}.`);
    return found.id;
  }

  private async categoryId(ref: string): Promise<string> {
    const found = await this.db.category.findFirst({
      where: { OR: [{ code: ref }, { name: { equals: ref, mode: 'insensitive' } }] },
      select: { id: true },
    });
    if (!found) throw new BusinessError(`No existe la categoría ${ref}.`);
    return found.id;
  }

  private async warehouseId(ref: string): Promise<string> {
    const found = await this.db.warehouse.findFirst({
      where: { OR: [{ code: ref }, { name: { equals: ref, mode: 'insensitive' } }] },
      select: { id: true },
    });
    if (!found) throw new BusinessError(`No existe el almacén ${ref}.`);
    return found.id;
  }

  private async productId(sku: string): Promise<string> {
    const found = await this.db.product.findFirst({
      where: { sku: sku.toUpperCase() },
      select: { id: true },
    });
    if (!found) throw new BusinessError(`No existe el producto con SKU ${sku}.`);
    return found.id;
  }

  // ------------------------------------------------------------ definitions

  private define(): Partial<Record<ResourceKey, Definition>> {
    return {
      clientes: {
        file: 'clientes',
        columns: [
          'codigo', 'nombre', 'tipo_documento', 'numero_documento', 'email', 'telefono',
          'direccion', 'dias_credito', 'limite_credito', 'estado',
        ],
        required: ['nombre', 'numero_documento'],
        rows: async () =>
          (await this.db.customer.findMany({ orderBy: { seq: 'asc' } })).map((c) => [
            c.code, c.name, c.documentType, c.documentNumber, c.email, c.phone, c.address,
            c.creditDays, amount(c.creditLimit), label('status', c.status),
          ]),
        prepare: (rows, actor) =>
          eachRow(rows, async (v) => {
            const input = {
              name: optional(v.nombre),
              documentType: optional(v.tipo_documento?.toUpperCase()),
              documentNumber: optional(v.numero_documento),
              email: optional(v.email),
              phone: optional(v.telefono),
              address: optional(v.direccion),
              creditDays: numberValue(v.dias_credito ?? '', 'dias_credito'),
              creditLimit: numberValue(v.limite_credito ?? '', 'limite_credito'),
              status: enumValue('status', v.estado ?? '', 'estado'),
            };
            const existing = await this.db.customer.findFirst({
              where: {
                OR: [
                  ...(v.codigo ? [{ code: v.codigo }] : []),
                  { documentNumber: v.numero_documento ?? '' },
                ],
              },
              select: { id: true },
            });
            return upsert(existing?.id,
              () => this.customers.create(input, actor),
              (id) => this.customers.update(id, input, actor));
          }),
      },

      proveedores: {
        file: 'proveedores',
        columns: [
          'codigo', 'nombre', 'ruc', 'contacto', 'email', 'telefono', 'direccion',
          'dias_pago', 'estado',
        ],
        required: ['nombre', 'ruc'],
        rows: async () =>
          (await this.db.supplier.findMany({ orderBy: { seq: 'asc' } })).map((s) => [
            s.code, s.name, s.ruc, s.contactName, s.email, s.phone, s.address, s.paymentDays,
            label('status', s.status),
          ]),
        prepare: (rows, actor) =>
          eachRow(rows, async (v) => {
            const input = {
              name: optional(v.nombre),
              ruc: optional(v.ruc),
              contactName: optional(v.contacto),
              email: optional(v.email),
              phone: optional(v.telefono),
              address: optional(v.direccion),
              paymentDays: numberValue(v.dias_pago ?? '', 'dias_pago'),
              status: enumValue('status', v.estado ?? '', 'estado'),
            };
            const existing = await this.db.supplier.findFirst({
              where: { OR: [...(v.codigo ? [{ code: v.codigo }] : []), { ruc: v.ruc ?? '' }] },
              select: { id: true },
            });
            return upsert(existing?.id,
              () => this.suppliers.create(input, actor),
              (id) => this.suppliers.update(id, input, actor));
          }),
      },

      categorias: {
        file: 'categorias',
        columns: ['codigo', 'nombre', 'descripcion', 'estado'],
        required: ['nombre'],
        rows: async () =>
          (await this.db.category.findMany({ orderBy: { seq: 'asc' } })).map((c) => [
            c.code, c.name, c.description, label('status', c.status),
          ]),
        prepare: (rows, actor) =>
          eachRow(rows, async (v) => {
            const input = {
              name: optional(v.nombre),
              description: optional(v.descripcion),
              status: enumValue('status', v.estado ?? '', 'estado'),
            };
            const existing = await this.db.category.findFirst({
              where: {
                OR: [
                  ...(v.codigo ? [{ code: v.codigo }] : []),
                  { name: { equals: v.nombre ?? '', mode: 'insensitive' as const } },
                ],
              },
              select: { id: true },
            });
            return upsert(existing?.id,
              () => this.categories.create(input, actor),
              (id) => this.categories.update(id, input, actor));
          }),
      },

      productos: {
        file: 'productos',
        columns: [
          'sku', 'nombre', 'categoria_codigo', 'categoria_nombre', 'unidad', 'precio_venta',
          'precio_costo', 'stock_minimo', 'estado',
        ],
        required: ['sku', 'nombre'],
        rows: async () =>
          (
            await this.db.product.findMany({ orderBy: { seq: 'asc' }, include: { category: true } })
          ).map((p) => [
            p.sku, p.name, p.category.code, p.category.name, p.unit, amount(p.salePrice),
            amount(p.costPrice), p.minStock, label('status', p.status),
          ]),
        prepare: (rows, actor) =>
          eachRow(rows, async (v) => {
            const categoryRef = optional(v.categoria_codigo) ?? optional(v.categoria_nombre);
            const input = {
              sku: optional(v.sku),
              name: optional(v.nombre),
              categoryId: categoryRef ? await this.categoryId(categoryRef) : undefined,
              unit: optional(v.unidad),
              salePrice: numberValue(v.precio_venta ?? '', 'precio_venta'),
              costPrice: numberValue(v.precio_costo ?? '', 'precio_costo'),
              minStock: numberValue(v.stock_minimo ?? '', 'stock_minimo'),
              status: enumValue('status', v.estado ?? '', 'estado'),
            };
            const existing = await this.db.product.findFirst({
              where: { sku: (v.sku ?? '').toUpperCase() },
              select: { id: true },
            });
            return upsert(existing?.id,
              () => this.products.create(input, actor),
              (id) => this.products.update(id, input, actor));
          }),
      },

      almacenes: {
        file: 'almacenes',
        columns: ['codigo', 'nombre', 'direccion', 'responsable', 'estado'],
        required: ['nombre'],
        rows: async () =>
          (await this.db.warehouse.findMany({ orderBy: { seq: 'asc' } })).map((w) => [
            w.code, w.name, w.address, w.manager, label('status', w.status),
          ]),
        prepare: (rows, actor) =>
          eachRow(rows, async (v) => {
            const input = {
              name: optional(v.nombre),
              address: optional(v.direccion),
              manager: optional(v.responsable),
              status: enumValue('status', v.estado ?? '', 'estado'),
            };
            const existing = await this.db.warehouse.findFirst({
              where: {
                OR: [
                  ...(v.codigo ? [{ code: v.codigo }] : []),
                  { name: { equals: v.nombre ?? '', mode: 'insensitive' as const } },
                ],
              },
              select: { id: true },
            });
            return upsert(existing?.id,
              () => this.warehouses.create(input, actor),
              (id) => this.warehouses.update(id, input, actor));
          }),
      },

      'cuentas-bancarias': {
        file: 'cuentas-bancarias',
        columns: ['banco', 'nombre', 'numero_cuenta', 'saldo_inicial', 'saldo', 'estado'],
        required: ['banco', 'nombre', 'numero_cuenta'],
        rows: async () =>
          (await this.db.bankAccount.findMany({ orderBy: { seq: 'asc' } })).map((b) => [
            b.bank, b.name, b.accountNumber, amount(b.openingBalance), amount(b.balance),
            label('status', b.status),
          ]),
        prepare: (rows, actor) =>
          eachRow(rows, async (v) => {
            // `saldo` is derived from movements and is ignored on import.
            const input = {
              bank: optional(v.banco),
              name: optional(v.nombre),
              accountNumber: optional(v.numero_cuenta),
              openingBalance: numberValue(v.saldo_inicial ?? '', 'saldo_inicial'),
              status: enumValue('status', v.estado ?? '', 'estado'),
            };
            const existing = await this.db.bankAccount.findFirst({
              where: { accountNumber: { equals: v.numero_cuenta ?? '', mode: 'insensitive' } },
              select: { id: true },
            });
            return upsert(existing?.id,
              () => this.bankAccounts.create(input, actor),
              (id) => this.bankAccounts.update(id, input, actor));
          }),
      },

      cotizaciones: {
        file: 'cotizaciones',
        columns: [
          'numero', 'cliente_codigo', 'cliente_nombre', 'fecha', 'valida_hasta', 'vendedor',
          'notas', 'estado', 'producto_sku', 'producto_nombre', 'cantidad', 'precio_unitario',
          'total',
        ],
        required: ['numero', 'cliente_codigo', 'producto_sku', 'cantidad'],
        rows: async () =>
          (
            await this.db.quote.findMany({
              orderBy: { seq: 'asc' },
              include: { customer: true, lines: { orderBy: { position: 'asc' } } },
            })
          ).flatMap((q) =>
            q.lines.map((l) => [
              q.number, q.customer.code, q.customerName, isoDate(q.issuedAt),
              isoDate(q.validUntil), q.seller, q.notes, q.status, l.sku, l.productName,
              l.quantity, amount(l.unitPrice), amount(q.total),
            ]),
          ),
        prepare: (rows, actor) =>
          eachDocument(rows, async (v, lines) => {
            const input = {
              customerId: await this.customerId(v.cliente_codigo ?? ''),
              issuedAt: dateValue(v.fecha ?? '', 'fecha'),
              validUntil: dateValue(v.valida_hasta ?? '', 'valida_hasta'),
              seller: optional(v.vendedor),
              notes: optional(v.notas),
              lines: await this.lines(lines),
            };
            const existing = await this.db.quote.findFirst({
              where: { number: v.numero ?? '' },
              select: { id: true },
            });
            return upsert(existing?.id,
              () => this.quotes.create(input, actor),
              (id) => this.quotes.update(id, input, actor));
          }),
      },

      ventas: {
        file: 'ventas',
        columns: [
          'numero', 'cliente_codigo', 'cliente_nombre', 'almacen_codigo', 'fecha', 'vendedor',
          'condicion_pago', 'notas', 'estado', 'comprobante', 'producto_sku', 'producto_nombre',
          'cantidad', 'precio_unitario', 'total',
        ],
        required: ['numero', 'cliente_codigo', 'almacen_codigo', 'producto_sku', 'cantidad'],
        rows: async () =>
          (
            await this.db.sale.findMany({
              orderBy: { seq: 'asc' },
              include: { customer: true, warehouse: true, lines: { orderBy: { position: 'asc' } } },
            })
          ).flatMap((s) =>
            s.lines.map((l) => [
              s.number, s.customer.code, s.customerName, s.warehouse.code, isoDate(s.issuedAt),
              s.seller, label('paymentTerm', s.paymentTerm), s.notes, s.status, s.invoiceNumber,
              l.sku, l.productName, l.quantity, amount(l.unitPrice), amount(s.total),
            ]),
          ),
        prepare: (rows, actor) =>
          eachDocument(rows, async (v, lines) => {
            const input = {
              customerId: await this.customerId(v.cliente_codigo ?? ''),
              warehouseId: await this.warehouseId(v.almacen_codigo ?? ''),
              issuedAt: dateValue(v.fecha ?? '', 'fecha'),
              seller: optional(v.vendedor),
              paymentTerm: enumValue('paymentTerm', v.condicion_pago ?? '', 'condicion_pago'),
              notes: optional(v.notas),
              lines: await this.lines(lines),
            };
            const existing = await this.db.sale.findFirst({
              where: { number: v.numero ?? '' },
              select: { id: true },
            });
            return upsert(existing?.id,
              () => this.sales.create(input, actor),
              (id) => this.sales.update(id, input, actor));
          }),
      },

      'ordenes-compra': {
        file: 'ordenes-compra',
        columns: [
          'numero', 'proveedor_codigo', 'proveedor_nombre', 'almacen_codigo', 'fecha',
          'fecha_esperada', 'notas', 'estado', 'producto_sku', 'producto_nombre', 'cantidad',
          'precio_unitario', 'cantidad_recibida', 'total',
        ],
        required: ['numero', 'proveedor_codigo', 'almacen_codigo', 'producto_sku', 'cantidad'],
        rows: async () =>
          (
            await this.db.purchaseOrder.findMany({
              orderBy: { seq: 'asc' },
              include: { supplier: true, warehouse: true, lines: { orderBy: { position: 'asc' } } },
            })
          ).flatMap((o) =>
            o.lines.map((l) => [
              o.number, o.supplier.code, o.supplierName, o.warehouse.code, isoDate(o.issuedAt),
              isoDate(o.expectedAt), o.notes, o.status, l.sku, l.productName, l.quantity,
              amount(l.unitPrice), l.receivedQuantity, amount(o.total),
            ]),
          ),
        prepare: (rows, actor) =>
          eachDocument(rows, async (v, lines) => {
            const input = {
              supplierId: await this.supplierId(v.proveedor_codigo ?? ''),
              warehouseId: await this.warehouseId(v.almacen_codigo ?? ''),
              issuedAt: dateValue(v.fecha ?? '', 'fecha'),
              expectedAt: dateValue(v.fecha_esperada ?? '', 'fecha_esperada'),
              notes: optional(v.notas),
              lines: await this.lines(lines),
            };
            const existing = await this.db.purchaseOrder.findFirst({
              where: { number: v.numero ?? '' },
              select: { id: true },
            });
            return upsert(existing?.id,
              () => this.purchaseOrders.create(input, actor),
              (id) => this.purchaseOrders.update(id, input, actor));
          }),
      },

      comprobantes: {
        file: 'comprobantes',
        columns: [
          'tipo', 'numero', 'venta', 'cliente', 'documento_cliente', 'fecha', 'vencimiento',
          'estado', 'producto_sku', 'producto_nombre', 'cantidad', 'precio_unitario',
          'subtotal', 'igv', 'total',
        ],
        required: [],
        rows: async () =>
          (
            await this.db.invoice.findMany({
              orderBy: { seq: 'asc' },
              include: { lines: { orderBy: { position: 'asc' } } },
            })
          ).flatMap((i) =>
            i.lines.map((l) => [
              i.kind, i.number, i.saleNumber, i.customerName, i.customerDocument,
              isoDate(i.issuedAt), isoDate(i.dueAt), i.status, l.sku, l.productName, l.quantity,
              amount(l.unitPrice), amount(i.subtotal), amount(i.igv), amount(i.total),
            ]),
          ),
      },

      'cuentas-cobrar': {
        file: 'cuentas-cobrar',
        columns: [
          'documento', 'cliente', 'fecha', 'vencimiento', 'importe', 'cobrado', 'notas_credito',
          'saldo', 'estado',
        ],
        required: [],
        rows: async () =>
          (await this.db.receivable.findMany({ orderBy: { seq: 'asc' } })).map((r) => [
            r.documentNumber, r.customerName, isoDate(r.issuedAt), isoDate(r.dueAt),
            amount(r.amount), amount(r.paidAmount), amount(r.creditedAmount), amount(r.balance),
            r.status,
          ]),
      },

      'cuentas-pagar': {
        file: 'cuentas-pagar',
        columns: ['documento', 'proveedor', 'fecha', 'vencimiento', 'importe', 'pagado', 'saldo', 'estado'],
        required: [],
        rows: async () =>
          (await this.db.payable.findMany({ orderBy: { seq: 'asc' } })).map((p) => [
            p.documentNumber, p.supplierName, isoDate(p.issuedAt), isoDate(p.dueAt),
            amount(p.amount), amount(p.paidAmount), amount(p.balance), p.status,
          ]),
      },

      stock: {
        file: 'stock',
        columns: ['producto_sku', 'producto_nombre', 'almacen_codigo', 'almacen_nombre', 'cantidad', 'stock_minimo', 'costo_unitario'],
        required: [],
        rows: async () =>
          (
            await this.db.stockItem.findMany({
              orderBy: { seq: 'asc' },
              include: { product: true, warehouse: true },
            })
          ).map((s) => [
            s.product.sku, s.product.name, s.warehouse.code, s.warehouse.name, s.quantity,
            s.minStock, amount(s.unitCost),
          ]),
      },

      kardex: {
        file: 'kardex',
        columns: ['fecha', 'producto_sku', 'producto_nombre', 'almacen', 'origen', 'referencia', 'cantidad', 'saldo', 'costo_unitario'],
        required: [],
        rows: async () =>
          (await this.db.kardexEntry.findMany({ orderBy: { seq: 'asc' } })).map((k) => [
            isoDate(k.date), k.sku, k.productName, k.warehouseName, k.origin, k.reference,
            k.quantity, k.balance, amount(k.unitCost),
          ]),
      },

      movimientos: {
        file: 'movimientos',
        columns: ['numero', 'fecha', 'cuenta', 'tipo', 'concepto', 'contraparte', 'referencia', 'medio', 'importe', 'estado'],
        required: [],
        rows: async () =>
          (await this.db.cashMovement.findMany({ orderBy: { seq: 'asc' } })).map((m) => [
            m.number, isoDate(m.date), m.accountName, m.type, m.concept, m.counterparty,
            m.reference, m.method, amount(m.amount), m.status,
          ]),
      },
    };
  }

  /** Resolves each line's SKU; an empty price keeps the product's list price. */
  private async lines(rows: readonly CsvRow[]) {
    const lines = [];
    for (const { values } of rows) {
      const v = values as Values;
      lines.push({
        productId: await this.productId(v.producto_sku ?? ''),
        quantity: numberValue(v.cantidad ?? '', 'cantidad'),
        unitPrice: numberValue(v.precio_unitario ?? '', 'precio_unitario'),
      });
    }
    return lines;
  }
}

class ImportFailure extends Error {
  constructor(readonly issues: readonly ImportIssue[]) {
    super('import failed');
  }
}

const fail = (line: number, message: string): ImportResult => ({
  ok: false,
  errors: [{ line, message }],
});

const upsert =
  (id: string | undefined, create: () => Promise<unknown>, update: (id: string) => Promise<unknown>) =>
  async (): Promise<'created' | 'updated'> => {
    if (id === undefined) {
      await create();
      return 'created';
    }
    await update(id);
    return 'updated';
  };

type Column = 'almacen_codigo' | 'banco' | 'cantidad' | 'categoria_codigo' | 'categoria_nombre' | 'cliente_codigo' | 'codigo' | 'condicion_pago' | 'contacto' | 'descripcion' | 'dias_credito' | 'dias_pago' | 'direccion' | 'email' | 'estado' | 'fecha' | 'fecha_esperada' | 'limite_credito' | 'nombre' | 'notas' | 'numero' | 'numero_cuenta' | 'numero_documento' | 'precio_costo' | 'precio_unitario' | 'precio_venta' | 'producto_sku' | 'proveedor_codigo' | 'responsable' | 'ruc' | 'saldo_inicial' | 'sku' | 'stock_minimo' | 'telefono' | 'tipo_documento' | 'unidad' | 'valida_hasta' | 'vendedor';
type Values = Readonly<Partial<Record<Column, string>>>;

/** Prepares every row and collects every error before failing. */
async function eachRow(
  rows: readonly CsvRow[],
  prepare: (values: Values) => Promise<Operation['run']>,
): Promise<Operation[]> {
  const operations: Operation[] = [];
  const issues: ImportIssue[] = [];
  for (const row of rows) {
    try {
      operations.push({ line: row.line, run: await prepare(row.values as Values) });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      issues.push({ line: row.line, message: error.message });
    }
  }
  if (issues.length > 0) throw new ImportFailure(issues);
  return operations;
}

/** Groups rows by `numero`: the first row carries the header, every row is one line. */
async function eachDocument(
  rows: readonly CsvRow[],
  prepare: (header: Values, lines: readonly CsvRow[]) => Promise<Operation['run']>,
): Promise<Operation[]> {
  const groups = new Map<string, CsvRow[]>();
  const issues: ImportIssue[] = [];
  for (const row of rows) {
    const number = row.values['numero'] ?? '';
    if (number === '') {
      issues.push({ line: row.line, message: 'La columna numero es obligatoria (use NUEVO-1, NUEVO-2… para documentos nuevos).' });
      continue;
    }
    groups.set(number, [...(groups.get(number) ?? []), row]);
  }
  const operations: Operation[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    try {
      operations.push({ line: first.line, run: await prepare(first.values as Values, group) });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      issues.push({ line: first.line, message: error.message });
    }
  }
  if (issues.length > 0) throw new ImportFailure(issues);
  return operations;
}

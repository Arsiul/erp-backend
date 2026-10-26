import { Injectable } from '@nestjs/common';
import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import type { LinkedRecords } from '../domain/ports/document.repository';

type Lookup = (client: PrismaTransactionHost['client'], id: string) => Promise<string | null>;

const labelOrNull = <T>(row: T | null, pick: (row: T) => string): string | null =>
  row === null ? null : pick(row);

/** Records a document can be attached to, with the field the frontend shows as its label. */
const LOOKUPS: ReadonlyMap<ResourceKey, Lookup> = new Map<ResourceKey, Lookup>([
  [
    'clientes',
    async (client, id) =>
      labelOrNull(
        await client.customer.findUnique({ where: { id }, select: { documentNumber: true } }),
        (row) => row.documentNumber,
      ),
  ],
  [
    'proveedores',
    async (client, id) =>
      labelOrNull(
        await client.supplier.findUnique({ where: { id }, select: { code: true } }),
        (row) => row.code,
      ),
  ],
  [
    'productos',
    async (client, id) =>
      labelOrNull(
        await client.product.findUnique({ where: { id }, select: { sku: true } }),
        (row) => row.sku,
      ),
  ],
  [
    'categorias',
    async (client, id) =>
      labelOrNull(
        await client.category.findUnique({ where: { id }, select: { code: true } }),
        (row) => row.code,
      ),
  ],
  [
    'almacenes',
    async (client, id) =>
      labelOrNull(
        await client.warehouse.findUnique({ where: { id }, select: { code: true } }),
        (row) => row.code,
      ),
  ],
  [
    'cuentas-bancarias',
    async (client, id) =>
      labelOrNull(
        await client.bankAccount.findUnique({ where: { id }, select: { name: true } }),
        (row) => row.name,
      ),
  ],
  [
    'cotizaciones',
    async (client, id) =>
      labelOrNull(
        await client.quote.findUnique({ where: { id }, select: { number: true } }),
        (row) => row.number,
      ),
  ],
  [
    'ventas',
    async (client, id) =>
      labelOrNull(
        await client.sale.findUnique({ where: { id }, select: { number: true } }),
        (row) => row.number,
      ),
  ],
  [
    'comprobantes',
    async (client, id) =>
      labelOrNull(
        await client.invoice.findUnique({ where: { id }, select: { number: true } }),
        (row) => row.number,
      ),
  ],
  [
    'notas-credito',
    async (client, id) =>
      labelOrNull(
        await client.creditNote.findUnique({ where: { id }, select: { number: true } }),
        (row) => row.number,
      ),
  ],
  [
    'ordenes-compra',
    async (client, id) =>
      labelOrNull(
        await client.purchaseOrder.findUnique({ where: { id }, select: { number: true } }),
        (row) => row.number,
      ),
  ],
  [
    'recepciones',
    async (client, id) =>
      labelOrNull(
        await client.receipt.findUnique({ where: { id }, select: { number: true } }),
        (row) => row.number,
      ),
  ],
  [
    'facturas-proveedor',
    async (client, id) =>
      labelOrNull(
        await client.supplierInvoice.findUnique({
          where: { id },
          select: { documentNumber: true },
        }),
        (row) => row.documentNumber,
      ),
  ],
]);

@Injectable()
export class PrismaLinkedRecords implements LinkedRecords {
  constructor(private readonly host: PrismaTransactionHost) {}

  /** `undefined` when the resource cannot hold documents, `null` when the record is gone. */
  async labelOf(resource: ResourceKey, id: string): Promise<string | null | undefined> {
    const lookup = LOOKUPS.get(resource);
    return lookup === undefined ? undefined : lookup(this.host.client, id);
  }
}

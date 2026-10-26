import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import { STOCK_LEDGER, type StockLedger } from '../../../shared/domain/ports/stock-ledger.port';
import { type ActingUser, mergeDefined } from '../../../shared/application/listing/list-query';
import {
  PRODUCT_IN_USE,
  type ProductInput,
  type ProductRecord,
  productValues,
} from '../domain/product';
import {
  PRODUCT_REPOSITORY,
  type ProductFilter,
  type ProductRepository,
} from '../domain/ports/product.repository';
import { type MasterListInput, MasterUseCases } from './master.use-cases';

export interface ProductListInput extends MasterListInput {
  readonly categoryId?: string | undefined;
}

/**
 * Products of `/productos`. A new product gets a zero stock row in every active warehouse and
 * its minimum stock is copied to those rows whenever it changes.
 */
@Injectable()
export class ProductsUseCases extends MasterUseCases<
  ProductRecord,
  ProductFilter,
  ProductListInput
> {
  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(AUDIT_LOGGER) audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) unseen: UnseenRecords,
    @Inject(PRODUCT_REPOSITORY) private readonly repo: ProductRepository,
    @Inject(STOCK_LEDGER) private readonly stock: StockLedger,
  ) {
    super({ uow, audit, unseen }, repo, {
      key: 'productos',
      inUse: PRODUCT_IN_USE,
      reference: (record) => record.sku,
    });
  }

  protected filters(input: ProductListInput): ProductFilter {
    return { status: input.status, categoryId: input.categoryId };
  }

  create(input: ProductInput, actor: ActingUser): Promise<ProductRecord> {
    return this.uow.run(async () => {
      const created = await this.repo.create(await productValues(input, this.repo));
      await this.stock.initializeForProduct(created.id);
      return this.created(actor, created);
    });
  }

  update(id: string, patch: ProductInput, actor: ActingUser): Promise<ProductRecord> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const merged = mergeDefined<ProductInput>(current, patch);
      const values = await productValues(merged, this.repo, current);
      const updated = await this.repo.update(id, values);
      if (values.minStock !== current.minStock) {
        await this.repo.syncMinStock(id, values.minStock);
      }
      return this.updated(actor, updated);
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import {
  SEQUENCE_GENERATOR,
  type SequenceGenerator,
} from '../../../shared/domain/ports/sequence-generator.port';
import { STOCK_LEDGER, type StockLedger } from '../../../shared/domain/ports/stock-ledger.port';
import { type ActingUser, mergeDefined } from '../../../shared/application/listing/list-query';
import { formatCode } from '../../../shared/domain/numbering/document-number';
import {
  WAREHOUSE_CODE,
  WAREHOUSE_IN_USE,
  type WarehouseInput,
  type WarehouseRecord,
  warehouseValues,
} from '../domain/warehouse';
import type { StatusFilter } from '../domain/ports/master.repository';
import {
  WAREHOUSE_REPOSITORY,
  type WarehouseRepository,
} from '../domain/ports/warehouse.repository';
import { type MasterListInput, MasterUseCases } from './master.use-cases';

/**
 * Warehouses of `/almacenes`; the code `ALM-01` comes from a sequence and a new warehouse
 * gets a zero stock row for every product.
 */
@Injectable()
export class WarehousesUseCases extends MasterUseCases<
  WarehouseRecord,
  StatusFilter,
  MasterListInput
> {
  constructor(
    @Inject(UNIT_OF_WORK) uow: UnitOfWork,
    @Inject(AUDIT_LOGGER) audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) unseen: UnseenRecords,
    @Inject(WAREHOUSE_REPOSITORY) private readonly repo: WarehouseRepository,
    @Inject(SEQUENCE_GENERATOR) private readonly sequence: SequenceGenerator,
    @Inject(STOCK_LEDGER) private readonly stock: StockLedger,
  ) {
    super({ uow, audit, unseen }, repo, {
      key: 'almacenes',
      inUse: WAREHOUSE_IN_USE,
      reference: (record) => record.code,
    });
  }

  protected filters(input: MasterListInput): StatusFilter {
    return { status: input.status };
  }

  create(input: WarehouseInput, actor: ActingUser): Promise<WarehouseRecord> {
    return this.uow.run(async () => {
      const values = await warehouseValues(input, this.repo);
      const code = formatCode(
        WAREHOUSE_CODE.prefix,
        await this.sequence.next(WAREHOUSE_CODE.key),
        WAREHOUSE_CODE.digits,
      );
      const created = await this.repo.create(code, values);
      await this.stock.initializeForWarehouse(created.id);
      return this.created(actor, created);
    });
  }

  update(id: string, patch: WarehouseInput, actor: ActingUser): Promise<WarehouseRecord> {
    return this.uow.run(async () => {
      const current = await this.require(id);
      const merged = mergeDefined<WarehouseInput>(current, patch);
      return this.updated(
        actor,
        await this.repo.update(id, await warehouseValues(merged, this.repo, id)),
      );
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import {
  SEQUENCE_GENERATOR,
  type SequenceGenerator,
} from '../../../shared/domain/ports/sequence-generator.port';
import { STOCK_LEDGER, type StockLedger } from '../../../shared/domain/ports/stock-ledger.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import { formatLimaDate } from '../../../shared/domain/time/lima-time';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  mergeDefined,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import { requireAction } from '../../../shared/application/listing/resource-actions';
import {
  type TransferRecord,
  type TransferStatus,
  type TransferView,
  toTransferView,
} from '../domain/inventory';
import { CREATED_ACTION, UPDATED_ACTION } from '../../../shared/domain/audit/audit-actions';
import { documentNumber } from '../../../shared/domain/numbering/document-number';
import { requireActiveRecord } from '../../../shared/domain/validation/record-rules';
import { INVENTORY_CATALOG, type InventoryCatalog } from '../domain/ports/inventory-catalog';
import {
  TRANSFER_REPOSITORY,
  type TransferRepository,
} from '../domain/ports/inventory.repositories';
import {
  assertCancellable,
  assertCompletable,
  assertEditable,
  type TransferInput,
  transferValues,
} from '../domain/transfer-rules';
import { found } from '../../../shared/application/records/found';
import { recordAudit } from '../../../shared/application/audit/record-audit';

export interface TransferListInput extends ListInput {
  readonly status?: TransferStatus | undefined;
  readonly productId?: string | undefined;
  readonly warehouseId?: string | undefined;
}

/** Transfers of `/transferencias`: the stock moves only when a pending transfer is completed. */
@Injectable()
export class TransfersUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(TRANSFER_REPOSITORY) private readonly transfers: TransferRepository,
    @Inject(INVENTORY_CATALOG) private readonly catalog: InventoryCatalog,
    @Inject(STOCK_LEDGER) private readonly ledger: StockLedger,
    @Inject(SEQUENCE_GENERATOR) private readonly sequences: SequenceGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
  ) {}

  async list(input: TransferListInput): Promise<ListOutput<TransferView>> {
    const result = await this.transfers.list({
      ...toListCriteria(input),
      status: input.status,
      productId: input.productId,
      warehouseId: input.warehouseId,
    });
    return {
      items: result.items.map(toTransferView),
      total: result.total,
      paged: input.page !== undefined,
    };
  }

  async get(id: string): Promise<TransferView> {
    return toTransferView(found(await this.transfers.findById(id)));
  }

  create(input: TransferInput, actor: ActingUser): Promise<TransferView> {
    return this.uow.run(async () => {
      const values = await transferValues(input, this.catalog, this.today());
      const number = documentNumber('TR-', await this.sequences.next('transferencias'));
      const created = await this.transfers.create(number, values);
      await this.unseen.recordCreated('transferencias', created.id, actor.id);
      await this.record(actor, CREATED_ACTION, created);
      return toTransferView(created);
    });
  }

  update(id: string, patch: TransferInput, actor: ActingUser): Promise<TransferView> {
    return this.uow.run(async () => {
      const current = found(await this.transfers.lockById(id));
      assertEditable(current);
      const values = await transferValues(
        mergeDefined<TransferInput>(current, patch),
        this.catalog,
        this.today(),
      );
      const updated = await this.transfers.update(id, values);
      await this.record(actor, UPDATED_ACTION, updated);
      return toTransferView(updated);
    });
  }

  /** `complete` moves the units at the origin's average cost; `cancel` closes it untouched. */
  runAction(id: string, actionId: string, actor: ActingUser): Promise<TransferView> {
    return this.uow.run(async () => {
      const action = requireAction('transferencias', actionId);
      const current = found(await this.transfers.lockById(id));
      if (action.id === 'complete') {
        assertCompletable(current);
        await this.moveStock(current);
      } else {
        assertCancellable(current);
      }
      const updated = await this.transfers.setStatus(
        id,
        action.id === 'complete' ? 'completed' : 'cancelled',
      );
      await this.record(actor, action.label, updated);
      return toTransferView(updated);
    });
  }

  private async moveStock(transfer: TransferRecord): Promise<void> {
    await requireActiveRecord(
      transfer.destinationWarehouseId,
      (id) => this.catalog.findWarehouse(id),
      'el almacén de destino',
    );
    const origin = await this.catalog.findStock(transfer.productId, transfer.originWarehouseId);
    if (origin === null) {
      throw new BusinessError('Selecciona el stock de origen.');
    }
    const movement = {
      productId: transfer.productId,
      origin: 'transfer',
      reference: transfer.number,
      date: this.today(),
    } as const;
    await this.ledger.move({
      ...movement,
      warehouseId: transfer.originWarehouseId,
      quantity: -transfer.quantity,
    });
    await this.ledger.move({
      ...movement,
      warehouseId: transfer.destinationWarehouseId,
      quantity: transfer.quantity,
      unitCost: origin.unitCost,
    });
  }

  private today(): string {
    return formatLimaDate(this.clock.now());
  }

  private record(actor: ActingUser, action: string, transfer: TransferRecord): Promise<void> {
    return recordAudit(this.audit, 'inventario', actor, 'transferencias', action, transfer.number);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { actorOf } from '../../../shared/domain/authorization/authenticated-user';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import { AUDIT_LOGGER, type AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import { CLOCK, type Clock } from '../../../shared/domain/ports/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../../shared/domain/ports/id-generator.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import {
  UNSEEN_RECORDS,
  type UnseenRecords,
} from '../../../shared/domain/ports/unseen-records.port';
import {
  type ActingUser,
  type ListInput,
  type ListOutput,
  mergeDefined,
  toListCriteria,
} from '../../../shared/application/listing/list-query';
import {
  type DocumentCategory,
  type DocumentInput,
  type DocumentRecord,
  documentValues,
  editableFields,
} from '../domain/document';
import {
  FILE_REQUIRED,
  inspectFile,
  isInlineType,
  type UploadedFile,
} from '../domain/document-file';
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
  LINKED_RECORDS,
  type LinkedRecords,
} from '../domain/ports/document.repository';
import {
  CREATED_ACTION,
  REMOVED_ACTION,
  UPDATED_ACTION,
} from '../../../shared/domain/audit/audit-actions';
import {
  type StagedWrite,
  STORAGE_DRIVER,
  type StorageDriver,
} from '../domain/ports/storage-driver.port';

const RESOURCE = 'documentos';
const FILE_MISSING = 'El archivo del documento ya no existe.';

export interface DocumentListInput extends ListInput {
  readonly category?: DocumentCategory | undefined;
  readonly linkedResource?: string | undefined;
  readonly linkedId?: string | undefined;
}

export interface DocumentDownload {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  /** Safe to render in the browser; every other type is served as an attachment. */
  readonly inline: boolean;
}

/** Documents of `/documentos`: metadata in the repository, bytes behind the storage driver. */
@Injectable()
export class DocumentsUseCases {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(AUDIT_LOGGER) private readonly audit: AuditLogger,
    @Inject(UNSEEN_RECORDS) private readonly unseen: UnseenRecords,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(DOCUMENT_REPOSITORY) private readonly repository: DocumentRepository,
    @Inject(LINKED_RECORDS) private readonly links: LinkedRecords,
    @Inject(STORAGE_DRIVER) private readonly storage: StorageDriver,
  ) {}

  async list(input: DocumentListInput): Promise<ListOutput<DocumentRecord>> {
    const result = await this.repository.list({
      ...toListCriteria(input),
      category: input.category,
      linkedResource: input.linkedResource,
      linkedId: input.linkedId,
    });
    return { items: result.items, total: result.total, paged: input.page !== undefined };
  }

  get(id: string): Promise<DocumentRecord> {
    return this.require(id);
  }

  /** The id is also the storage key, so the stored name never comes from the client. */
  create(
    input: DocumentInput,
    file: UploadedFile | undefined,
    actor: ActingUser,
  ): Promise<DocumentRecord> {
    return this.storing(async (writes) => {
      const values = await documentValues(input, this.links, true);
      if (file === undefined) {
        throw new BusinessError(FILE_REQUIRED);
      }
      const info = inspectFile(file);
      const id = this.ids.next();
      const record = await this.repository.create({
        id,
        ...values,
        ...info,
        uploadedAt: this.clock.now(),
        uploadedById: actor.id,
        uploadedBy: actor.name,
      });
      writes.push(await this.storage.stage(id, file.bytes));
      await this.unseen.recordCreated(RESOURCE, id, actor.id);
      await this.record(actor, CREATED_ACTION, record);
      return record;
    });
  }

  /** Merges the body with the stored record; the file is replaced only when a new one comes. */
  update(
    id: string,
    input: DocumentInput,
    file: UploadedFile | undefined,
    actor: ActingUser,
  ): Promise<DocumentRecord> {
    return this.storing(async (writes) => {
      const current = await this.require(id);
      const values = await documentValues(
        mergeDefined(editableFields(current), input),
        this.links,
        false,
      );
      const info = file === undefined ? undefined : inspectFile(file);
      const updated = await this.repository.update(id, values, info);
      if (file !== undefined) {
        writes.push(await this.storage.stage(id, file.bytes));
      }
      await this.record(actor, UPDATED_ACTION, updated);
      return updated;
    });
  }

  async remove(id: string, actor: ActingUser): Promise<void> {
    await this.uow.run(async () => {
      const current = await this.require(id);
      await this.repository.remove(id);
      await this.unseen.forget(RESOURCE, id);
      await this.record(actor, REMOVED_ACTION, current);
    });
    await this.storage.remove(id);
  }

  async download(id: string): Promise<DocumentDownload> {
    const record = await this.require(id);
    const bytes = await this.storage.get(id);
    if (bytes === null || bytes.length === 0) {
      throw new NotFoundError(FILE_MISSING);
    }
    return {
      fileName: record.fileName,
      mimeType: record.mimeType,
      bytes,
      inline: isInlineType(record.mimeType),
    };
  }

  /**
   * Runs the work in a unit of work and settles the bytes it staged once that ended: kept after
   * the commit, dropped after a rollback, so a failed replacement never loses the previous file.
   */
  private async storing<T>(work: (writes: StagedWrite[]) => Promise<T>): Promise<T> {
    const writes: StagedWrite[] = [];
    let result: T;
    try {
      result = await this.uow.run(() => work(writes));
    } catch (error) {
      await Promise.allSettled(writes.map((write) => write.discard()));
      throw error;
    }
    for (const write of writes) {
      await write.commit();
    }
    return result;
  }

  private async require(id: string): Promise<DocumentRecord> {
    const record = await this.repository.findById(id);
    if (record === null) {
      throw new NotFoundError();
    }
    return record;
  }

  private record(actor: ActingUser, action: string, record: DocumentRecord): Promise<void> {
    return this.audit.record({
      actor: actorOf(actor),
      module: RESOURCE,
      resource: RESOURCE,
      action,
      reference: record.name,
    });
  }
}

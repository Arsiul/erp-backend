import type { ListCriteria, ListResult } from '../../../../shared/domain/listing/list-criteria';
import type {
  DocumentCategory,
  DocumentFileInfo,
  DocumentRecord,
  DocumentValues,
  LinkedRecordLookup,
} from '../document';

export const DOCUMENT_REPOSITORY = Symbol('DocumentRepository');
export const LINKED_RECORDS = Symbol('LinkedRecords');

export interface DocumentFilter {
  readonly category: DocumentCategory | undefined;
  readonly linkedResource: string | undefined;
  readonly linkedId: string | undefined;
}

export interface NewDocument extends DocumentValues, DocumentFileInfo {
  readonly id: string;
  readonly uploadedAt: Date;
  readonly uploadedById: string;
  readonly uploadedBy: string;
}

/** Metadata only: the bytes are written and read through the storage driver. */
export interface DocumentRepository {
  list(criteria: ListCriteria & DocumentFilter): Promise<ListResult<DocumentRecord>>;
  findById(id: string): Promise<DocumentRecord | null>;
  create(document: NewDocument): Promise<DocumentRecord>;
  /** `file` is given only when the PATCH brought a new file. */
  update(id: string, values: DocumentValues, file?: DocumentFileInfo): Promise<DocumentRecord>;
  remove(id: string): Promise<void>;
}

export type LinkedRecords = LinkedRecordLookup;

import { Injectable } from '@nestjs/common';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import { formatLimaDateTime } from '../../../shared/domain/time/lima-time';
import { PrismaTransactionHost } from '../../../shared/infrastructure/prisma/prisma-transaction-host';
import { contains, dateRange, listWindow } from '../../../shared/infrastructure/prisma/prisma-list';
import type { Prisma } from '../../../generated/prisma/client';
import type { DocumentFileInfo, DocumentRecord, DocumentValues } from '../domain/document';
import type {
  DocumentFilter,
  DocumentRepository,
  NewDocument,
} from '../domain/ports/document.repository';

/** Never selects `content`: lists and reads stay light whatever the storage driver. */
const DOCUMENT_FIELDS = {
  id: true,
  name: true,
  category: true,
  linkedResource: true,
  linkedId: true,
  linkedLabel: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  uploadedAt: true,
  uploadedBy: true,
} as const satisfies Prisma.StoredDocumentSelect;

type DocumentRow = Prisma.StoredDocumentGetPayload<{ select: typeof DOCUMENT_FIELDS }>;

const toRecord = (row: DocumentRow): DocumentRecord => ({
  ...row,
  linkedResource: row.linkedResource ?? '',
  linkedId: row.linkedId ?? '',
  uploadedAt: formatLimaDateTime(row.uploadedAt),
});

const EMPTY_CONTENT = new Uint8Array(0);

@Injectable()
export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly host: PrismaTransactionHost) {}

  async list(criteria: ListCriteria & DocumentFilter): Promise<ListResult<DocumentRecord>> {
    const uploadedAt = dateRange(criteria);
    const where: Prisma.StoredDocumentWhereInput = {
      ...(criteria.q === ''
        ? {}
        : {
            OR: [
              { name: contains(criteria.q) },
              { fileName: contains(criteria.q) },
              { linkedLabel: contains(criteria.q) },
              { uploadedBy: contains(criteria.q) },
            ],
          }),
      ...(criteria.category === undefined ? {} : { category: criteria.category }),
      ...(criteria.linkedResource === undefined ? {} : { linkedResource: criteria.linkedResource }),
      ...(criteria.linkedId === undefined ? {} : { linkedId: criteria.linkedId }),
      ...(uploadedAt === undefined ? {} : { uploadedAt }),
    };
    const total = await this.host.client.storedDocument.count({ where });
    const rows = await this.host.client.storedDocument.findMany({
      where,
      select: DOCUMENT_FIELDS,
      ...listWindow(criteria),
    });
    return { items: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<DocumentRecord | null> {
    const row = await this.host.client.storedDocument.findUnique({
      where: { id },
      select: DOCUMENT_FIELDS,
    });
    return row === null ? null : toRecord(row);
  }

  /** The row starts without content; the storage driver writes the bytes right after. */
  async create(document: NewDocument): Promise<DocumentRecord> {
    const row = await this.host.client.storedDocument.create({
      data: { ...document, content: EMPTY_CONTENT },
      select: DOCUMENT_FIELDS,
    });
    return toRecord(row);
  }

  async update(
    id: string,
    values: DocumentValues,
    file?: DocumentFileInfo,
  ): Promise<DocumentRecord> {
    const row = await this.host.client.storedDocument.update({
      where: { id },
      data: { ...values, ...file },
      select: DOCUMENT_FIELDS,
    });
    return toRecord(row);
  }

  async remove(id: string): Promise<void> {
    await this.host.client.storedDocument.delete({ where: { id } });
  }
}

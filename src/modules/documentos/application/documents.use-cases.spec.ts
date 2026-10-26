import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError, NotFoundError } from '../../../shared/domain/errors/domain-error';
import type { ListCriteria, ListResult } from '../../../shared/domain/listing/list-criteria';
import type { AuditEntry, AuditLogger } from '../../../shared/domain/ports/audit-logger.port';
import type { UnitOfWork } from '../../../shared/domain/ports/unit-of-work.port';
import type { UnseenRecords } from '../../../shared/domain/ports/unseen-records.port';
import type { ActingUser } from '../../../shared/application/listing/list-query';
import type { DocumentFileInfo, DocumentRecord, DocumentValues } from '../domain/document';
import { FILE_REQUIRED, FILE_TYPE_NOT_ALLOWED } from '../domain/document-file';
import type {
  DocumentFilter,
  DocumentRepository,
  LinkedRecords,
  NewDocument,
} from '../domain/ports/document.repository';
import type { StagedWrite, StorageDriver } from '../domain/ports/storage-driver.port';
import { DocumentsUseCases } from './documents.use-cases';

const ADMIN: ActingUser = { id: 'admin', name: 'Administrador' };
const NOW = new Date('2026-03-10T15:00:00.000Z');
const PDF = new TextEncoder().encode('%PDF-1.7 contenido');
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

/** Logs where each unit of work begins and ends, to place the storage writes around it. */
class ImmediateUnitOfWork implements UnitOfWork {
  constructor(private readonly log: string[]) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.log.push('begin');
    try {
      return await work();
    } finally {
      this.log.push('end');
    }
  }
}

class MemoryAudit implements AuditLogger {
  readonly entries: AuditEntry[] = [];
  failing = false;

  record(entry: AuditEntry): Promise<void> {
    if (this.failing) {
      return Promise.reject(new Error('audit down'));
    }
    this.entries.push(entry);
    return Promise.resolve();
  }

  actions(): string[] {
    return this.entries.map((entry) => `${entry.action} ${entry.reference}`);
  }
}

class MemoryUnseen implements UnseenRecords {
  readonly created: string[] = [];
  readonly forgotten: string[] = [];

  recordCreated(resource: ResourceKey, recordId: string, authorId: string): Promise<void> {
    this.created.push(`${resource}/${recordId} by ${authorId}`);
    return Promise.resolve();
  }

  forget(resource: ResourceKey, recordId: string): Promise<void> {
    this.forgotten.push(`${resource}/${recordId}`);
    return Promise.resolve();
  }
}

/** Like the disk driver: staged bytes become the stored ones only on commit. */
class MemoryStorage implements StorageDriver {
  readonly files = new Map<string, Uint8Array>();
  readonly removed: string[] = [];

  constructor(private readonly log: string[]) {}

  stage(key: string, bytes: Uint8Array): Promise<StagedWrite> {
    this.log.push(`stage ${key}`);
    return Promise.resolve({
      commit: () => {
        this.log.push(`commit ${key}`);
        this.files.set(key, bytes);
        return Promise.resolve();
      },
      discard: () => {
        this.log.push(`discard ${key}`);
        return Promise.resolve();
      },
    });
  }

  get(key: string): Promise<Uint8Array | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }

  remove(key: string): Promise<void> {
    this.removed.push(key);
    this.files.delete(key);
    return Promise.resolve();
  }
}

const toRecord = (
  id: string,
  values: DocumentValues,
  file: DocumentFileInfo,
  uploadedBy: string,
): DocumentRecord => ({
  id,
  name: values.name,
  category: values.category,
  linkedLabel: values.linkedLabel,
  fileName: file.fileName,
  fileSize: file.fileSize,
  mimeType: file.mimeType,
  linkedResource: values.linkedResource ?? '',
  linkedId: values.linkedId ?? '',
  uploadedAt: '10/03/2026 10:00',
  uploadedBy,
});

class MemoryDocuments implements DocumentRepository {
  readonly rows = new Map<string, DocumentRecord>();
  lastCriteria: (ListCriteria & DocumentFilter) | undefined;
  lastCreated: NewDocument | undefined;

  list(criteria: ListCriteria & DocumentFilter): Promise<ListResult<DocumentRecord>> {
    this.lastCriteria = criteria;
    const items = [...this.rows.values()];
    return Promise.resolve({ items, total: items.length });
  }

  findById(id: string): Promise<DocumentRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  create(document: NewDocument): Promise<DocumentRecord> {
    this.lastCreated = document;
    const record = toRecord(document.id, document, document, document.uploadedBy);
    this.rows.set(record.id, record);
    return Promise.resolve(record);
  }

  update(id: string, values: DocumentValues, file?: DocumentFileInfo): Promise<DocumentRecord> {
    const current = this.rows.get(id);
    if (current === undefined) {
      return Promise.reject(new Error('missing'));
    }
    const record = toRecord(id, values, file ?? current, current.uploadedBy);
    this.rows.set(id, record);
    return Promise.resolve(record);
  }

  remove(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

const links: LinkedRecords = {
  labelOf: (_resource, id) => Promise.resolve(id === 'c1' ? 'CLI-0001' : null),
};

function setup() {
  const audit = new MemoryAudit();
  const unseen = new MemoryUnseen();
  const log: string[] = [];
  const storage = new MemoryStorage(log);
  const repository = new MemoryDocuments();
  let sequence = 0;
  const useCases = new DocumentsUseCases(
    new ImmediateUnitOfWork(log),
    audit,
    unseen,
    { now: () => NOW },
    { next: () => `doc-${String(++sequence)}` },
    repository,
    links,
    storage,
  );
  return { useCases, audit, unseen, storage, repository, log };
}

describe('DocumentsUseCases', () => {
  it('creates a document with a server id, stores its bytes and audits it', async () => {
    const { useCases, audit, unseen, storage, repository } = setup();
    const record = await useCases.create(
      { name: 'Contrato', category: 'contract', linkedResource: 'clientes', linkedId: 'c1' },
      { originalName: '../../contrato.pdf', bytes: PDF },
      ADMIN,
    );
    expect(record).toMatchObject({
      id: 'doc-1',
      fileName: 'contrato.pdf',
      fileSize: PDF.length,
      mimeType: 'application/pdf',
      linkedLabel: 'CLI-0001',
      uploadedBy: 'Administrador',
    });
    expect(repository.lastCreated).toMatchObject({ uploadedAt: NOW, uploadedById: 'admin' });
    expect(storage.files.get('doc-1')).toBe(PDF);
    expect(unseen.created).toEqual(['documentos/doc-1 by admin']);
    expect(audit.actions()).toEqual(['Registró Contrato']);
    expect(audit.entries[0]).toMatchObject({ module: 'documentos', resource: 'documentos' });
  });

  it('requires a valid file before writing anything', async () => {
    const { useCases, storage, audit } = setup();
    await expect(useCases.create({ name: 'A' }, undefined, ADMIN)).rejects.toThrow(FILE_REQUIRED);
    await expect(
      useCases.create({ name: 'A' }, { originalName: 'a.exe', bytes: PDF }, ADMIN),
    ).rejects.toThrow(FILE_TYPE_NOT_ALLOWED);
    expect(storage.files.size).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('lists with the document filters', async () => {
    const { useCases, repository } = setup();
    await useCases.create({ name: 'A' }, { originalName: 'a.pdf', bytes: PDF }, ADMIN);
    const result = await useCases.list({ q: 'a', category: 'other', linkedResource: 'clientes' });
    expect(result).toMatchObject({ total: 1, paged: false });
    expect(repository.lastCriteria).toMatchObject({
      q: 'a',
      category: 'other',
      linkedResource: 'clientes',
      linkedId: undefined,
    });
    expect((await useCases.list({ page: 1 })).paged).toBe(true);
  });

  it('updates the metadata and keeps the file when none is sent', async () => {
    const { useCases, storage, audit } = setup();
    await useCases.create(
      { name: 'A', category: 'invoice' },
      { originalName: 'a.pdf', bytes: PDF },
      ADMIN,
    );
    const updated = await useCases.update('doc-1', { name: 'B' }, undefined, ADMIN);
    expect(updated).toMatchObject({ name: 'B', category: 'invoice', fileName: 'a.pdf' });
    expect(storage.files.get('doc-1')).toBe(PDF);
    expect(audit.actions()).toEqual(['Registró A', 'Actualizó B']);
  });

  it('replaces the file and clears the link', async () => {
    const { useCases, storage } = setup();
    await useCases.create(
      { name: 'A', linkedResource: 'clientes', linkedId: 'c1' },
      { originalName: 'a.pdf', bytes: PDF },
      ADMIN,
    );
    const updated = await useCases.update(
      'doc-1',
      { linkedResource: '', linkedId: '' },
      { originalName: 'foto.png', bytes: PNG },
      ADMIN,
    );
    expect(updated).toMatchObject({
      fileName: 'foto.png',
      mimeType: 'image/png',
      linkedResource: '',
      linkedLabel: '',
    });
    expect(storage.files.get('doc-1')).toBe(PNG);
  });

  it('stores the new bytes only after the unit of work committed', async () => {
    const { useCases, log } = setup();
    await useCases.create({ name: 'A' }, { originalName: 'a.pdf', bytes: PDF }, ADMIN);
    await useCases.update('doc-1', {}, { originalName: 'b.png', bytes: PNG }, ADMIN);
    expect(log).toEqual([
      'begin',
      'stage doc-1',
      'end',
      'commit doc-1',
      'begin',
      'stage doc-1',
      'end',
      'commit doc-1',
    ]);
  });

  it('keeps the previous file and drops the new bytes when the replacement fails', async () => {
    const { useCases, storage, audit, log } = setup();
    await useCases.create({ name: 'A' }, { originalName: 'a.pdf', bytes: PDF }, ADMIN);
    log.length = 0;
    audit.failing = true;
    await expect(
      useCases.update('doc-1', {}, { originalName: 'b.png', bytes: PNG }, ADMIN),
    ).rejects.toThrow('audit down');
    expect(log).toEqual(['begin', 'stage doc-1', 'end', 'discard doc-1']);
    expect(storage.files.get('doc-1')).toBe(PDF);
  });

  it('drops the bytes of a document whose creation failed', async () => {
    const { useCases, storage, audit, log } = setup();
    audit.failing = true;
    await expect(
      useCases.create({ name: 'A' }, { originalName: 'a.pdf', bytes: PDF }, ADMIN),
    ).rejects.toThrow('audit down');
    expect(log).toEqual(['begin', 'stage doc-1', 'end', 'discard doc-1']);
    expect(storage.files.size).toBe(0);
  });

  it('removes the row, the unseen marks and then the bytes', async () => {
    const { useCases, storage, unseen, audit } = setup();
    await useCases.create({ name: 'A' }, { originalName: 'a.pdf', bytes: PDF }, ADMIN);
    await useCases.remove('doc-1', ADMIN);
    expect(storage.removed).toEqual(['doc-1']);
    expect(unseen.forgotten).toEqual(['documentos/doc-1']);
    expect(audit.actions()).toEqual(['Registró A', 'Eliminó A']);
    await expect(useCases.get('doc-1')).rejects.toThrow(NotFoundError);
  });

  it('downloads the bytes with the inline flag', async () => {
    const { useCases } = setup();
    await useCases.create({ name: 'A' }, { originalName: 'a.pdf', bytes: PDF }, ADMIN);
    await useCases.create(
      { name: 'B' },
      { originalName: 'b.docx', bytes: Uint8Array.from([0x50, 0x4b, 3, 4]) },
      ADMIN,
    );
    await expect(useCases.download('doc-1')).resolves.toMatchObject({
      fileName: 'a.pdf',
      mimeType: 'application/pdf',
      bytes: PDF,
      inline: true,
    });
    await expect(useCases.download('doc-2')).resolves.toMatchObject({ inline: false });
  });

  it('answers 404 when the row or its bytes are gone', async () => {
    const { useCases, storage } = setup();
    await expect(useCases.download('nada')).rejects.toThrow(NotFoundError);
    await expect(useCases.update('nada', {}, undefined, ADMIN)).rejects.toThrow(NotFoundError);
    await expect(useCases.remove('nada', ADMIN)).rejects.toThrow(NotFoundError);
    await useCases.create({ name: 'A' }, { originalName: 'a.pdf', bytes: PDF }, ADMIN);
    storage.files.set('doc-1', new Uint8Array(0));
    await expect(useCases.download('doc-1')).rejects.toThrow(
      'El archivo del documento ya no existe.',
    );
    storage.files.delete('doc-1');
    await expect(useCases.download('doc-1')).rejects.toThrow(NotFoundError);
  });

  it('rejects a link to a missing record', async () => {
    const { useCases } = setup();
    await expect(
      useCases.create(
        { name: 'A', linkedResource: 'clientes', linkedId: 'x' },
        { originalName: 'a.pdf', bytes: PDF },
        ADMIN,
      ),
    ).rejects.toThrow(BusinessError);
  });
});

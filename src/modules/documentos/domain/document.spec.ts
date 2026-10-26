import type { ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import {
  type DocumentRecord,
  documentValues,
  editableFields,
  LINKED_MODULE_MISSING,
  LINKED_RECORD_MISSING,
  type LinkedRecordLookup,
} from './document';
import {
  FILE_EMPTY,
  FILE_INVALID,
  FILE_TOO_LARGE,
  FILE_TYPE_NOT_ALLOWED,
  inspectFile,
  isInlineType,
  MAX_DOCUMENT_BYTES,
  sanitizeFileName,
} from './document-file';

const lookup: LinkedRecordLookup = {
  labelOf(resource: ResourceKey, id: string) {
    if (resource === 'auditoria') {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(id === 'c1' ? 'CLI-0001' : null);
  },
};

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const text = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('documentValues', () => {
  it('defaults a new document to «other» without a link', async () => {
    await expect(documentValues({ name: ' Contrato ' }, lookup, true)).resolves.toEqual({
      name: 'Contrato',
      category: 'other',
      linkedResource: null,
      linkedId: null,
      linkedLabel: '',
    });
  });

  it('requires a name and a valid category', async () => {
    await expect(documentValues({ name: '' }, lookup, true)).rejects.toThrow(
      'Escribe un nombre para el documento.',
    );
    await expect(documentValues({ name: 'A', category: 'x' }, lookup, true)).rejects.toThrow(
      'Elige la categoría.',
    );
    await expect(documentValues({ name: 'A' }, lookup, false)).rejects.toThrow(
      'Elige la categoría.',
    );
  });

  it('resolves the label of the linked record', async () => {
    const values = await documentValues(
      { name: 'Guía', category: 'guide', linkedResource: 'clientes', linkedId: 'c1' },
      lookup,
      false,
    );
    expect(values).toMatchObject({
      category: 'guide',
      linkedResource: 'clientes',
      linkedId: 'c1',
      linkedLabel: 'CLI-0001',
    });
  });

  it('ignores a half link and rejects unknown modules or records', async () => {
    await expect(
      documentValues({ name: 'A', linkedResource: 'clientes' }, lookup, true),
    ).resolves.toMatchObject({ linkedResource: null });
    await expect(
      documentValues({ name: 'A', linkedResource: 'nada', linkedId: 'c1' }, lookup, true),
    ).rejects.toThrow(LINKED_MODULE_MISSING);
    await expect(
      documentValues({ name: 'A', linkedResource: 'auditoria', linkedId: 'c1' }, lookup, true),
    ).rejects.toThrow(LINKED_MODULE_MISSING);
    await expect(
      documentValues({ name: 'A', linkedResource: 'clientes', linkedId: 'c2' }, lookup, true),
    ).rejects.toThrow(LINKED_RECORD_MISSING);
  });

  it('exposes the editable fields of a record', () => {
    const record: DocumentRecord = {
      id: 'd1',
      name: 'Contrato',
      category: 'contract',
      linkedResource: '',
      linkedId: '',
      linkedLabel: '',
      fileName: 'a.pdf',
      fileSize: 5,
      mimeType: 'application/pdf',
      uploadedAt: '01/01/2026 10:00',
      uploadedBy: 'Administrador',
    };
    expect(editableFields(record)).toEqual({
      name: 'Contrato',
      category: 'contract',
      linkedResource: '',
      linkedId: '',
    });
  });
});

describe('sanitizeFileName', () => {
  it('keeps the last path segment without control characters', () => {
    expect(sanitizeFileName('C:\\temp\\..\\a\u0000b.pdf')).toBe('ab.pdf');
    expect(sanitizeFileName('../../etc/passwd ')).toBe('passwd');
  });

  it('caps long names and keeps a short extension', () => {
    const long = sanitizeFileName(`${'a'.repeat(300)}.pdf`);
    expect(long).toHaveLength(180);
    expect(long.endsWith('.pdf')).toBe(true);
    expect(sanitizeFileName('b'.repeat(300))).toHaveLength(180);
    expect(sanitizeFileName(`${'c'.repeat(300)}.${'x'.repeat(20)}`)).toHaveLength(180);
  });
});

describe('inspectFile', () => {
  const pdf = text('%PDF-1.7 body');

  it('derives the MIME type from the extension', () => {
    expect(inspectFile({ originalName: 'Factura Ñ.PDF', bytes: pdf })).toEqual({
      fileName: 'Factura Ñ.PDF',
      fileSize: pdf.length,
      mimeType: 'application/pdf',
    });
  });

  it.each([
    ['a.png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1), 'image/png'],
    ['a.jpg', bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'],
    ['a.jpeg', bytes(0xff, 0xd8, 0xff, 0xe1), 'image/jpeg'],
    ['a.gif', text('GIF89a...'), 'image/gif'],
    ['b.gif', text('GIF87a...'), 'image/gif'],
    ['a.webp', text('RIFF\u0001\u0002\u0003\u0004WEBPVP8 '), 'image/webp'],
    ['a.txt', text('hola, año'), 'text/plain'],
    ['a.csv', text('a;b\n1;2'), 'text/csv'],
    ['a.doc', bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0), 'application/msword'],
    ['a.xlsx', bytes(0x50, 0x4b, 0x03, 0x04, 0), 'spreadsheetml.sheet'],
  ])('accepts %s', (originalName, content, mimeType) => {
    expect(inspectFile({ originalName, bytes: content }).mimeType).toContain(mimeType);
  });

  it.each([
    ['', pdf, FILE_INVALID],
    ['.pdf', pdf, FILE_INVALID],
    ['a.pdf', new Uint8Array(0), FILE_EMPTY],
    ['a.pdf', new Uint8Array(MAX_DOCUMENT_BYTES + 1), FILE_TOO_LARGE],
    ['a.exe', pdf, FILE_TYPE_NOT_ALLOWED],
    ['sin-extension', pdf, FILE_TYPE_NOT_ALLOWED],
    ['a.pdf', text('<html>'), FILE_INVALID],
    ['a.webp', text('RIFF\u0001\u0002\u0003\u0004AVI '), FILE_INVALID],
    ['a.gif', text('GIF'), FILE_INVALID],
    ['a.txt', bytes(0x61, 0, 0x62), FILE_INVALID],
    ['a.txt', bytes(0xc3, 0x28), FILE_INVALID],
  ])('rejects «%s»', (originalName, content, message) => {
    const inspect = (): unknown => inspectFile({ originalName, bytes: content });
    expect(inspect).toThrow(BusinessError);
    expect(inspect).toThrow(message);
  });
});

describe('isInlineType', () => {
  it('renders only images, PDF and plain text', () => {
    expect(isInlineType('application/pdf')).toBe(true);
    expect(isInlineType('image/png')).toBe(true);
    expect(isInlineType('text/plain')).toBe(true);
    expect(isInlineType('text/csv')).toBe(false);
    expect(isInlineType('application/msword')).toBe(false);
    expect(isInlineType('text/html')).toBe(false);
  });
});

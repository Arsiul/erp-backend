import { isResourceKey, type ResourceKey } from '../../../shared/domain/authorization/resources';
import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { optionalText, pickEnum, requireText } from '../../../shared/domain/validation/field-rules';

export const DOCUMENT_CATEGORIES = ['contract', 'invoice', 'guide', 'order', 'other'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const LINKED_MODULE_MISSING = 'El módulo vinculado no existe.';
export const LINKED_RECORD_MISSING = 'El registro vinculado ya no existe.';
const NAME_REQUIRED = 'Escribe un nombre para el documento.';
const CATEGORY_INVALID = 'Elige la categoría.';

export interface DocumentLink {
  readonly linkedResource: ResourceKey | null;
  readonly linkedId: string | null;
  readonly linkedLabel: string;
}

export interface DocumentValues extends DocumentLink {
  readonly name: string;
  readonly category: DocumentCategory;
}

/** Metadata of the stored file; the bytes live behind the storage driver. */
export interface DocumentFileInfo {
  readonly fileName: string;
  readonly fileSize: number;
  readonly mimeType: string;
}

/**
 * The shape of `StoredDocument` in the frontend without `content`: the bytes are only served by
 * the download endpoint. An absent link is answered as empty strings, like the mock.
 */
export interface DocumentRecord extends DocumentFileInfo {
  readonly id: string;
  readonly name: string;
  readonly category: DocumentCategory;
  readonly linkedResource: string;
  readonly linkedId: string;
  readonly linkedLabel: string;
  readonly uploadedAt: string;
  readonly uploadedBy: string;
}

export interface DocumentInput {
  readonly name?: unknown;
  readonly category?: unknown;
  readonly linkedResource?: unknown;
  readonly linkedId?: unknown;
}

export interface LinkedRecordLookup {
  /** Label of the linked record, or `null` when it does not exist; `undefined` when the resource cannot be linked. */
  labelOf(resource: ResourceKey, id: string): Promise<string | null | undefined>;
}

const NO_LINK: DocumentLink = { linkedResource: null, linkedId: null, linkedLabel: '' };

async function linkValues(input: DocumentInput, lookup: LinkedRecordLookup): Promise<DocumentLink> {
  const resource = optionalText(input.linkedResource);
  const id = optionalText(input.linkedId);
  if (resource === '' || id === '') {
    return NO_LINK;
  }
  if (!isResourceKey(resource)) {
    throw new BusinessError(LINKED_MODULE_MISSING);
  }
  const label = await lookup.labelOf(resource, id);
  if (label === undefined) {
    throw new BusinessError(LINKED_MODULE_MISSING);
  }
  if (label === null) {
    throw new BusinessError(LINKED_RECORD_MISSING);
  }
  return { linkedResource: resource, linkedId: id, linkedLabel: label };
}

/** Same rules as the frontend mock; `other` is the category of a new document without one. */
export async function documentValues(
  input: DocumentInput,
  lookup: LinkedRecordLookup,
  isNew: boolean,
): Promise<DocumentValues> {
  return {
    name: requireText(input.name, NAME_REQUIRED),
    category: pickEnum(
      input.category,
      DOCUMENT_CATEGORIES,
      CATEGORY_INVALID,
      isNew ? 'other' : undefined,
    ),
    ...(await linkValues(input, lookup)),
  };
}

/** The editable fields of a stored record, ready to be merged with a PATCH body. */
export const editableFields = (record: DocumentRecord): DocumentInput => ({
  name: record.name,
  category: record.category,
  linkedResource: record.linkedResource,
  linkedId: record.linkedId,
});

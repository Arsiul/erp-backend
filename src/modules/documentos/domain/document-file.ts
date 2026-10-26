import { BusinessError } from '../../../shared/domain/errors/domain-error';
import type { DocumentFileInfo } from './document';

/** Same limit as the frontend and the CHECK on `stored_documents.file_size`. */
export const MAX_DOCUMENT_BYTES = 1024 * 1024;
const MAX_FILE_NAME_LENGTH = 180;

export const FILE_REQUIRED = 'Adjunta un archivo.';
export const FILE_INVALID = 'El archivo no es válido.';
export const FILE_EMPTY = 'El archivo está vacío.';
export const FILE_TOO_LARGE = 'El archivo supera 1 MB.';
export const FILE_TYPE_NOT_ALLOWED =
  'Ese tipo de archivo no está permitido. Usa PDF, imagen, Word, Excel, PowerPoint, TXT o CSV.';

/** A file as received from the client: its name and size are not trusted. */
export interface UploadedFile {
  readonly originalName: string;
  readonly bytes: Uint8Array;
}

type Signature = (bytes: Uint8Array) => boolean;

const startsWith =
  (...prefix: readonly number[]): Signature =>
  (bytes) =>
    bytes.length >= prefix.length && prefix.every((byte, index) => bytes[index] === byte);

const ascii = (text: string): number[] =>
  Array.from({ length: text.length }, (_, index) => text.charCodeAt(index));

const isPdf = startsWith(...ascii('%PDF-'));
const isPng = startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const isJpeg = startsWith(0xff, 0xd8, 0xff);
const isGif: Signature = (bytes) =>
  startsWith(...ascii('GIF87a'))(bytes) || startsWith(...ascii('GIF89a'))(bytes);
const isWebp: Signature = (bytes) =>
  startsWith(...ascii('RIFF'))(bytes) && startsWith(...ascii('WEBP'))(bytes.subarray(8));
const isZipContainer = startsWith(0x50, 0x4b, 0x03, 0x04);
const isOleContainer = startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

const utf8 = new TextDecoder('utf-8', { fatal: true });
const isPlainText: Signature = (bytes) => {
  if (bytes.includes(0)) {
    return false;
  }
  try {
    utf8.decode(bytes);
    return true;
  } catch {
    return false;
  }
};

interface FileType {
  readonly mimeType: string;
  readonly matches: Signature;
  /** Shown in the browser instead of downloaded. */
  readonly inline: boolean;
}

const OPEN_XML = 'application/vnd.openxmlformats-officedocument';

/** Allowed extensions; the stored MIME type comes from here, never from the client. */
const FILE_TYPES: ReadonlyMap<string, FileType> = new Map(
  Object.entries({
    pdf: { mimeType: 'application/pdf', matches: isPdf, inline: true },
    png: { mimeType: 'image/png', matches: isPng, inline: true },
    jpg: { mimeType: 'image/jpeg', matches: isJpeg, inline: true },
    jpeg: { mimeType: 'image/jpeg', matches: isJpeg, inline: true },
    gif: { mimeType: 'image/gif', matches: isGif, inline: true },
    webp: { mimeType: 'image/webp', matches: isWebp, inline: true },
    txt: { mimeType: 'text/plain', matches: isPlainText, inline: true },
    csv: { mimeType: 'text/csv', matches: isPlainText, inline: false },
    doc: { mimeType: 'application/msword', matches: isOleContainer, inline: false },
    xls: { mimeType: 'application/vnd.ms-excel', matches: isOleContainer, inline: false },
    ppt: { mimeType: 'application/vnd.ms-powerpoint', matches: isOleContainer, inline: false },
    docx: {
      mimeType: `${OPEN_XML}.wordprocessingml.document`,
      matches: isZipContainer,
      inline: false,
    },
    xlsx: { mimeType: `${OPEN_XML}.spreadsheetml.sheet`, matches: isZipContainer, inline: false },
    pptx: {
      mimeType: `${OPEN_XML}.presentationml.presentation`,
      matches: isZipContainer,
      inline: false,
    },
  } satisfies Record<string, FileType>),
);

const INLINE_MIME_TYPES = new Set(
  [...FILE_TYPES.values()].filter((type) => type.inline).map((type) => type.mimeType),
);

/** Keeps only the last path segment and drops control characters. */
export function sanitizeFileName(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/\p{Cc}/gu, '').trim();
  if (clean.length <= MAX_FILE_NAME_LENGTH) {
    return clean;
  }
  const dot = clean.lastIndexOf('.');
  const extension = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : '';
  return clean.slice(0, MAX_FILE_NAME_LENGTH - extension.length) + extension;
}

const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
};

/**
 * Accepts only whitelisted extensions whose content starts with the expected signature, so a
 * renamed executable or HTML page is rejected. The size is measured on the received bytes.
 */
export function inspectFile(file: UploadedFile): DocumentFileInfo {
  const fileName = sanitizeFileName(file.originalName);
  if (fileName === '' || fileName.startsWith('.')) {
    throw new BusinessError(FILE_INVALID);
  }
  const fileSize = file.bytes.length;
  if (fileSize === 0) {
    throw new BusinessError(FILE_EMPTY);
  }
  if (fileSize > MAX_DOCUMENT_BYTES) {
    throw new BusinessError(FILE_TOO_LARGE);
  }
  const type = FILE_TYPES.get(extensionOf(fileName));
  if (type === undefined) {
    throw new BusinessError(FILE_TYPE_NOT_ALLOWED);
  }
  if (!type.matches(file.bytes)) {
    throw new BusinessError(FILE_INVALID);
  }
  return { fileName, fileSize, mimeType: type.mimeType };
}

/** True for the types that are safe to render in the browser (images, PDF and plain text). */
export const isInlineType = (mimeType: string): boolean => INLINE_MIME_TYPES.has(mimeType);

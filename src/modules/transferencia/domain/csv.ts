/** CSV with `;` as separator (what Excel in Spanish expects) and a UTF-8 BOM. */
export const CSV_SEPARATOR = ';';
const BOM = '﻿';

export type CsvValue = string | number | null | undefined;

const quote = (value: CsvValue): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [headers, ...rows].map((row) => row.map(quote).join(CSV_SEPARATOR));
  return BOM + lines.join('\r\n') + '\r\n';
}

/** One data row keyed by lower-case header, plus its line number in the file. */
export interface CsvRow {
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
}

/** Parses quoted fields, `""` escapes and line breaks inside quotes. Accepts `,` when the header has no `;`. */
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const separator = firstLine.includes(';') || !firstLine.includes(',') ? ';' : ',';
  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        if (char === '\n') line++;
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === separator) {
      fields.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      fields.push(field);
      records.push({ line: recordLine, fields });
      fields = [];
      field = '';
      line++;
      recordLine = line;
    } else {
      field += char;
    }
  }
  if (field !== '' || fields.length > 0) {
    fields.push(field);
    records.push({ line: recordLine, fields });
  }
  const nonEmpty = records.filter((r) => r.fields.some((f) => f.trim() !== ''));
  const [head, ...data] = nonEmpty;
  const headers = (head?.fields ?? []).map((h) => h.trim().toLowerCase());
  const rows = data.map((r) => ({
    line: r.line,
    values: Object.fromEntries(headers.map((h, i) => [h, (r.fields[i] ?? '').trim()])),
  }));
  return { headers, rows };
}

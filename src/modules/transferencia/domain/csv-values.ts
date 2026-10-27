import { BusinessError } from '../../../shared/domain/errors/domain-error';

/** Spanish labels written to the CSV for each stored enum value; imports accept both. */
const LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  status: { active: 'activo', inactive: 'inactivo' },
  paymentTerm: { cash: 'contado', credit: 'credito' },
};

export const label = (kind: keyof typeof LABELS, value: string): string =>
  LABELS[kind]?.[value] ?? value;

/** Maps a label or stored value back to the stored value; empty stays undefined. */
export function enumValue(kind: keyof typeof LABELS, raw: string, column: string): string | undefined {
  if (raw === '') return undefined;
  const text = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const entries = Object.entries(LABELS[kind] ?? {});
  const found = entries.find(([stored, shown]) => stored === text || shown === text);
  if (!found) {
    throw new BusinessError(
      `La columna ${column} acepta: ${entries.map(([, shown]) => shown).join(', ')}.`,
    );
  }
  return found[0];
}

/** Accepts `1234.5` and `1234,5`; empty stays undefined. */
export function numberValue(raw: string, column: string): number | undefined {
  if (raw === '') return undefined;
  const value = Number(raw.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(value)) {
    throw new BusinessError(`La columna ${column} debe ser un número.`);
  }
  return value;
}

/** Accepts `AAAA-MM-DD` and `DD/MM/AAAA`; answers `AAAA-MM-DD`. */
export function dateValue(raw: string, column: string): string | undefined {
  if (raw === '') return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (iso) return raw;
  if (local) {
    const [, d, m, y] = local;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  throw new BusinessError(`La columna ${column} debe ser una fecha AAAA-MM-DD o DD/MM/AAAA.`);
}

export const isoDate = (date: Date | null | undefined): string =>
  date ? date.toISOString().slice(0, 10) : '';

export const amount = (value: unknown): number => Number(String(value ?? 0));

export const optional = (raw: string | undefined): string | undefined =>
  raw === undefined || raw === '' ? undefined : raw;

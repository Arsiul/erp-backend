import { BusinessError } from '../../../shared/domain/errors/domain-error';
import { optionalText, requireText } from '../../../shared/domain/validation/field-rules';

/** Company settings, the shape of `Settings` in the frontend. */
export interface Settings {
  readonly companyName: string;
  readonly ruc: string;
  readonly address: string;
  readonly phone: string;
  readonly email: string;
  /** Fraction (0.18 = 18 %). */
  readonly igvRate: number;
  readonly invoiceSeries: string;
  readonly receiptSeries: string;
  readonly creditNoteSeries: string;
  readonly quoteValidityDays: number;
}

export type SettingsInput = Readonly<Partial<Record<keyof Settings, unknown>>>;

export const SETTINGS_RESOURCE = 'configuracion';
export const SETTINGS_REFERENCE = 'Configuración';

const RUC_PATTERN = /^\d{11}$/;
const SERIES_PATTERN = /^[A-Z][A-Z0-9]{3}$/;
const MAX_IGV_RATE = 0.5;
const MAX_QUOTE_VALIDITY_DAYS = 365;

const isNumberBetween = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function series(value: unknown, label: string): string {
  const text = optionalText(value).toUpperCase();
  if (!SERIES_PATTERN.test(text)) {
    throw new BusinessError(
      `La serie de ${label} debe tener 4 caracteres, empezando por una letra (ej.: F001).`,
    );
  }
  return text;
}

/** Same checks, order and messages as `validateSettings` in the frontend. */
export function validateSettings(input: SettingsInput): Settings {
  const ruc = optionalText(input.ruc);
  if (!RUC_PATTERN.test(ruc)) {
    throw new BusinessError('El RUC debe tener 11 dígitos.');
  }
  const igvRate = input.igvRate;
  if (!isNumberBetween(igvRate, 0, MAX_IGV_RATE)) {
    throw new BusinessError('El IGV debe estar entre 0 % y 50 %.');
  }
  const days = input.quoteValidityDays;
  if (!isNumberBetween(days, 1, MAX_QUOTE_VALIDITY_DAYS) || !Number.isInteger(days)) {
    throw new BusinessError('La vigencia de las cotizaciones debe estar entre 1 y 365 días.');
  }
  const companyName = requireText(input.companyName, 'Escribe la razón social.');
  const address = optionalText(input.address);
  const phone = optionalText(input.phone);
  const email = optionalText(input.email);
  const invoiceSeries = series(input.invoiceSeries, 'facturas');
  const receiptSeries = series(input.receiptSeries, 'boletas');
  const creditNoteSeries = series(input.creditNoteSeries, 'notas de crédito');
  if (new Set([invoiceSeries, receiptSeries, creditNoteSeries]).size !== 3) {
    throw new BusinessError('Cada tipo de comprobante necesita una serie distinta.');
  }
  return {
    companyName,
    ruc,
    address,
    phone,
    email,
    igvRate,
    invoiceSeries,
    receiptSeries,
    creditNoteSeries,
    quoteValidityDays: days,
  };
}

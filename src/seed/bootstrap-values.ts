import { EMAIL_PATTERN } from '../shared/domain/validation/field-rules';

/** Injection token of the {@link EnvReader} used by the bootstrap seeders. */
export const BOOTSTRAP_ENV = Symbol('BootstrapEnv');

/** Reads one environment variable; `undefined` when it is not set. */
export type EnvReader = (key: BootstrapVariable) => string | undefined;

export type BootstrapVariable =
  | 'INITIAL_ADMIN_NAME'
  | 'INITIAL_ADMIN_EMAIL'
  | 'INITIAL_ADMIN_PASSWORD'
  | 'COMPANY_NAME'
  | 'COMPANY_RUC';

export const MIN_ADMIN_PASSWORD_LENGTH = 12;
const RUC_PATTERN = /^\d{11}$/;

export interface InitialAdmin {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface Company {
  readonly companyName: string;
  readonly ruc: string;
}

/** Defaults of a new settings row; all of them are editable later from Configuración. */
export const DEFAULT_SETTINGS = {
  igvRate: '0.18',
  invoiceSeries: 'F001',
  receiptSeries: 'B001',
  creditNoteSeries: 'FC01',
  quoteValidityDays: 15,
} as const;

/** A bootstrap variable is missing or invalid; the seed stops and lists every problem. */
export class BootstrapConfigError extends Error {
  constructor(context: string, problems: readonly string[]) {
    super(`${context}:\n- ${problems.join('\n- ')}`);
    this.name = 'BootstrapConfigError';
  }
}

function collect(read: EnvReader, keys: readonly BootstrapVariable[]) {
  const values = new Map<BootstrapVariable, string>();
  const problems: string[] = [];
  for (const key of keys) {
    const value = read(key)?.trim() ?? '';
    if (value === '') {
      problems.push(`${key}: is required`);
    } else {
      values.set(key, value);
    }
  }
  return { value: (key: BootstrapVariable): string => values.get(key) ?? '', problems };
}

/** Initial administrator, required only while the users table is empty. */
export function initialAdminFrom(read: EnvReader): InitialAdmin {
  const { value, problems } = collect(read, [
    'INITIAL_ADMIN_NAME',
    'INITIAL_ADMIN_EMAIL',
    'INITIAL_ADMIN_PASSWORD',
  ]);
  const email = value('INITIAL_ADMIN_EMAIL').toLowerCase();
  // The password is used as given: surrounding spaces are part of it.
  const password = read('INITIAL_ADMIN_PASSWORD') ?? '';
  if (email !== '' && !EMAIL_PATTERN.test(email)) {
    problems.push('INITIAL_ADMIN_EMAIL: must be a valid email address');
  }
  if (password.trim() !== '' && password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    problems.push(
      `INITIAL_ADMIN_PASSWORD: must have at least ${String(MIN_ADMIN_PASSWORD_LENGTH)} characters`,
    );
  }
  if (problems.length > 0) {
    throw new BootstrapConfigError(
      'There are no users; cannot create the initial administrator',
      problems,
    );
  }
  return { name: value('INITIAL_ADMIN_NAME'), email, password };
}

/** Company data, required only while the settings row is missing. */
export function companyFrom(read: EnvReader): Company {
  const { value, problems } = collect(read, ['COMPANY_NAME', 'COMPANY_RUC']);
  const ruc = value('COMPANY_RUC');
  if (ruc !== '' && !RUC_PATTERN.test(ruc)) {
    problems.push('COMPANY_RUC: must have 11 digits');
  }
  if (problems.length > 0) {
    throw new BootstrapConfigError('There are no settings; cannot create them', problems);
  }
  return { companyName: value('COMPANY_NAME'), ruc };
}

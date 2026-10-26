import {
  BootstrapConfigError,
  type BootstrapVariable,
  companyFrom,
  type EnvReader,
  initialAdminFrom,
} from './bootstrap-values';

const reader =
  (values: Partial<Record<BootstrapVariable, string>>): EnvReader =>
  (key) =>
    values[key];

const VALID_ADMIN = {
  INITIAL_ADMIN_NAME: ' Administrador ',
  INITIAL_ADMIN_EMAIL: ' Admin@Empresa.PE ',
  INITIAL_ADMIN_PASSWORD: 'una-clave-segura',
};

describe('initialAdminFrom', () => {
  it('trims the name, normalizes the email and keeps the password as given', () => {
    expect(initialAdminFrom(reader(VALID_ADMIN))).toEqual({
      name: 'Administrador',
      email: 'admin@empresa.pe',
      password: 'una-clave-segura',
    });
  });

  it('lists every missing variable', () => {
    const run = () => initialAdminFrom(reader({ INITIAL_ADMIN_NAME: '   ' }));

    expect(run).toThrow(BootstrapConfigError);
    expect(run).toThrow(
      'There are no users; cannot create the initial administrator:\n' +
        '- INITIAL_ADMIN_NAME: is required\n' +
        '- INITIAL_ADMIN_EMAIL: is required\n' +
        '- INITIAL_ADMIN_PASSWORD: is required',
    );
  });

  it('rejects an invalid email and a short password', () => {
    const run = () =>
      initialAdminFrom(
        reader({ ...VALID_ADMIN, INITIAL_ADMIN_EMAIL: 'admin', INITIAL_ADMIN_PASSWORD: 'corta' }),
      );

    expect(run).toThrow('INITIAL_ADMIN_EMAIL: must be a valid email address');
    expect(run).toThrow('INITIAL_ADMIN_PASSWORD: must have at least 12 characters');
  });

  it('names the error class', () => {
    expect(new BootstrapConfigError('ctx', ['a']).name).toBe('BootstrapConfigError');
  });
});

describe('companyFrom', () => {
  it('returns the trimmed company data', () => {
    expect(
      companyFrom(reader({ COMPANY_NAME: ' Mi Empresa S.A.C. ', COMPANY_RUC: '20000000001' })),
    ).toEqual({ companyName: 'Mi Empresa S.A.C.', ruc: '20000000001' });
  });

  it('requires both variables', () => {
    expect(() => companyFrom(reader({}))).toThrow(
      'There are no settings; cannot create them:\n' +
        '- COMPANY_NAME: is required\n' +
        '- COMPANY_RUC: is required',
    );
  });

  it('requires an 11-digit RUC', () => {
    expect(() => companyFrom(reader({ COMPANY_NAME: 'X', COMPANY_RUC: '2000000000A' }))).toThrow(
      'COMPANY_RUC: must have 11 digits',
    );
  });
});

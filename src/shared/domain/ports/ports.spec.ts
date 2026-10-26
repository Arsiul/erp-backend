import { AUDIT_LOGGER } from './audit-logger.port';
import { BANK_LEDGER } from './bank-ledger.port';
import { CLOCK } from './clock.port';
import { ERROR_TRANSLATOR } from './error-translator.port';
import { ID_GENERATOR } from './id-generator.port';
import { PASSWORD_HASHER } from './password-hasher.port';
import { PAYABLE_LEDGER } from './payable-ledger.port';
import { RECEIVABLE_LEDGER } from './receivable-ledger.port';
import { SEQUENCE_GENERATOR } from './sequence-generator.port';
import { SESSION_REVOKER } from './session-revoker.port';
import { STOCK_LEDGER } from './stock-ledger.port';
import { UNIT_OF_WORK } from './unit-of-work.port';
import { UNSEEN_RECORDS } from './unseen-records.port';

describe('port injection tokens', () => {
  const tokens = {
    AUDIT_LOGGER,
    BANK_LEDGER,
    CLOCK,
    ERROR_TRANSLATOR,
    ID_GENERATOR,
    PASSWORD_HASHER,
    PAYABLE_LEDGER,
    RECEIVABLE_LEDGER,
    SEQUENCE_GENERATOR,
    SESSION_REVOKER,
    STOCK_LEDGER,
    UNIT_OF_WORK,
    UNSEEN_RECORDS,
  };

  it('are unique symbols', () => {
    const values = Object.values(tokens);
    values.forEach((token) => {
      expect(typeof token).toBe('symbol');
    });
    expect(new Set(values).size).toBe(values.length);
  });
});

import { LOCK_DURATION_MS, MAX_FAILED_ATTEMPTS } from './login-policy';
import { UnknownEmailLockout } from './unknown-email-lockout';

const NOW = new Date('2026-10-25T15:00:00.000Z');
const later = (ms: number): Date => new Date(NOW.getTime() + ms);

describe('UnknownEmailLockout', () => {
  it('locks an email on the fifth consecutive failure, like an account', () => {
    const lockout = new UnknownEmailLockout();
    for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      expect(lockout.registerFailure('nadie@erp.pe', NOW)).toBe(false);
    }
    expect(lockout.isLocked('nadie@erp.pe', NOW)).toBe(false);
    expect(lockout.registerFailure('nadie@erp.pe', NOW)).toBe(true);
    expect(lockout.isLocked('nadie@erp.pe', later(LOCK_DURATION_MS - 1))).toBe(true);
    expect(lockout.isLocked('otro@erp.pe', NOW)).toBe(false);
  });

  it('unlocks after the lock duration and counts again from zero', () => {
    const lockout = new UnknownEmailLockout();
    for (let attempt = 1; attempt <= MAX_FAILED_ATTEMPTS; attempt += 1) {
      lockout.registerFailure('nadie@erp.pe', NOW);
    }
    const after = later(LOCK_DURATION_MS);
    expect(lockout.isLocked('nadie@erp.pe', after)).toBe(false);
    expect(lockout.registerFailure('nadie@erp.pe', after)).toBe(false);
  });

  it('forgets the oldest email when the capacity is reached', () => {
    const lockout = new UnknownEmailLockout(2);
    lockout.registerFailure('a@erp.pe', NOW);
    lockout.registerFailure('b@erp.pe', NOW);
    lockout.registerFailure('a@erp.pe', NOW);
    lockout.registerFailure('c@erp.pe', NOW);
    expect(lockout.size).toBe(2);
    for (let attempt = 3; attempt <= MAX_FAILED_ATTEMPTS; attempt += 1) {
      lockout.registerFailure('a@erp.pe', NOW);
    }
    expect(lockout.isLocked('a@erp.pe', NOW)).toBe(true);
  });
});

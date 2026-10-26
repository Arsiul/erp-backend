import { ARGON2_OPTIONS, Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('produces an argon2id hash with the configured cost that verifies', async () => {
    const hashed = await hasher.hash('demo');

    const [, algorithm, , params = ''] = hashed.split('$');
    expect(algorithm).toBe('argon2id');
    expect(params.split(',').sort()).toEqual([
      `m=${String(ARGON2_OPTIONS.memoryCost)}`,
      `p=${String(ARGON2_OPTIONS.parallelism)}`,
      `t=${String(ARGON2_OPTIONS.timeCost)}`,
    ]);
    await expect(hasher.verify(hashed, 'demo')).resolves.toBe(true);
    await expect(hasher.verify(hashed, 'otra')).resolves.toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    await expect(hasher.verify('not-a-hash', 'demo')).resolves.toBe(false);
  });
});

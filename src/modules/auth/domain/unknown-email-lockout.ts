import { lockedUntil, reachesLockout } from './login-policy';

/** Bounds the memory an attacker can fill by trying random emails. */
export const MAX_TRACKED_EMAILS = 10_000;

interface Entry {
  readonly failures: number;
  readonly lockedUntil: Date | null;
}

/**
 * Failed logins of emails that match no user, under the same rule as a real account: the fifth
 * consecutive failure answers ACCOUNT_LOCKED for the lock duration. Without it only existing
 * emails would ever lock, which tells them apart. Kept in memory: it is lost on restart and
 * counted per instance, and the oldest email is forgotten when the capacity is reached.
 */
export class UnknownEmailLockout {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly capacity = MAX_TRACKED_EMAILS) {}

  isLocked(email: string, now: Date): boolean {
    const until = this.entries.get(email)?.lockedUntil;
    return until !== undefined && until !== null && until.getTime() > now.getTime();
  }

  /** Counts one more failure; `true` when it locks the email, as `registerFailure` + `lock`. */
  registerFailure(email: string, now: Date): boolean {
    const failures = (this.entries.get(email)?.failures ?? 0) + 1;
    const locks = reachesLockout(failures);
    this.entries.delete(email);
    if (this.entries.size >= this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(
      email,
      locks ? { failures: 0, lockedUntil: lockedUntil(now) } : { failures, lockedUntil: null },
    );
    return locks;
  }

  get size(): number {
    return this.entries.size;
  }
}

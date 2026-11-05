// BeautIzzy — the password recovery resend cooldown: expiry instant, scope, persistence

import {
  PASSWORD_RESET_COOLDOWN_KEY,
  PASSWORD_RESET_COOLDOWN_MS,
  cooldownRemainingSeconds,
  createPasswordResetCooldown,
  type CooldownStorage,
} from '../password-reset-cooldown';

const STAGING = 'https://staging-ref.supabase.co';
const PRODUCTION = 'https://production-ref.supabase.co';
const T0 = Date.UTC(2026, 10, 4, 10, 0, 0);

function memoryStorage(initial: Record<string, string> = {}): CooldownStorage & { readonly items: Map<string, string> } {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

describe('createPasswordResetCooldown', () => {
  it('runs a full minute from the start instant, for that address only', () => {
    const cooldown = createPasswordResetCooldown({ scope: STAGING, storage: memoryStorage() });
    expect(cooldown.endsAt('lea@example.com', T0)).toBeUndefined();

    cooldown.start('lea@example.com', T0);
    expect(cooldown.endsAt('lea@example.com', T0)).toBe(T0 + PASSWORD_RESET_COOLDOWN_MS);
    expect(cooldown.endsAt('lea@example.com', T0 + 59_999)).toBe(T0 + 60_000);
    expect(cooldown.endsAt('other@example.com', T0 + 1_000)).toBeUndefined();
    expect(cooldown.endsAt('lea@example.com', T0 + 60_000)).toBeUndefined();
  });

  it('stores an expiry instant — never a counter, a password, a token or a link — and survives a restart', () => {
    const storage = memoryStorage();
    createPasswordResetCooldown({ scope: STAGING, storage }).start('lea@example.com', T0);

    expect(JSON.parse(storage.items.get(PASSWORD_RESET_COOLDOWN_KEY) ?? 'null')).toEqual({
      scope: STAGING,
      email: 'lea@example.com',
      endsAt: T0 + 60_000,
    });
    const afterRestart = createPasswordResetCooldown({ scope: STAGING, storage });
    expect(afterRestart.endsAt('lea@example.com', T0 + 20_000)).toBe(T0 + 60_000);
  });

  it('never mixes Staging and Production', () => {
    const storage = memoryStorage();
    createPasswordResetCooldown({ scope: STAGING, storage }).start('lea@example.com', T0);
    expect(createPasswordResetCooldown({ scope: PRODUCTION, storage }).endsAt('lea@example.com', T0 + 1_000)).toBeUndefined();
  });

  it('discards an expired, damaged or implausible persisted entry', () => {
    const expired = memoryStorage({
      [PASSWORD_RESET_COOLDOWN_KEY]: JSON.stringify({ scope: STAGING, email: 'lea@example.com', endsAt: T0 - 1 }),
    });
    expect(createPasswordResetCooldown({ scope: STAGING, storage: expired }).endsAt('lea@example.com', T0)).toBeUndefined();
    expect(expired.items.has(PASSWORD_RESET_COOLDOWN_KEY)).toBe(false);

    const damaged = memoryStorage({ [PASSWORD_RESET_COOLDOWN_KEY]: '{not json' });
    expect(createPasswordResetCooldown({ scope: STAGING, storage: damaged }).endsAt('lea@example.com', T0)).toBeUndefined();

    // The device clock moved back: an expiry beyond any minute ever started is not a wait.
    const future = memoryStorage({
      [PASSWORD_RESET_COOLDOWN_KEY]: JSON.stringify({ scope: STAGING, email: 'lea@example.com', endsAt: T0 + 3_600_000 }),
    });
    expect(createPasswordResetCooldown({ scope: STAGING, storage: future }).endsAt('lea@example.com', T0)).toBeUndefined();
    expect(future.items.has(PASSWORD_RESET_COOLDOWN_KEY)).toBe(false);
  });

  it('degrades to memory when the storage fails', () => {
    const failing: CooldownStorage = {
      getItem: () => {
        throw new Error('disk');
      },
      setItem: () => {
        throw new Error('disk');
      },
      removeItem: () => {
        throw new Error('disk');
      },
    };
    const cooldown = createPasswordResetCooldown({ scope: STAGING, storage: failing });
    expect(cooldown.endsAt('lea@example.com', T0)).toBeUndefined();
    cooldown.start('lea@example.com', T0);
    expect(cooldown.endsAt('lea@example.com', T0 + 30_000)).toBe(T0 + 60_000);
  });
});

describe('cooldownRemainingSeconds', () => {
  it('rounds up to whole seconds and stops at zero', () => {
    const endsAt = T0 + 60_000;
    expect(cooldownRemainingSeconds(endsAt, T0)).toBe(60);
    expect(cooldownRemainingSeconds(endsAt, T0 + 1)).toBe(60);
    expect(cooldownRemainingSeconds(endsAt, T0 + 30_000)).toBe(30);
    expect(cooldownRemainingSeconds(endsAt, T0 + 59_999)).toBe(1);
    expect(cooldownRemainingSeconds(endsAt, T0 + 60_000)).toBe(0);
    expect(cooldownRemainingSeconds(undefined, T0)).toBe(0);
    // A stale clock reading never shows more than the full minute.
    expect(cooldownRemainingSeconds(endsAt, T0 - 10_000)).toBe(60);
  });
});

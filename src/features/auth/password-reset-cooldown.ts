// BeautIzzy — the waiting time between two password recovery emails
//
// A UX measure, never the security boundary: Supabase enforces its own limits
// (one email per user per minute, a project-wide hourly quota) and stays the
// authority. Here the app simply stops offering a request it knows Supabase
// would refuse, and says how long to wait.
//
// The cooldown is an absolute expiry instant, never a decrementing counter:
// the remaining time is always read from the clock, so a suspended JS timer
// (background, another app, a remount) cannot stretch or reset it. One entry
// is kept, for the last address that asked, scoped to the Supabase project
// (Staging and Production never share it). It holds the address and the
// instant only — no password, token, or link. An expired entry is discarded
// when read.

/** Supabase « Minimum interval per user »: no reliable retry delay is exposed, this is the conservative one. */
export const PASSWORD_RESET_COOLDOWN_MS = 60_000;

/** Exported for tests. */
export const PASSWORD_RESET_COOLDOWN_KEY = 'beautizzy.auth.password-reset-cooldown';

/** The device key-value storage (the expo-sqlite `localStorage` that persists the Supabase session). */
export interface CooldownStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PasswordResetCooldown {
  /** The expiry instant (ms) of the cooldown of this normalized address, or undefined when none is running. */
  endsAt(email: string, now: number): number | undefined;
  /** Starts (or restarts) the full cooldown of this normalized address. */
  start(email: string, now: number): void;
}

interface CooldownEntry {
  readonly scope: string;
  readonly email: string;
  readonly endsAt: number;
}

function parseEntry(raw: string | null): CooldownEntry | undefined {
  if (raw === null) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return undefined;
    const { scope, email, endsAt } = value as Record<string, unknown>;
    if (typeof scope !== 'string' || typeof email !== 'string') return undefined;
    if (typeof endsAt !== 'number' || !Number.isFinite(endsAt)) return undefined;
    return { scope, email, endsAt };
  } catch {
    return undefined;
  }
}

/**
 * `scope` names the account service (the Supabase project URL). Without
 * `storage` the cooldown lives in memory only: it survives navigation, not a
 * restart. A failing storage degrades to memory, never to an error.
 */
export function createPasswordResetCooldown({
  scope,
  storage,
}: {
  readonly scope: string;
  readonly storage?: CooldownStorage;
}): PasswordResetCooldown {
  let loaded = storage === undefined;
  let entry: CooldownEntry | undefined;

  const discard = () => {
    entry = undefined;
    try {
      storage?.removeItem(PASSWORD_RESET_COOLDOWN_KEY);
    } catch {
      // Memory already forgot it; the next read retries the storage.
    }
  };

  const current = (): CooldownEntry | undefined => {
    if (!loaded) {
      loaded = true;
      try {
        entry = parseEntry(storage?.getItem(PASSWORD_RESET_COOLDOWN_KEY) ?? null);
      } catch {
        entry = undefined;
      }
    }
    return entry;
  };

  return {
    endsAt(email, now) {
      const found = current();
      if (found === undefined) return undefined;
      // Expired, from another project, or beyond any cooldown ever started
      // (the device clock moved back): nothing to wait for.
      if (found.scope !== scope || found.endsAt <= now || found.endsAt - now > PASSWORD_RESET_COOLDOWN_MS) {
        discard();
        return undefined;
      }
      return found.email === email ? found.endsAt : undefined;
    },
    start(email, now) {
      loaded = true;
      entry = { scope, email, endsAt: now + PASSWORD_RESET_COOLDOWN_MS };
      try {
        storage?.setItem(PASSWORD_RESET_COOLDOWN_KEY, JSON.stringify(entry));
      } catch {
        // Kept in memory: still honored until the app restarts.
      }
    },
  };
}

/** Whole seconds left, rounded up (« 1 s » until the very end), never above the full cooldown. */
export function cooldownRemainingSeconds(endsAt: number | undefined, now: number): number {
  if (endsAt === undefined || endsAt <= now) return 0;
  return Math.min(Math.ceil((endsAt - now) / 1000), PASSWORD_RESET_COOLDOWN_MS / 1000);
}

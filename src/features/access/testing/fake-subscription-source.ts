// BeautIzzy — deterministic SubscriptionSource for tests (never imported by app code)

import type { SubscriptionVerification } from '@/domain/access';

import type { SubscriptionSource } from '../subscription-source';

export interface FakeSubscriptionSource extends SubscriptionSource {
  /** Scripts what the next `verify` calls resolve with. */
  respondWith(verification: SubscriptionVerification): void;
  /** Pushes a verification to the listeners subscribed for `userId`, as a store would. */
  emit(userId: string, verification: SubscriptionVerification): void;
  readonly listenerCount: () => number;
  readonly calls: { verify: string[] };
}

interface FakeSubscriptionSourceOptions {
  /** Overrides the scripted answer; `respondWith` is then ignored. */
  readonly verify?: (userId: string) => Promise<SubscriptionVerification>;
}

export const UNAVAILABLE_VERIFICATION: SubscriptionVerification = { kind: 'unavailable' };

export function createFakeSubscriptionSource(
  options: FakeSubscriptionSourceOptions = {},
): FakeSubscriptionSource {
  const listeners = new Map<string, Set<(verification: SubscriptionVerification) => void>>();
  const calls: FakeSubscriptionSource['calls'] = { verify: [] };
  let scripted: SubscriptionVerification = UNAVAILABLE_VERIFICATION;

  return {
    calls,
    listenerCount: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
    respondWith: (verification) => {
      scripted = verification;
    },
    emit: (userId, verification) => {
      for (const listener of listeners.get(userId) ?? []) listener(verification);
    },
    verify: (userId) => {
      calls.verify.push(userId);
      return options.verify ? options.verify(userId) : Promise.resolve(scripted);
    },
    onVerificationChange: (userId, listener) => {
      const set = listeners.get(userId) ?? new Set();
      set.add(listener);
      listeners.set(userId, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(userId);
      };
    },
  };
}

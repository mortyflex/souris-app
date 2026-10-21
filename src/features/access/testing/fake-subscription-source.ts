// BeautIzzy — deterministic SubscriptionSource for tests (never imported by app code)

import type { SubscriptionVerification } from '@/domain/access';

import type { StorePaywallOffering } from '../paywall/paywall-offering';
import type { SubscriptionSource } from '../subscription-source';

export interface FakeSubscriptionSource extends SubscriptionSource {
  /** Scripts what the next `verify` calls resolve with. */
  respondWith(verification: SubscriptionVerification): void;
  /** Scripts what the next `loadOffering` calls resolve with (a source created with `offerings: true`). */
  respondWithOffering(offering: StorePaywallOffering): void;
  /** Pushes a verification to the listeners subscribed for `userId`, as a store would. */
  emit(userId: string, verification: SubscriptionVerification): void;
  readonly listenerCount: () => number;
  readonly calls: { verify: string[]; loadOffering: string[] };
}

interface FakeSubscriptionSourceOptions {
  /** Overrides the scripted answer; `respondWith` is then ignored. */
  readonly verify?: (userId: string) => Promise<SubscriptionVerification>;
  /**
   * Whether the source has a store offering at all. Omitted: no `loadOffering`
   * (the unconfigured shape). `true`: `loadOffering` answers the scripted
   * offering (store-unavailable until `respondWithOffering`).
   */
  readonly offerings?: boolean;
  /** Overrides the scripted offering; implies `offerings: true`. */
  readonly loadOffering?: (userId: string) => Promise<StorePaywallOffering>;
}

export const UNAVAILABLE_VERIFICATION: SubscriptionVerification = { kind: 'unavailable' };

export const STORE_UNAVAILABLE_OFFERING: StorePaywallOffering = { status: 'unavailable', reason: 'store-unavailable' };

export function createFakeSubscriptionSource(
  options: FakeSubscriptionSourceOptions = {},
): FakeSubscriptionSource {
  const listeners = new Map<string, Set<(verification: SubscriptionVerification) => void>>();
  const calls: FakeSubscriptionSource['calls'] = { verify: [], loadOffering: [] };
  let scripted: SubscriptionVerification = UNAVAILABLE_VERIFICATION;
  let scriptedOffering: StorePaywallOffering = STORE_UNAVAILABLE_OFFERING;

  const loadOffering =
    options.offerings || options.loadOffering
      ? (userId: string) => {
          calls.loadOffering.push(userId);
          return options.loadOffering ? options.loadOffering(userId) : Promise.resolve(scriptedOffering);
        }
      : undefined;

  return {
    calls,
    listenerCount: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
    respondWith: (verification) => {
      scripted = verification;
    },
    respondWithOffering: (offering) => {
      scriptedOffering = offering;
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
    ...(loadOffering === undefined ? {} : { loadOffering }),
  };
}

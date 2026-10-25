// BeautIzzy — deterministic SubscriptionSource for tests (never imported by app code)

import type { SubscriptionVerification } from '@/domain/access';

import type { StorePaywallOffering } from '../paywall/paywall-offering';
import type {
  AppleSandboxMode,
  PurchaseRequest,
  StorePurchaseOutcome,
  StoreRestoreOutcome,
  SubscriptionSource,
  SubscriptionStoreKind,
} from '../subscription-source';

export interface FakeSubscriptionSource extends SubscriptionSource {
  /** Scripts what the next `verify` calls resolve with. */
  respondWith(verification: SubscriptionVerification): void;
  /** Scripts what the next `loadOffering` calls resolve with (a source created with `offerings: true`). */
  respondWithOffering(offering: StorePaywallOffering): void;
  /** Scripts what the next `purchase` calls resolve with (a source created with `transactions: true`). */
  respondWithPurchase(outcome: StorePurchaseOutcome): void;
  /** Scripts what the next `restore` calls resolve with (a source created with `transactions: true`). */
  respondWithRestore(outcome: StoreRestoreOutcome): void;
  /** Pushes a verification to the listeners subscribed for `userId`, as a store would. */
  emit(userId: string, verification: SubscriptionVerification): void;
  readonly listenerCount: () => number;
  readonly calls: {
    verify: string[];
    loadOffering: string[];
    purchase: { readonly userId: string; readonly request: PurchaseRequest }[];
    restore: string[];
  };
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
  /**
   * Whether the source can purchase and restore. Omitted: neither (the
   * read-only shape). `true`: both answer their scripted outcome (a stale
   * offering, and a cancelled restore, until scripted).
   */
  readonly transactions?: boolean;
  /** Overrides the scripted purchase outcome; implies `transactions: true`. */
  readonly purchase?: (userId: string, request: PurchaseRequest) => Promise<StorePurchaseOutcome>;
  /** Overrides the scripted restore outcome; implies `transactions: true`. */
  readonly restore?: (userId: string) => Promise<StoreRestoreOutcome>;
  /** The store the fake claims to be bound to. Omitted: the Test Store when it transacts, none otherwise. */
  readonly store?: SubscriptionStoreKind;
  /** Apple Sandbox mode the fake claims (a debug bundle bound to the App Store). Omitted: none. */
  readonly appleSandbox?: AppleSandboxMode;
}

export const UNAVAILABLE_VERIFICATION: SubscriptionVerification = { kind: 'unavailable' };

export const STORE_UNAVAILABLE_OFFERING: StorePaywallOffering = { status: 'unavailable', reason: 'store-unavailable' };

export function createFakeSubscriptionSource(
  options: FakeSubscriptionSourceOptions = {},
): FakeSubscriptionSource {
  const listeners = new Map<string, Set<(verification: SubscriptionVerification) => void>>();
  const calls: FakeSubscriptionSource['calls'] = { verify: [], loadOffering: [], purchase: [], restore: [] };
  let scripted: SubscriptionVerification = UNAVAILABLE_VERIFICATION;
  let scriptedOffering: StorePaywallOffering = STORE_UNAVAILABLE_OFFERING;
  let scriptedPurchase: StorePurchaseOutcome = { kind: 'failed', reason: 'stale-offering' };
  let scriptedRestore: StoreRestoreOutcome = { kind: 'cancelled' };
  const transacts = options.transactions || options.purchase !== undefined || options.restore !== undefined;
  const store = options.store ?? (transacts ? 'test-store' : undefined);

  const loadOffering =
    options.offerings || options.loadOffering
      ? (userId: string) => {
          calls.loadOffering.push(userId);
          return options.loadOffering ? options.loadOffering(userId) : Promise.resolve(scriptedOffering);
        }
      : undefined;

  const purchase = transacts
    ? (userId: string, request: PurchaseRequest) => {
        calls.purchase.push({ userId, request });
        return options.purchase ? options.purchase(userId, request) : Promise.resolve(scriptedPurchase);
      }
    : undefined;
  const restore = transacts
    ? (userId: string) => {
        calls.restore.push(userId);
        return options.restore ? options.restore(userId) : Promise.resolve(scriptedRestore);
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
    respondWithPurchase: (outcome) => {
      scriptedPurchase = outcome;
    },
    respondWithRestore: (outcome) => {
      scriptedRestore = outcome;
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
    ...(store === undefined ? {} : { store }),
    ...(options.appleSandbox === undefined ? {} : { appleSandbox: options.appleSandbox }),
    ...(loadOffering === undefined ? {} : { loadOffering }),
    ...(purchase === undefined ? {} : { purchase }),
    ...(restore === undefined ? {} : { restore }),
  };
}

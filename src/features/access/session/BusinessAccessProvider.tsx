// BeautIzzy — Business access session boundary (BeautIzzy Plus)
//
// Answers ONE question: what may the signed-in professional do with her
// business data right now — `full` or `read-only`? It follows the Auth state
// (like BusinessSessionProvider), asks the SubscriptionSource for a
// verification, keeps the in-memory entitlement evidence of the session, and
// lets THE domain rule decide (`resolveBusinessAccess`). Nothing here
// compares a date or knows a plan.
//
// Mounted at the account root, below BusinessSessionProvider and above
// RootNavigator, so the root gate and the (app) providers can both read it
// later. In this phase nothing consumes it: enforcement is DISABLED
// (`SUBSCRIPTION_ENFORCEMENT`) and the source is the unconfigured one, so
// `access` is always full and `writeRefusal` always undefined.
//
// Account isolation: the state is keyed by the signed-in user id. Another
// user — or nobody — reads a fresh pending session, never the previous one's
// verification or evidence; a verification that lands after the user changed
// is dropped (session generation); a push from the store reaches only the
// session it was subscribed for. Evidence lives in memory only and dies with
// the session: nothing is persisted in this phase, so after a restart the
// offline policy starts without a proof until the store answers again.
//
// Time awareness. The answer is re-resolved for the current instant, with a
// fresh verification requested, at every deadline the domain announces
// (`nextBusinessAccessDeadline`: the end of the entitlement in force, then
// the end of the 72-hour offline grace) and whenever the app returns to the
// foreground — a deadline missed while suspended is caught up on there. A
// store answer that reached the end of the entitlement it reported is lapsed
// (`isVerificationCurrent`) and the proof speaks instead, so an expired
// subscription can never stay `full` just because the app stayed open, and a
// renewal that cannot be verified gets exactly the grace the domain grants.
// Deadlines are properties of the proof: re-arming the timer, repeating
// `refresh()` or a failed verification never moves them.
//
// Offering (Phase 6.2). `loadOffering` asks the source what the store sells
// the signed-in user — through the same source and the same identity, never a
// second SDK path. It is bound to the user signed in when it is called:
// nobody signed in answers `no-account`, a source without a store answers
// `not-configured`, a rejection `store-unavailable`. It loads nothing of its
// own and keeps no offering state: `usePaywallOffering` owns the loading
// lifecycle and drops the answers of a session that ended.
//
// Transactions (Phase 6.3). `purchase` and `restore` start the two store
// transactions for the user signed in when they are called, through the same
// source. ONE at a time for the whole session: a second call while one is in
// flight is refused (`operation-in-progress`), whichever screen asks — the
// exclusion lives here, never in a screen. A purchase is refused unless the
// source's store is one purchases are enabled for (`purchasable-stores.ts`):
// the RevenueCat Test Store only in this phase, so a release bound to the App
// Store starts no real-money transaction whatever calls it. The outcome of a
// completed transaction carries the verification the store answered: it is
// applied through the SAME pipeline as every verification (`apply`, then THE
// domain rule) — never a separate entitlement, never a UI flag — and it
// supersedes any verification still in flight, which is dropped as stale. An
// outcome that lands after the session changed (sign-out, another account)
// is applied to nobody and reported as `account-changed`: a transaction of
// account A never touches account B's state, and is never reported as B's.
// A restore is user-initiated only: nothing here restores at launch, at
// sign-in or on a foreground return.
//
// Apple Sandbox test (Phase 6.4B). A source carrying `appleSandbox` is a debug
// bundle bound to the App Store. Its purchases stay refused like any App Store
// purchase, unless the caller asks for the Apple Sandbox TEST explicitly
// (`origin` naming the Apple Sandbox test) AND THE authorization rule
// (`purchase-authorization.ts`) holds: iOS, a development bundle, that
// source, the App Store, and a signed-in account declared as a dedicated
// test account. A restore in that mode is reserved to the same accounts. The
// rule is evaluated here, with the live platform and compilation, whatever
// the screen already checked. The outcome then follows the same pipeline as
// every transaction.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, Platform } from 'react-native';

import {
  canMutateBusinessData,
  isVerificationCurrent,
  nextBusinessAccessDeadline,
  resolveBusinessAccess,
  updateEntitlementEvidence,
  type AccessEnforcement,
  type BusinessAccess,
  type BusinessAccessInput,
  type EntitlementEvidence,
  type ReadOnlyReason,
  type SubscriptionVerification,
} from '@/domain/access';
import { useAuth } from '@/features/auth/session/AuthProvider';

import {
  noAccountPaywallOffering,
  storeUnavailablePaywallOffering,
  unconfiguredPaywallOffering,
  type PaywallOffering,
} from '../paywall/paywall-offering';
import { resolvePurchaseRefusal, resolveRestoreRefusal, type PurchaseOrigin } from '../purchase-authorization';
import type {
  AppleSandboxMode,
  PurchaseRequest,
  StorePurchaseOutcome,
  StoreRestoreOutcome,
  StoreTransactionFailure,
  SubscriptionSource,
  SubscriptionStoreKind,
} from '../subscription-source';

/** The store transaction in flight for the session, if any. */
export type StoreOperation = 'purchase' | 'restore';

/** The session changed while the transaction ran: its outcome was applied to nobody. */
export type SessionPurchaseOutcome = StorePurchaseOutcome | { readonly kind: 'account-changed' };
export type SessionRestoreOutcome = StoreRestoreOutcome | { readonly kind: 'account-changed' };

export interface BusinessAccessValue {
  /** The effective permission, resolved by the domain for the last resolution instant. */
  readonly access: BusinessAccess;
  /** `access.mode === 'full'`: business mutations are permitted. */
  readonly canMutate: boolean;
  /** Undefined while mutations are permitted, the reason otherwise. The future write guards read this. */
  readonly writeRefusal: ReadOnlyReason | undefined;
  /**
   * The latest answer of THIS session; undefined while the first one is in
   * flight, or signed out. Once the entitlement it reports has ended, `access`
   * rests on the proof instead (offline policy) until the next answer.
   */
  readonly verification: SubscriptionVerification | undefined;
  readonly enforcement: AccessEnforcement;
  /**
   * Verifies again through the source. Resolves with the answer once it is
   * applied, or `undefined` when it was dropped as stale (the session
   * changed, a later verification superseded it).
   */
  readonly refresh: () => Promise<SubscriptionVerification | undefined>;
  /**
   * The offering the store makes to the signed-in user, read for that
   * identity only. Never `loading`; never rejects. Purchases nothing.
   */
  readonly loadOffering: () => Promise<PaywallOffering>;
  /** The store the source is bound to; undefined without one. */
  readonly store: SubscriptionStoreKind | undefined;
  /** Apple Sandbox mode of the source (a debug bundle bound to the App Store); undefined in every other build. */
  readonly appleSandbox: AppleSandboxMode | undefined;
  /** The transaction in flight for the session, if any: screens disable their actions on it. */
  readonly storeOperation: StoreOperation | undefined;
  /**
   * Buys, for the signed-in user, a plan of an offering the source loaded.
   * One transaction at a time; never rejects; applies a completed outcome's
   * verification through the session pipeline. `origin` defaults to a product
   * purchase; only the developer-only Apple Sandbox test names itself.
   */
  readonly purchase: (request: PurchaseRequest, origin?: PurchaseOrigin) => Promise<SessionPurchaseOutcome>;
  /** Asks the store for the signed-in user's previous purchases. User-initiated only; never rejects. */
  readonly restore: () => Promise<SessionRestoreOutcome>;
}

const BusinessAccessContext = createContext<BusinessAccessValue | null>(null);

const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };

/** The longest delay a JavaScript timer honours; a farther deadline is reached in steps. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

const defaultClock = () => new Date();

interface AccessSession {
  readonly userId: string | undefined;
  readonly verification: SubscriptionVerification | undefined;
  readonly evidence: EntitlementEvidence | undefined;
  /** The instant of the last resolution: a verification landing, a deadline, a foreground return. */
  readonly resolvedAt: Date;
}

interface BusinessAccessProviderProps {
  readonly enforcement: AccessEnforcement;
  /** Undefined behaves like the unconfigured source: every verification is unavailable. */
  readonly source: SubscriptionSource | undefined;
  /** Injected for deterministic tests; the application uses the system clock. */
  readonly clock?: () => Date;
}

export function BusinessAccessProvider({
  enforcement,
  source,
  clock = defaultClock,
  children,
}: PropsWithChildren<BusinessAccessProviderProps>) {
  const { state: auth } = useAuth();
  const account = auth.status === 'authenticated' ? auth.user : undefined;
  const userId = account?.id;

  const clockRef = useRef(clock);
  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  const [storeOperation, setStoreOperation] = useState<StoreOperation | undefined>(undefined);
  // The exclusion itself: a ref, so two calls in the same tick cannot both pass.
  const operationRef = useRef<StoreOperation | undefined>(undefined);

  const [session, setSession] = useState<AccessSession>(() => ({
    userId: undefined,
    verification: undefined,
    evidence: undefined,
    resolvedAt: clock(),
  }));
  // Bumped whenever the signed-in user changes: an answer, a push or a timer
  // from an older session is dropped. Within a session, only the latest
  // `verify` applies.
  const sessionGeneration = useRef(0);
  const verifySequence = useRef(0);

  // Derived while the stored session belongs to another user (sign-in,
  // account change, sign-out): pending, with no evidence — never theirs.
  const current: AccessSession =
    session.userId === userId
      ? session
      : { userId, verification: undefined, evidence: undefined, resolvedAt: session.resolvedAt };

  const apply = useCallback((forUserId: string, verification: SubscriptionVerification) => {
    const now = clockRef.current();
    setSession((previous) => {
      const evidence = previous.userId === forUserId ? previous.evidence : undefined;
      return {
        userId: forUserId,
        verification,
        evidence: updateEntitlementEvidence(evidence, verification, now),
        resolvedAt: now,
      };
    });
  }, []);

  /** Re-resolves the session for the current instant; the answer and the proof stay exactly as they are. */
  const reevaluate = useCallback((forUserId: string) => {
    const now = clockRef.current();
    setSession((previous) => (previous.userId === forUserId ? { ...previous, resolvedAt: now } : previous));
  }, []);

  const verify = useCallback(
    async (forUserId: string, generation: number): Promise<SubscriptionVerification | undefined> => {
      verifySequence.current += 1;
      const sequence = verifySequence.current;
      let verification: SubscriptionVerification;
      try {
        verification = source ? await source.verify(forUserId) : UNAVAILABLE;
      } catch {
        verification = UNAVAILABLE;
      }
      if (generation !== sessionGeneration.current) return undefined;
      if (sequence !== verifySequence.current) return undefined;
      apply(forUserId, verification);
      return verification;
    },
    [source, apply],
  );

  useEffect(() => {
    if (!userId) return;
    sessionGeneration.current += 1;
    const generation = sessionGeneration.current;
    void verify(userId, generation);
    const unsubscribe = source?.onVerificationChange?.(userId, (verification) => {
      if (generation === sessionGeneration.current) apply(userId, verification);
    });
    // Back in the foreground: the clock may have jumped past a deadline while
    // the app was suspended, and the store may have news. One listener per
    // session; renders never re-subscribe.
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || generation !== sessionGeneration.current) return;
      reevaluate(userId);
      void verify(userId, generation);
    });
    return () => {
      sessionGeneration.current += 1;
      appState.remove();
      unsubscribe?.();
    };
  }, [userId, source, verify, apply, reevaluate]);

  const refresh = useCallback(async () => {
    if (!userId) return undefined;
    return verify(userId, sessionGeneration.current);
  }, [userId, verify]);

  const loadOffering = useCallback(async (): Promise<PaywallOffering> => {
    if (!userId) return noAccountPaywallOffering;
    const load = source?.loadOffering;
    if (load === undefined) return unconfiguredPaywallOffering;
    try {
      return await load(userId);
    } catch {
      return storeUnavailablePaywallOffering;
    }
  }, [userId, source]);

  const store = source?.store;
  const appleSandbox = source?.appleSandbox;

  /** Runs ONE transaction for the signed-in user; the outcome is applied only to the session it started in. */
  const transact = useCallback(
    async <Outcome extends StorePurchaseOutcome | StoreRestoreOutcome>(
      operation: StoreOperation,
      start: ((forUserId: string) => Promise<Outcome>) | undefined,
      failed: (reason: StoreTransactionFailure) => Outcome,
      authorize: () => StoreTransactionFailure | undefined,
    ): Promise<Outcome | { readonly kind: 'account-changed' }> => {
      if (!userId) return failed('no-account');
      if (start === undefined) return failed('not-configured');
      const refusal = authorize();
      if (refusal !== undefined) return failed(refusal);
      if (operationRef.current !== undefined) return failed('operation-in-progress');
      operationRef.current = operation;
      setStoreOperation(operation);
      const generation = sessionGeneration.current;
      let outcome: Outcome;
      try {
        outcome = await start(userId);
      } catch {
        outcome = failed('unexpected');
      } finally {
        operationRef.current = undefined;
        setStoreOperation(undefined);
      }
      if (generation !== sessionGeneration.current) return { kind: 'account-changed' };
      if (outcome.kind === 'completed') {
        // The store's answer to the transaction is the newest word: an older
        // verification still in flight must not replace it.
        verifySequence.current += 1;
        apply(userId, outcome.verification);
      }
      return outcome;
    },
    [userId, apply],
  );

  const purchase = useCallback(
    (request: PurchaseRequest, origin: PurchaseOrigin = 'product'): Promise<SessionPurchaseOutcome> => {
      const start = source?.purchase;
      return transact<StorePurchaseOutcome>(
        'purchase',
        start === undefined ? undefined : (forUserId) => start(forUserId, request),
        (reason) => ({ kind: 'failed', reason }),
        // THE authorization rule, with the live platform and compilation: the Test Store, or the
        // explicitly requested Apple Sandbox test of a dedicated test account — nothing else.
        () => resolvePurchaseRefusal({ store, appleSandbox, origin, platform: Platform.OS, debug: __DEV__, account }),
      );
    },
    [source, transact, store, appleSandbox, account],
  );

  const restore = useCallback(
    (): Promise<SessionRestoreOutcome> =>
      transact<StoreRestoreOutcome>(
        'restore',
        source?.restore,
        (reason) => ({ kind: 'failed', reason }),
        () => resolveRestoreRefusal({ appleSandbox, account }),
      ),
    [source, transact, appleSandbox, account],
  );

  const input = useMemo<BusinessAccessInput>(
    () => ({
      now: current.resolvedAt,
      enforcement,
      verification:
        current.verification !== undefined && isVerificationCurrent(current.verification, current.resolvedAt)
          ? current.verification
          : UNAVAILABLE,
      lastVerifiedEntitlement: current.evidence,
    }),
    [current.resolvedAt, current.verification, current.evidence, enforcement],
  );

  const access = useMemo(() => resolveBusinessAccess(input), [input]);
  const deadlineMs = useMemo(() => nextBusinessAccessDeadline(input)?.getTime(), [input]);

  // ONE timer, aimed at the next deadline the domain announced. Reaching it
  // re-resolves for the current instant and asks the store again (a renewal
  // must be checked; `unavailable` keeps the proof and its grace). A deadline
  // farther than a timer can reach is approached in steps; a timer that runs
  // early — or late, after a suspension — is judged by the clock, never by
  // its own delay. An already-passed deadline is handled at once, and every
  // resolution past it yields a later deadline or none, so nothing spins.
  useEffect(() => {
    if (!userId || deadlineMs === undefined) return;
    const generation = sessionGeneration.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reach = () => {
      const remaining = deadlineMs - clockRef.current().getTime();
      if (remaining > 0) {
        timer = setTimeout(reach, Math.min(remaining, MAX_TIMER_DELAY_MS));
        return;
      }
      if (generation !== sessionGeneration.current) return;
      reevaluate(userId);
      void verify(userId, generation);
    };
    reach();
    return () => clearTimeout(timer);
  }, [userId, deadlineMs, reevaluate, verify]);

  const value = useMemo<BusinessAccessValue>(
    () => ({
      access,
      canMutate: canMutateBusinessData(access),
      writeRefusal: access.mode === 'read-only' ? access.reason : undefined,
      verification: current.verification,
      enforcement,
      refresh,
      loadOffering,
      store,
      appleSandbox,
      storeOperation,
      purchase,
      restore,
    }),
    [access, current.verification, enforcement, refresh, loadOffering, store, appleSandbox, storeOperation, purchase, restore],
  );

  return <BusinessAccessContext.Provider value={value}>{children}</BusinessAccessContext.Provider>;
}

export function useBusinessAccess(): BusinessAccessValue {
  const value = useContext(BusinessAccessContext);
  if (!value) {
    throw new Error('useBusinessAccess must be used inside BusinessAccessProvider');
  }
  return value;
}

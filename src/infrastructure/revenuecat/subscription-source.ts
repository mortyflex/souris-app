// BeautIzzy — the RevenueCat SubscriptionSource (BeautIzzy Plus)
//
// Implements the application's ONE subscription boundary
// (`features/access/subscription-source.ts`) over the process-global
// RevenueCat SDK. It identifies, reads, listens and — since Phase 6.3 —
// transacts; THE domain rule decides access, and `customer-info.ts`
// translates.
//
// Identity — identified-only. The SDK is configured ONCE, at the first
// operation, with the authenticated Supabase user id as its App User ID
// (never an email, a device id, a generated id). A later account is switched
// to with `logIn`, which — from an identified user — switches without
// aliasing. Signing out does nothing in the SDK: `logOut` would create an
// anonymous identity this integration has no use for; the SDK simply keeps
// the last identity until another account signs in, and the application never
// reads it while signed out (the provider holds no user). An answer is
// produced for the user it was requested for ONLY: the SDK identity is
// checked (`getAppUserID`) before every read and every transaction, a failed
// switch leaves the source identified as nobody, and nothing is read or
// bought as nobody.
//
// Coordination. The SDK is one global object and its identity transitions are
// asynchronous: every operation — configure, logIn, read, push-triggered
// re-read, purchase, restore — runs on ONE serial chain, so a verification
// for account B never interleaves with the switch to B, a verification queued
// for A before the switch completes before it, and a switch requested while a
// purchase sheet is up waits for the transaction: the SDK identity cannot
// change under a native transaction, so a purchase is always posted for the
// account it was requested for. The provider drops the answers of a session
// that ended (its generation); this source makes sure such an answer was at
// least produced for the right identity.
//
// Pushes. The SDK's CustomerInfo update event is a trigger, never a payload:
// the pushed object is ignored and the CustomerInfo of the identified user is
// re-read on the chain (the SDK's cache is keyed by App User ID), so a late
// event from a previous identity cannot be delivered to the current one. ONE
// SDK listener, installed with the first subscriber and removed with the
// last; a stale re-read (see customer-info.ts) is not pushed at all. The
// event the SDK fires after a purchase or a restore follows the same path.
//
// Freshness. `verify` reads the SDK's CustomerInfo (cache when the SDK deems
// it fresh); an answer older than the freshness window is dropped from the
// cache and fetched again, so a fresh answer or `unavailable` results — never
// a stale one. Every failure — no native module, offline, rejected call,
// identity mismatch — answers `unavailable`.
//
// Offerings (Phase 6.2). `loadOffering` runs on the SAME chain, after the
// same identification: the offerings are read and — for the products that
// carry a free trial — the introductory-offer eligibility of that user. The
// eligibility check is best-effort: its failure never fails the offering, it
// only leaves every trial `unknown`. The mapping is pure (`offering.ts`).
// Every other failure answers `store-unavailable`.
//
// Transactions (Phase 6.3). Each loaded offering that sells something is kept
// as a SNAPSHOT for the user it was loaded for — the latest one only —
// holding the store package objects behind the plans it presented, under an
// opaque reference returned with the offering (an empty offering has none). `purchase` buys the package of that snapshot
// and that plan: the exact object the SDK returned and the paywall priced,
// never one rebuilt from an identifier, a price or a position. A reference
// that is not the user's latest snapshot — loaded again since, failed since,
// loaded for another account, never loaded — is `stale-offering`: the caller
// loads the offering again; nothing else is ever bought instead. The
// identity is confirmed on the chain before the sheet, the SDK's rejections
// are classified (`purchase-error.ts`: cancelled, pending, or a named
// failure), and a completed transaction answers the verification mapped from
// the CustomerInfo the store returned WITH the purchase — fresh by
// construction, or `unavailable` when it cannot be trusted. `restore` does
// the same with the store's restore answer. Neither grants anything: the
// provider applies the verification through its own pipeline.
//
// Environment (Phase 6.5C, step 1). Every CustomerInfo this source maps —
// a verification, a push re-read, the answer of a purchase or a restore —
// goes through ONE environment policy (`customer-info.ts`), resolved ONCE
// from the source's own binding by `resolveEntitlementEnvironmentPolicy`:
// a source bound to the Test Store, or an App Store source in Apple Sandbox
// mode with dedicated test accounts declared, reads Sandbox entitlements
// (`sandbox-trusted`); EVERY other source — an App Store release, TestFlight
// included, or Apple Sandbox mode with nobody allowed to transact — reads
// production entitlements only (`production-only`), so a Sandbox purchase is
// never a verified production entitlement on a professional's device. The
// policy is a property of the configuration, never of `__DEV__` alone, and
// no caller can hand the mapping another one.

import type { SubscriptionPlan, SubscriptionVerification } from '@/domain/access';
import {
  storeUnavailablePaywallOffering,
  type StorePaywallOffering,
} from '@/features/access/paywall/paywall-offering';
import type {
  AppleSandboxMode,
  PurchaseRequest,
  StorePurchaseOutcome,
  StoreRestoreOutcome,
  StoreTransactionFailure,
  SubscriptionSource,
  SubscriptionStoreKind,
} from '@/features/access/subscription-source';

import {
  isCustomerInfoFresh,
  mapCustomerInfoToVerification,
  type EntitlementEnvironmentPolicy,
} from './customer-info';
import { mapOfferingsToPaywallOffering, productIdentifiersWithFreeTrial, selectPlanPackages } from './offering';
import { classifyPurchasesError } from './purchase-error';
import type {
  CustomerInfo,
  CustomerInfoUpdateListener,
  IntroEligibilityByProduct,
  MakePurchaseResult,
  PurchasesPackage,
  RevenueCatSdk,
} from './sdk';

export interface RevenueCatSubscriptionSourceOptions {
  readonly sdk: RevenueCatSdk;
  readonly apiKey: string;
  /** The store the key belongs to; the provider refuses purchases against a store not enabled yet. */
  readonly store: SubscriptionStoreKind;
  /** Apple Sandbox mode (Phase 6.4), exposed as is: the provider's authorization rule reads it. Absent otherwise. */
  readonly appleSandbox?: AppleSandboxMode;
  /** Injected for deterministic tests; the application uses the system clock. */
  readonly clock?: () => Date;
}

type VerificationListener = (verification: SubscriptionVerification) => void;

/** The store packages behind the plans of ONE loaded offering, for the user it was loaded for. */
interface OfferingSnapshot {
  readonly reference: string;
  readonly packages: Partial<Record<SubscriptionPlan, PurchasesPackage>>;
}

const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };

const defaultClock = () => new Date();

const ignore = () => undefined;

/** What a source's binding says about Sandbox entitlements: the two testing configurations trust them, nothing else does. */
export interface EntitlementEnvironmentBinding {
  readonly store: SubscriptionStoreKind;
  readonly appleSandbox: AppleSandboxMode | undefined;
}

/**
 * THE rule choosing the environment policy of a source, pure. Sandbox
 * entitlements are trusted by a source bound to the RevenueCat Test Store
 * (a debug bundle's store, whose purchases exist in no production
 * environment), and by an App Store source carrying Apple Sandbox mode with
 * at least one dedicated test account declared — the configuration that may
 * transact in Apple's Sandbox at all. An App Store source without the mode
 * (a release, TestFlight), or in the mode with nobody allowed to transact,
 * reads production entitlements only.
 */
export function resolveEntitlementEnvironmentPolicy({
  store,
  appleSandbox,
}: EntitlementEnvironmentBinding): EntitlementEnvironmentPolicy {
  if (store === 'test-store') return 'sandbox-trusted';
  if (appleSandbox !== undefined && appleSandbox.testAccounts.length > 0) return 'sandbox-trusted';
  return 'production-only';
}

export function createRevenueCatSubscriptionSource({
  sdk,
  apiKey,
  store,
  appleSandbox,
  clock = defaultClock,
}: RevenueCatSubscriptionSourceOptions): SubscriptionSource {
  /** Resolved once from the binding; every mapping of this source uses it. */
  const environmentPolicy = resolveEntitlementEnvironmentPolicy({ store, appleSandbox });
  /** The user the SDK is identified as after the last COMPLETED transition; undefined before, during, or after a failed one. */
  let identifiedUserId: string | undefined;
  /** Bumped when a transition starts: a push captured before it never delivers after it. */
  let transitions = 0;
  let configured = false;
  /** `configure` threw: the native module is absent in this build. Nothing is retried. */
  let unusable = false;
  let chain: Promise<unknown> = Promise.resolve();

  const subscribers = new Map<string, Set<VerificationListener>>();
  let sdkListener: CustomerInfoUpdateListener | undefined;

  /** The latest offering loaded for each user, by user id. */
  const snapshots = new Map<string, OfferingSnapshot>();
  let snapshotCount = 0;

  /** Runs `task` after every operation queued before it, whatever their outcome. */
  function run<T>(task: () => Promise<T>): Promise<T> {
    const result = chain.then(task, task);
    chain = result.then(ignore, ignore);
    return result;
  }

  /** Makes the SDK hold `userId`. Resolves with the CustomerInfo a switch produced, if any. */
  async function identify(userId: string): Promise<CustomerInfo | undefined> {
    if (identifiedUserId === userId) return undefined;
    identifiedUserId = undefined;
    transitions += 1;
    if (!configured) {
      try {
        sdk.configure({ apiKey, appUserID: userId });
      } catch (error) {
        unusable = true;
        throw error;
      }
      configured = true;
      identifiedUserId = userId;
      return undefined;
    }
    const result = await sdk.logIn(userId);
    identifiedUserId = userId;
    return result.customerInfo;
  }

  /** The CustomerInfo of `userId`, read only once the SDK confirms it holds that identity. */
  async function readCustomerInfo(userId: string): Promise<CustomerInfo> {
    await assertIdentified(userId);
    return sdk.getCustomerInfo();
  }

  async function verifyOnChain(userId: string): Promise<SubscriptionVerification> {
    if (unusable) return UNAVAILABLE;
    try {
      const switched = await identify(userId);
      let info = switched ?? (await readCustomerInfo(userId));
      if (!isCustomerInfoFresh(info, clock())) {
        await sdk.invalidateCustomerInfoCache();
        info = await readCustomerInfo(userId);
      }
      return mapCustomerInfoToVerification(info, clock(), environmentPolicy);
    } catch {
      return UNAVAILABLE;
    }
  }

  /** Confirms the SDK holds `userId`; a drift leaves the source identified as nobody. */
  async function assertIdentified(userId: string): Promise<void> {
    const appUserId = await sdk.getAppUserID();
    if (appUserId !== userId) {
      identifiedUserId = undefined;
      throw new Error('RevenueCat identity mismatch');
    }
  }

  async function loadOfferingOnChain(userId: string): Promise<StorePaywallOffering> {
    if (unusable) return storeUnavailablePaywallOffering;
    try {
      await identify(userId);
      await assertIdentified(userId);
      const offerings = await sdk.getOfferings();
      const trialProducts = productIdentifiersWithFreeTrial(offerings.current);
      let eligibility: IntroEligibilityByProduct | undefined;
      if (trialProducts.length > 0) {
        try {
          eligibility = await sdk.checkTrialOrIntroductoryPriceEligibility(trialProducts);
        } catch {
          eligibility = undefined;
        }
      }
      const mapped = mapOfferingsToPaywallOffering(offerings, eligibility);
      if (mapped.status !== 'available' || mapped.plans.length === 0) {
        // Nothing is sold: nothing can be referenced, nothing can be bought.
        snapshots.delete(userId);
        return mapped;
      }
      snapshotCount += 1;
      const snapshot: OfferingSnapshot = {
        reference: `offering-${snapshotCount}`,
        packages: selectPlanPackages(offerings, mapped.plans),
      };
      snapshots.set(userId, snapshot);
      return { ...mapped, reference: snapshot.reference };
    } catch {
      // What was shown before is no longer what the store says: nothing of it may be bought.
      snapshots.delete(userId);
      return storeUnavailablePaywallOffering;
    }
  }

  type TransactionRefusal = { readonly kind: 'failed'; readonly reason: StoreTransactionFailure };

  /** Identifies for a transaction; the failure, as an outcome reason. */
  async function identifyForTransaction(userId: string): Promise<TransactionRefusal | undefined> {
    try {
      await identify(userId);
      await assertIdentified(userId);
      return undefined;
    } catch (error) {
      if (unusable) return { kind: 'failed', reason: 'sdk-unavailable' };
      const classified = classifyPurchasesError(error);
      if (classified.kind === 'failed' && classified.reason === 'network') return classified;
      return { kind: 'failed', reason: 'identity-mismatch' };
    }
  }

  /** The verification of a CustomerInfo the store answered with a transaction; `unavailable` when it cannot be trusted. */
  function verificationOf(info: CustomerInfo): SubscriptionVerification {
    try {
      return mapCustomerInfoToVerification(info, clock(), environmentPolicy);
    } catch {
      return UNAVAILABLE;
    }
  }

  async function purchaseOnChain(userId: string, request: PurchaseRequest): Promise<StorePurchaseOutcome> {
    if (unusable) return { kind: 'failed', reason: 'sdk-unavailable' };
    const snapshot = snapshots.get(userId);
    const pkg = snapshot !== undefined && snapshot.reference === request.reference ? snapshot.packages[request.plan] : undefined;
    if (pkg === undefined) return { kind: 'failed', reason: 'stale-offering' };

    const refused = await identifyForTransaction(userId);
    if (refused !== undefined) return refused;

    let result: MakePurchaseResult;
    try {
      result = await sdk.purchasePackage(pkg);
    } catch (error) {
      return classifyPurchasesError(error);
    }
    // The chain kept every identity switch waiting; a drift can only come from
    // outside the source. The transaction happened, but nothing is confirmed
    // for this account: the provider will verify again.
    try {
      await assertIdentified(userId);
    } catch {
      return { kind: 'completed', verification: UNAVAILABLE };
    }
    return { kind: 'completed', verification: verificationOf(result.customerInfo) };
  }

  async function restoreOnChain(userId: string): Promise<StoreRestoreOutcome> {
    if (unusable) return { kind: 'failed', reason: 'sdk-unavailable' };
    const refused = await identifyForTransaction(userId);
    if (refused !== undefined) return refused;

    let info: CustomerInfo;
    try {
      info = await sdk.restorePurchases();
    } catch (error) {
      const classified = classifyPurchasesError(error);
      // A restore is never deferred: an unexpected "pending" is a store problem.
      return classified.kind === 'pending' ? { kind: 'failed', reason: 'store-problem' } : classified;
    }
    try {
      await assertIdentified(userId);
    } catch {
      return { kind: 'completed', verification: UNAVAILABLE };
    }
    return { kind: 'completed', verification: verificationOf(info) };
  }

  /** A push: re-read the identified user on the chain and notify its subscribers with a fresh answer. */
  function handleCustomerInfoUpdate() {
    const userId = identifiedUserId;
    if (userId === undefined) return;
    const generation = transitions;
    const stillCurrent = () => identifiedUserId === userId && generation === transitions;
    void run(async () => {
      if (!stillCurrent() || !subscribers.has(userId)) return;
      let info: CustomerInfo;
      try {
        info = await readCustomerInfo(userId);
      } catch {
        return;
      }
      if (!stillCurrent()) return;
      const now = clock();
      if (!isCustomerInfoFresh(info, now)) return;
      const verification = mapCustomerInfoToVerification(info, now, environmentPolicy);
      for (const listener of subscribers.get(userId) ?? []) listener(verification);
    });
  }

  return {
    store,
    ...(appleSandbox === undefined ? {} : { appleSandbox }),
    // The proofs of this source come from where its policy lets it read (Phase 6.5C, step 2).
    evidenceProvenance: environmentPolicy === 'sandbox-trusted' ? 'trusted-test-source' : 'production',
    verify: (userId) => run(() => verifyOnChain(userId)),
    loadOffering: (userId) => run(() => loadOfferingOnChain(userId)),
    purchase: (userId, request) => run(() => purchaseOnChain(userId, request)),
    restore: (userId) => run(() => restoreOnChain(userId)),
    onVerificationChange: (userId, listener) => {
      const set = subscribers.get(userId) ?? new Set<VerificationListener>();
      set.add(listener);
      subscribers.set(userId, set);
      if (sdkListener === undefined) {
        sdkListener = () => handleCustomerInfoUpdate();
        sdk.addCustomerInfoUpdateListener(sdkListener);
      }
      return () => {
        set.delete(listener);
        if (set.size === 0) subscribers.delete(userId);
        if (subscribers.size === 0 && sdkListener !== undefined) {
          sdk.removeCustomerInfoUpdateListener(sdkListener);
          sdkListener = undefined;
        }
      };
    },
  };
}

// BeautIzzy — the RevenueCat SubscriptionSource (BeautIzzy Plus)
//
// Implements the application's ONE subscription boundary
// (`features/access/subscription-source.ts`) over the process-global
// RevenueCat SDK. It identifies, reads and listens; THE domain rule decides
// access, and `customer-info.ts` translates.
//
// Identity — identified-only. The SDK is configured ONCE, at the first
// verification, with the authenticated Supabase user id as its App User ID
// (never an email, a device id, a generated id). A later account is switched
// to with `logIn`, which — from an identified user — switches without
// aliasing. Signing out does nothing in the SDK: `logOut` would create an
// anonymous identity this integration has no use for; the SDK simply keeps
// the last identity until another account signs in, and the application never
// reads it while signed out (the provider holds no user). An answer is
// produced for the user it was requested for ONLY: the SDK identity is
// checked (`getAppUserID`) before every read, a failed switch leaves the
// source identified as nobody, and nothing is read as nobody.
//
// Coordination. The SDK is one global object and its identity transitions are
// asynchronous: every operation — configure, logIn, read, push-triggered
// re-read — runs on ONE serial chain, so a verification for account B never
// interleaves with the switch to B, and a verification queued for A before
// the switch completes before it. The provider drops the answers of a session
// that ended (its generation); this source makes sure such an answer was at
// least produced for the right identity.
//
// Pushes. The SDK's CustomerInfo update event is a trigger, never a payload:
// the pushed object is ignored and the CustomerInfo of the identified user is
// re-read on the chain (the SDK's cache is keyed by App User ID), so a late
// event from a previous identity cannot be delivered to the current one. ONE
// SDK listener, installed with the first subscriber and removed with the
// last; a stale re-read (see customer-info.ts) is not pushed at all.
//
// Freshness. `verify` reads the SDK's CustomerInfo (cache when the SDK deems
// it fresh); an answer older than the freshness window is dropped from the
// cache and fetched again, so a fresh answer or `unavailable` results — never
// a stale one. Every failure — no native module, offline, rejected call,
// identity mismatch — answers `unavailable`.
//
// Offerings (Phase 6.2). `loadOffering` runs on the SAME chain, after the
// same identification: the SDK is made to hold the requested user (configure
// or logIn, never a second configure), the identity is checked, then the
// offerings are read and — for the products that carry a free trial — the
// introductory-offer eligibility of that user. The eligibility check is
// best-effort: its failure never fails the offering, it only leaves every
// trial `unknown` (nothing advertised). The mapping is pure
// (`offering.ts`). Every other failure answers `store-unavailable`. Nothing
// here purchases, restores or syncs.

import type { SubscriptionVerification } from '@/domain/access';
import {
  storeUnavailablePaywallOffering,
  type StorePaywallOffering,
} from '@/features/access/paywall/paywall-offering';
import type { SubscriptionSource } from '@/features/access/subscription-source';

import { isCustomerInfoFresh, mapCustomerInfoToVerification } from './customer-info';
import { mapOfferingsToPaywallOffering, productIdentifiersWithFreeTrial } from './offering';
import type { CustomerInfo, CustomerInfoUpdateListener, IntroEligibilityByProduct, RevenueCatSdk } from './sdk';

export interface RevenueCatSubscriptionSourceOptions {
  readonly sdk: RevenueCatSdk;
  readonly apiKey: string;
  /** Injected for deterministic tests; the application uses the system clock. */
  readonly clock?: () => Date;
}

type VerificationListener = (verification: SubscriptionVerification) => void;

const UNAVAILABLE: SubscriptionVerification = { kind: 'unavailable' };

const defaultClock = () => new Date();

const ignore = () => undefined;

export function createRevenueCatSubscriptionSource({
  sdk,
  apiKey,
  clock = defaultClock,
}: RevenueCatSubscriptionSourceOptions): SubscriptionSource {
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
      return mapCustomerInfoToVerification(info, clock());
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
      return mapOfferingsToPaywallOffering(offerings, eligibility);
    } catch {
      return storeUnavailablePaywallOffering;
    }
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
      const verification = mapCustomerInfoToVerification(info, now);
      for (const listener of subscribers.get(userId) ?? []) listener(verification);
    });
  }

  return {
    verify: (userId) => run(() => verifyOnChain(userId)),
    loadOffering: (userId) => run(() => loadOfferingOnChain(userId)),
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

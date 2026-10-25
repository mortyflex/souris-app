// BeautIzzy — the checkout of the signed-in user (BeautIzzy Plus)
//
// ONE hook through which a screen starts a purchase or a restore and learns
// what came of it, over the provider's `purchase` / `restore` (the same
// source and identity as the verification; never a second SDK path) and the
// verification the provider then holds. It owns no subscription state: the
// provider applies the store's answer through its pipeline, and THE rule of
// every Plus cue (`hasVerifiedPlusEntitlement`) reads it back — here, on
// Accueil, in « Mon abonnement » alike. Nothing here decides access.
//
// What a screen gets:
//
//   activity      the transaction in flight for the SESSION (`purchasing`,
//                 `restoring`), or this screen's own re-verification
//                 (`verifying`): disable the actions on it;
//   entitled      whether the session's verification confirms Plus NOW — a
//                 screen with an entitled account sells nothing;
//   purchase      buys `plan` of the offering the screen holds: the offering
//                 must be the store's (it carries the adapter's `reference`;
//                 a fixture carries none and cannot be bought from — ever);
//                 an `origin` names the developer-only Apple Sandbox test
//                 when that is what the screen runs (Phase 6.4B); a product
//                 purchase passes none;
//   appleSandbox  whether the source is a debug bundle bound to the App Store
//                 (Apple Sandbox mode), and `dedicatedTestAccount` whether the
//                 signed-in account is one declared for its tests — read from
//                 THE authorization rule, so a screen refuses before it asks;
//   restore       user-initiated only;
//   retryVerification
//                 asks the provider to verify again, without any transaction:
//                 the way out of an inconclusive answer.
//
// Each resolves with a RESULT the screen can word (`checkout-presentation`):
//
//   activated / restored          a verified entitlement in force, for THIS account
//   received / restore-received   the store completed, but confirmed nothing yet
//                                 (an `unavailable` answer, a record without the
//                                 entitlement): never shown as active, retry the
//                                 verification — never a second purchase
//   nothing-to-restore            the store confirmed: no entitlement to restore
//   cancelled, deferred           the professional stopped, or the store deferred
//   account-changed               the session changed meanwhile: applied to nobody
//   failed                        a named reason
//
// `activated` is decided from the outcome's own verification at the instant
// it lands, with the same rule as the badge: a transaction never "shows
// Plus" by itself. A result landing after the screen unmounted resolves
// `undefined`: nothing to draw, while the provider has still applied it.

import { useCallback, useEffect, useRef, useState } from 'react';

import { isVerificationCurrent, type SubscriptionPlan, type SubscriptionVerification } from '@/domain/access';
import { useAuth } from '@/features/auth/session/AuthProvider';
import type { AuthUser } from '@/features/auth/gateway';

import type { PaywallOffering } from '../paywall/paywall-offering';
import { isDedicatedTestAccount, type PurchaseOrigin } from '../purchase-authorization';
import { hasVerifiedPlusEntitlement } from '../status/subscription-status-presentation';
import type { StoreTransactionFailure, SubscriptionStoreKind } from '../subscription-source';
import { useBusinessAccess, type StoreOperation } from './BusinessAccessProvider';

/** What is in progress, in the paywall's own vocabulary (`PaywallActivity`). */
export type PlusCheckoutActivity = 'purchasing' | 'restoring' | 'verifying';

const OPERATION_ACTIVITY: Readonly<Record<StoreOperation, PlusCheckoutActivity>> = {
  purchase: 'purchasing',
  restore: 'restoring',
};

export type PlusCheckoutResult =
  | { readonly kind: 'activated' }
  | { readonly kind: 'received' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'deferred' }
  | { readonly kind: 'restored' }
  | { readonly kind: 'restore-received' }
  | { readonly kind: 'nothing-to-restore' }
  | { readonly kind: 'account-changed' }
  | { readonly kind: 'failed'; readonly operation: StoreOperation; readonly reason: StoreTransactionFailure };

export interface PlusCheckoutSession {
  readonly activity: PlusCheckoutActivity | undefined;
  readonly entitled: boolean;
  readonly authenticated: boolean;
  /** The signed-in account; undefined while nobody is. */
  readonly account: AuthUser | undefined;
  readonly store: SubscriptionStoreKind | undefined;
  /** The source is a debug bundle bound to the App Store (Apple Sandbox mode). */
  readonly appleSandbox: boolean;
  /** Apple Sandbox mode AND the signed-in account is one of its dedicated test accounts. */
  readonly dedicatedTestAccount: boolean;
  readonly purchase: (offering: PaywallOffering, plan: SubscriptionPlan, origin?: PurchaseOrigin) => Promise<PlusCheckoutResult | undefined>;
  readonly restore: () => Promise<PlusCheckoutResult | undefined>;
  readonly retryVerification: () => Promise<PlusCheckoutResult | undefined>;
}

interface UsePlusCheckoutOptions {
  /** Injected for deterministic tests; the application uses the system clock. */
  readonly clock?: () => Date;
}

const defaultClock = () => new Date();

/**
 * Whether a verification confirms Plus; a confirmed absence; or nothing
 * conclusive (unavailable, or an entitlement already lapsed, whose renewal is
 * unverified — the same reading as « Mon abonnement »).
 */
function conclude(verification: SubscriptionVerification, now: Date): 'entitled' | 'none' | 'inconclusive' {
  if (hasVerifiedPlusEntitlement(verification, now)) return 'entitled';
  if (verification.kind !== 'verified' || !isVerificationCurrent(verification, now)) return 'inconclusive';
  return 'none';
}

export function usePlusCheckout({ clock = defaultClock }: UsePlusCheckoutOptions = {}): PlusCheckoutSession {
  const { state: auth } = useAuth();
  const authenticated = auth.status === 'authenticated';
  const account = authenticated ? auth.user : undefined;
  const access = useBusinessAccess();
  const { verification, storeOperation, store, appleSandbox } = access;
  const [verifying, setVerifying] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The provider's value at the time a result lands, read without re-creating the callbacks.
  const accessRef = useRef(access);
  useEffect(() => {
    accessRef.current = access;
  }, [access]);
  const clockRef = useRef(clock);
  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  const purchase = useCallback(
    async (offering: PaywallOffering, plan: SubscriptionPlan, origin?: PurchaseOrigin): Promise<PlusCheckoutResult | undefined> => {
      let result: PlusCheckoutResult;
      if (offering.status !== 'available' || offering.reference === undefined) {
        result = { kind: 'failed', operation: 'purchase', reason: 'stale-offering' };
      } else {
        const outcome = await accessRef.current.purchase({ reference: offering.reference, plan }, origin);
        switch (outcome.kind) {
          case 'completed':
            result = conclude(outcome.verification, clockRef.current()) === 'entitled' ? { kind: 'activated' } : { kind: 'received' };
            break;
          case 'cancelled':
            result = { kind: 'cancelled' };
            break;
          case 'pending':
            result = { kind: 'deferred' };
            break;
          case 'account-changed':
            result = { kind: 'account-changed' };
            break;
          case 'failed':
            result = { kind: 'failed', operation: 'purchase', reason: outcome.reason };
            break;
        }
      }
      return mounted.current ? result : undefined;
    },
    [],
  );

  const restore = useCallback(async (): Promise<PlusCheckoutResult | undefined> => {
    const outcome = await accessRef.current.restore();
    let result: PlusCheckoutResult;
    switch (outcome.kind) {
      case 'completed': {
        const conclusion = conclude(outcome.verification, clockRef.current());
        result =
          conclusion === 'entitled'
            ? { kind: 'restored' }
            : conclusion === 'none'
              ? { kind: 'nothing-to-restore' }
              : { kind: 'restore-received' };
        break;
      }
      case 'cancelled':
        result = { kind: 'cancelled' };
        break;
      case 'account-changed':
        result = { kind: 'account-changed' };
        break;
      case 'failed':
        result = { kind: 'failed', operation: 'restore', reason: outcome.reason };
        break;
    }
    return mounted.current ? result : undefined;
  }, []);

  const retryVerification = useCallback(async (): Promise<PlusCheckoutResult | undefined> => {
    setVerifying(true);
    let latest: SubscriptionVerification | undefined;
    try {
      latest = await accessRef.current.refresh();
    } finally {
      if (mounted.current) setVerifying(false);
    }
    if (!mounted.current) return undefined;
    if (latest === undefined) return { kind: 'received' };
    return conclude(latest, clockRef.current()) === 'entitled' ? { kind: 'activated' } : { kind: 'received' };
  }, []);

  return {
    activity: storeOperation !== undefined ? OPERATION_ACTIVITY[storeOperation] : verifying ? 'verifying' : undefined,
    entitled: hasVerifiedPlusEntitlement(verification, clock()),
    authenticated,
    account,
    store,
    appleSandbox: appleSandbox !== undefined,
    dedicatedTestAccount: isDedicatedTestAccount(account, appleSandbox),
    purchase,
    restore,
    retryVerification,
  };
}

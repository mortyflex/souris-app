// BeautIzzy — Plus reconciliation: ONE account against RevenueCat — pure of
// transport, bound to the 6.5A mirror
//
// The reconciliation of one Supabase account (its id IS its RevenueCat App
// User ID — subscription-source.ts identifies every signed-in user by it):
//
//   1. the mirror is read for the account, in both environments, through
//      `subscription_read_mirror` — the SAME matching the webhook uses;
//   2. the subscriber state is fetched from the REST API (revenuecat-api.ts);
//   3. the answer is mapped by the webhook's own `mapSubscriberResponse` —
//      one source per product, `is_sandbox` deciding the environment — and
//      every described product is applied through
//      `subscription_apply_reconciliation`, which replaces that product's row
//      unless the row was confirmed LATER (a newer webhook event, a newer
//      reconciliation: STALE). Nothing else is written.
//
// The conservative policy of 6.5A holds in full: a row the answer does not
// describe is never touched — an absence is never an expiration. Only what
// RevenueCat confirms (an expiration behind its request date, a refund, a
// revoked grant listed as expired) ends a row. And three answers that are
// NOT evidence are kept apart from a verified state:
//
//   NO_SUBSCRIBER   RevenueCat had never seen this account (the v1 read
//                   created an empty customer — reported, never applied);
//   NO_SOURCES      the customer exists and grants nothing;
//   INVESTIGATE     the answer disagrees with a mirrored source IN FORCE —
//                   it does not list it, or lists no customer / no source
//                   beside it, or the subscriber's original App User ID is
//                   another Supabase account (an alias or a transfer that
//                   merged two accounts). What the answer DOES describe is
//                   applied; the rest is left as it is; an operator decides.
//
// A failure (RevenueCat unreachable or rate limited, a malformed answer, a
// database error) is FAILED: nothing written, retried later. A failed read is
// never a lost entitlement.
//
// DRY_RUN computes exactly what APPLY would write — the same reads, the same
// request, the same mapping, the same "confirmed later" rule — and writes
// nothing; its report says `would-apply` / `would-confirm` / `would-be-stale`.

import {
  isEntitledAt,
  SUBSCRIPTION_ENVIRONMENTS,
  type EntitlementSnapshot,
  type EntitlementStatus,
  type SubscriptionEnvironment,
} from '../../revenuecat-webhook/core/entitlement-snapshot.ts';
import { findSnapshot, type MirrorRead, type SubscriptionMirror } from '../../revenuecat-webhook/core/mirror.ts';
import { mapSubscriberResponse, mergeReconciledSnapshot } from '../../revenuecat-webhook/core/reconciliation.ts';
import { RevenueCatApiError, type RevenueCatFailureKind, type SubscriberStateApi } from './revenuecat-api.ts';

export type ReconciliationMode = 'DRY_RUN' | 'APPLY';

export type AccountOutcome = 'APPLIED' | 'CONFIRMED' | 'STALE' | 'NO_SUBSCRIBER' | 'NO_SOURCES' | 'INVESTIGATE' | 'FAILED';

export const ACCOUNT_OUTCOMES: readonly AccountOutcome[] = ['APPLIED', 'CONFIRMED', 'STALE', 'NO_SUBSCRIBER', 'NO_SOURCES', 'INVESTIGATE', 'FAILED'];

/** One account as `subscription_reconciliation_claim` hands it over. */
export interface AccountToReconcile {
  readonly userId: string;
  readonly businessId: string | null;
  /** The user id and every App User ID the mirror already knows for it. */
  readonly appUserIds: readonly string[];
  readonly mirrorRows: number;
  /** THE rule's answer before the pass (`subscription_has_plus_access`). */
  readonly plusAccess: boolean;
}

export interface ProductState {
  readonly status: EntitlementStatus;
  readonly entitledUntilMs: number | null;
}

export type ProductChangeResult = 'applied' | 'confirmed' | 'stale' | 'would-apply' | 'would-confirm' | 'would-be-stale';

/** What the answer said about ONE product, and what happened to its row. */
export interface ProductChange {
  readonly environment: SubscriptionEnvironment;
  readonly productId: string;
  readonly before: ProductState | null;
  readonly after: ProductState;
  readonly result: ProductChangeResult;
}

export type AccountFailure = RevenueCatFailureKind | 'mirror';

export interface AccountReport {
  readonly userId: string;
  readonly outcome: AccountOutcome;
  /** A short sanitized vocabulary; never a payload, never a key. */
  readonly detail: string | null;
  /** RevenueCat requests sent for this account (retries included). */
  readonly requests: number;
  readonly accessBefore: boolean;
  /** THE rule's answer after the writes; null in DRY_RUN and when nothing was written. */
  readonly accessAfter: boolean | null;
  readonly changes: readonly ProductChange[];
  /** Mirrored sources in force the answer does not describe (`ENV:product`). */
  readonly unlisted: readonly string[];
  readonly failure: AccountFailure | null;
}

export interface PlusAccessReader {
  /** THE effective-access rule, `subscription_has_plus_access`, asked as the server. */
  hasPlusAccess(userId: string): Promise<boolean>;
}

export interface AccountReconciliationDependencies {
  readonly api: SubscriberStateApi;
  readonly mirror: SubscriptionMirror;
  readonly access: PlusAccessReader;
  readonly mode: ReconciliationMode;
  readonly now: () => number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sourceKey = (environment: SubscriptionEnvironment, productId: string) => `${environment}:${productId}`;

function stateOf(snapshot: EntitlementSnapshot): ProductState {
  return { status: snapshot.status, entitledUntilMs: snapshot.entitledUntilMs };
}

/** Whether applying `next` over `existing` changes what the row says (its verification instant aside). */
export function differsMaterially(existing: EntitlementSnapshot | null, next: EntitlementSnapshot): boolean {
  if (existing === null) return true;
  return (
    existing.status !== next.status ||
    existing.entitledUntilMs !== next.entitledUntilMs ||
    existing.expiresAtMs !== next.expiresAtMs ||
    existing.gracePeriodExpiresAtMs !== next.gracePeriodExpiresAtMs ||
    existing.willRenew !== next.willRenew ||
    existing.store !== next.store ||
    existing.periodType !== next.periodType ||
    existing.plan !== next.plan ||
    existing.unsubscribeDetectedAtMs !== next.unsubscribeDetectedAtMs ||
    existing.billingIssueDetectedAtMs !== next.billingIssueDetectedAtMs
  );
}

export async function reconcileAccount(account: AccountToReconcile, deps: AccountReconciliationDependencies): Promise<AccountReport> {
  const base = {
    userId: account.userId,
    requests: 0,
    accessBefore: account.plusAccess,
    accessAfter: null,
    changes: [] as ProductChange[],
    unlisted: [] as string[],
    failure: null,
  };
  const report = (outcome: AccountOutcome, detail: string | null, extra: Partial<AccountReport> = {}): AccountReport => ({
    ...base,
    outcome,
    detail,
    ...extra,
  });

  // 1. The mirror, both environments, through the webhook's matching.
  const reads: Partial<Record<SubscriptionEnvironment, MirrorRead>> = {};
  try {
    for (const environment of SUBSCRIPTION_ENVIRONMENTS) {
      reads[environment] = await deps.mirror.readMirror(account.appUserIds, environment);
    }
  } catch {
    return report('FAILED', 'mirror read failed', { failure: 'mirror' });
  }
  const matched = reads.PRODUCTION;
  if (matched === undefined || matched.userId === null || matched.matchedAppUserId === null) {
    return report('INVESTIGATE', 'no App User ID of this account matches a user');
  }
  if (matched.userId.toLowerCase() !== account.userId.toLowerCase()) {
    return report('INVESTIGATE', 'the App User IDs match another account');
  }

  const nowMs = deps.now();
  const inForce = new Map<string, EntitlementSnapshot>();
  for (const environment of SUBSCRIPTION_ENVIRONMENTS) {
    for (const snapshot of reads[environment]?.snapshots ?? []) {
      if (isEntitledAt(snapshot, nowMs)) inForce.set(sourceKey(environment, snapshot.productId), snapshot);
    }
  }

  // 2. RevenueCat.
  let read;
  try {
    read = await deps.api.fetchSubscriberState(matched.matchedAppUserId);
  } catch (error) {
    if (error instanceof RevenueCatApiError) {
      return report('FAILED', error.message, { failure: error.kind, requests: error.attempts });
    }
    return report('FAILED', 'revenuecat request failed', { failure: 'network', requests: 1 });
  }
  base.requests = read.attempts;

  if (read.created) {
    return inForce.size > 0
      ? report('INVESTIGATE', 'no RevenueCat customer beside mirrored sources in force', { unlisted: [...inForce.keys()] })
      : report('NO_SUBSCRIBER', 'no RevenueCat customer (an empty one was created by the read)');
  }

  // 3. The webhook's mapping.
  const mapped = mapSubscriberResponse(read.body, matched.matchedAppUserId);
  if (mapped === undefined) return report('FAILED', 'malformed subscriber answer', { failure: 'malformed' });

  // A subscriber whose original App User ID is ANOTHER Supabase account was
  // aliased or transferred across accounts: nothing is applied to either.
  if (mapped.originalAppUserId !== null && mapped.originalAppUserId !== matched.matchedAppUserId && UUID.test(mapped.originalAppUserId)) {
    let other: MirrorRead;
    try {
      other = await deps.mirror.readMirror([mapped.originalAppUserId], 'PRODUCTION');
    } catch {
      return report('FAILED', 'mirror read failed', { failure: 'mirror' });
    }
    if (other.userId !== null && other.userId.toLowerCase() !== matched.userId.toLowerCase()) {
      return report('INVESTIGATE', 'the subscriber is shared with another account (alias or transfer)');
    }
  }

  if (mapped.sources.length === 0) {
    return inForce.size > 0
      ? report('INVESTIGATE', 'RevenueCat lists no source beside mirrored sources in force', { unlisted: [...inForce.keys()] })
      : report('NO_SOURCES', 'the customer grants nothing');
  }

  // 4. One row per described product, through THE 6.5A function.
  const changes: ProductChange[] = [];
  const described = new Set<string>();
  for (const { environment, snapshot } of mapped.sources) {
    const existing = findSnapshot(reads[environment]?.snapshots ?? [], snapshot.productId);
    described.add(sourceKey(environment, snapshot.productId));
    const merged = mergeReconciledSnapshot(existing, snapshot);
    const changed = differsMaterially(existing, merged);
    let result: ProductChangeResult;
    if (deps.mode === 'DRY_RUN') {
      const stale = existing !== null && existing.verifiedAtMs > merged.verifiedAtMs;
      result = stale ? 'would-be-stale' : changed ? 'would-apply' : 'would-confirm';
    } else {
      let applied;
      try {
        applied = await deps.mirror.applyReconciliation(matched.userId, environment, snapshot.productId, merged);
      } catch {
        return report('FAILED', 'mirror write failed', { failure: 'mirror', changes });
      }
      result = applied === 'STALE' ? 'stale' : changed ? 'applied' : 'confirmed';
    }
    changes.push({ environment, productId: snapshot.productId, before: existing === null ? null : stateOf(existing), after: stateOf(merged), result });
  }

  const unlisted = [...inForce.keys()].filter((key) => !described.has(key));
  let accessAfter: boolean | null = null;
  if (deps.mode === 'APPLY') {
    try {
      accessAfter = await deps.access.hasPlusAccess(matched.userId);
    } catch {
      accessAfter = null;
    }
  }

  const applied = changes.some((change) => change.result === 'applied' || change.result === 'would-apply');
  const allStale = changes.every((change) => change.result === 'stale' || change.result === 'would-be-stale');
  const extra = { changes, unlisted, accessAfter };
  if (unlisted.length > 0) return report('INVESTIGATE', 'a mirrored source in force is not listed by RevenueCat', extra);
  if (applied) return report('APPLIED', null, extra);
  if (allStale) return report('STALE', 'every described row was confirmed later', extra);
  return report('CONFIRMED', null, extra);
}

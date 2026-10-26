// BeautIzzy — Plus reconciliation: one pass — a bounded batch, sequential,
// settled account by account
//
// A pass is ONE invocation of the Edge Function: the request names what to
// reconcile and whether to write; the database selects the batch and leases
// it (`subscription_reconciliation_claim`); every account is reconciled in
// turn (account-reconciliation.ts), with a pause between RevenueCat requests,
// and settled at once (`subscription_reconciliation_settle`) so a crash in
// the middle loses nothing already recorded; the run is closed
// (`subscription_reconciliation_finish`), which releases every lease it
// still held. The caller — an operator with curl, or the pg_cron job once an
// operator creates it — continues with the cursor the answer carries.
//
// Two failures stop the pass early, on purpose: an UNAUTHORIZED key (every
// further request would fail the same way — a configuration problem to fix,
// not to retry through the batch) and a RATE LIMIT that survived the bounded
// retries (the pass yields; the next invocation resumes). Every other
// failure is per account: recorded, retried later with backoff, the pass
// goes on. A pass never writes anything on a failed read.
//
// What an invocation may cost RevenueCat is bounded by construction:
// at most `limit` (≤ 50) accounts × the client's bounded attempts, one
// request at a time, `spacingMs` apart.

import { reconcileAccount, type AccountReport, type AccountToReconcile, type PlusAccessReader, type ReconciliationMode } from './account-reconciliation.ts';
import type { SubscriptionMirror } from '../../revenuecat-webhook/core/mirror.ts';
import type { SubscriberStateApi } from './revenuecat-api.ts';

export type RunKind = 'SWEEP' | 'BACKFILL';

export type RunScope = { readonly users: readonly string[] } | { readonly source: 'mirrored' | 'businesses' };

export interface RunRequest {
  readonly kind: RunKind;
  readonly mode: ReconciliationMode;
  readonly scope: RunScope;
  readonly limit: number;
  /** Continuation cursor of an ordered (BACKFILL) scope: the last user id of the previous batch. */
  readonly after: string | null;
  /** Accounts RevenueCat answered for less than this long ago are skipped. */
  readonly minAgeSeconds: number;
}

export const DEFAULT_BATCH_LIMIT = 20;
export const MAX_BATCH_LIMIT = 50;
export const MAX_EXPLICIT_USERS = 50;
/** The pause between two RevenueCat requests of one pass (v1 guidance: about one per second). */
export const DEFAULT_REQUEST_SPACING_MS = 1_000;
/** The lease of APPLY mode: longer than the slowest conceivable pass, shorter than two scheduler ticks. */
export const DEFAULT_LEASE_SECONDS = 300;

export type RunRequestParseResult = { readonly ok: true; readonly request: RunRequest } | { readonly ok: false; readonly reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN_KEYS = new Set(['kind', 'mode', 'users', 'source', 'limit', 'after', 'minAgeSeconds']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The request body of one invocation. Everything defaults to the SAFE side:
 * no body is a DRY_RUN SWEEP of the mirrored accounts; writing takes an
 * explicit `"mode": "APPLY"`; an unknown key is refused rather than ignored
 * (a misspelt `mode` must never silently become a dry run — or a write).
 */
export function parseRunRequest(body: unknown): RunRequestParseResult {
  if (body === undefined || body === null) body = {};
  if (!isRecord(body)) return { ok: false, reason: 'body must be a JSON object' };
  for (const key of Object.keys(body)) {
    if (!KNOWN_KEYS.has(key)) return { ok: false, reason: `unknown key: ${key.slice(0, 40)}` };
  }
  const mode = body.mode ?? 'DRY_RUN';
  if (mode !== 'DRY_RUN' && mode !== 'APPLY') return { ok: false, reason: 'mode must be DRY_RUN or APPLY' };

  let scope: RunScope;
  if (body.users !== undefined) {
    if (body.source !== undefined) return { ok: false, reason: 'users and source are exclusive' };
    if (!Array.isArray(body.users) || body.users.length === 0) return { ok: false, reason: 'users must be a non-empty array' };
    if (body.users.length > MAX_EXPLICIT_USERS) return { ok: false, reason: `users holds more than ${MAX_EXPLICIT_USERS} entries` };
    const users: string[] = [];
    for (const entry of body.users) {
      if (typeof entry !== 'string' || entry.trim().length === 0 || entry.length > 200) return { ok: false, reason: 'users must hold non-empty strings' };
      users.push(entry.trim());
    }
    scope = { users };
  } else {
    const source = body.source ?? 'mirrored';
    if (source !== 'mirrored' && source !== 'businesses') return { ok: false, reason: 'source must be mirrored or businesses' };
    scope = { source };
  }

  const kind = body.kind ?? ('users' in scope ? 'BACKFILL' : 'SWEEP');
  if (kind !== 'SWEEP' && kind !== 'BACKFILL') return { ok: false, reason: 'kind must be SWEEP or BACKFILL' };
  if (kind === 'SWEEP' && 'users' in scope) return { ok: false, reason: 'a SWEEP takes a source, not a user list' };

  const limit = body.limit ?? DEFAULT_BATCH_LIMIT;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH_LIMIT) {
    return { ok: false, reason: `limit must be an integer between 1 and ${MAX_BATCH_LIMIT}` };
  }
  const after = body.after ?? null;
  if (after !== null && (typeof after !== 'string' || !UUID.test(after))) return { ok: false, reason: 'after must be a user id' };
  if (after !== null && kind === 'SWEEP') return { ok: false, reason: 'a SWEEP takes no cursor' };
  const minAgeSeconds = body.minAgeSeconds ?? 0;
  if (typeof minAgeSeconds !== 'number' || !Number.isInteger(minAgeSeconds) || minAgeSeconds < 0 || minAgeSeconds > 30 * 24 * 3600) {
    return { ok: false, reason: 'minAgeSeconds must be an integer between 0 and 30 days' };
  }
  return { ok: true, request: { kind, mode, scope, limit, after, minAgeSeconds } };
}

export interface SkippedCounts {
  readonly leased: number;
  readonly recent: number;
  readonly backoff: number;
}

export interface ClaimedBatch {
  readonly runId: string;
  readonly accounts: readonly AccountToReconcile[];
  /** Entries of an explicit list that are not Supabase users: reported, never invented. */
  readonly unknownUsers: readonly string[];
  readonly skipped: SkippedCounts;
  /** Accounts the scope holds that could be selected now (the batch is its first `limit`). */
  readonly eligible: number;
  readonly nextCursor: string | null;
}

export type RunStatus = 'COMPLETED' | 'STOPPED' | 'FAILED';

export interface FinishedRun {
  readonly runId: string;
  readonly status: RunStatus;
  readonly selected: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly requests: number;
  readonly cursorUserId: string | null;
  readonly lastError: string | null;
}

/** The pass's database surface: the three subscription_reconciliation_* functions. */
export interface ReconciliationControl {
  claim(request: RunRequest, leaseSeconds: number): Promise<ClaimedBatch>;
  settle(runId: string, report: AccountReport): Promise<void>;
  finish(runId: string, status: RunStatus, error: string | null): Promise<FinishedRun>;
}

export interface PassSummary {
  readonly runId: string;
  readonly kind: RunKind;
  readonly mode: ReconciliationMode;
  readonly status: RunStatus;
  /** Why the pass ended before its batch, when it did. */
  readonly stoppedBy: string | null;
  readonly selected: number;
  readonly processed: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly requests: number;
  readonly accounts: readonly AccountReport[];
  readonly unknownUsers: readonly string[];
  readonly skipped: SkippedCounts;
  readonly eligible: number;
  readonly nextCursor: string | null;
}

export interface PassDependencies {
  readonly control: ReconciliationControl;
  readonly api: SubscriberStateApi;
  readonly mirror: SubscriptionMirror;
  readonly access: PlusAccessReader;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly spacingMs?: number;
  readonly leaseSeconds?: number;
  readonly now?: () => number;
}

/** A failure message fit for a run row: bounded, never a key. */
export function sanitizeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : 'pass failed';
  return message.replace(/sk_[A-Za-z0-9]+/g, 'sk_…').replace(/Bearer\s+\S+/g, 'Bearer …').slice(0, 200);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runReconciliationPass(request: RunRequest, deps: PassDependencies): Promise<PassSummary> {
  const sleep = deps.sleep ?? defaultSleep;
  const spacingMs = deps.spacingMs ?? DEFAULT_REQUEST_SPACING_MS;
  const now = deps.now ?? (() => Date.now());
  const batch = await deps.control.claim(request, deps.leaseSeconds ?? DEFAULT_LEASE_SECONDS);

  const accounts: AccountReport[] = [];
  let status: RunStatus = 'COMPLETED';
  let stoppedBy: string | null = null;
  try {
    for (const [index, account] of batch.accounts.entries()) {
      if (index > 0) await sleep(spacingMs);
      const report = await reconcileAccount(account, { api: deps.api, mirror: deps.mirror, access: deps.access, mode: request.mode, now });
      accounts.push(report);
      await deps.control.settle(batch.runId, report);
      if (report.failure === 'unauthorized') {
        status = 'STOPPED';
        stoppedBy = 'unauthorized: the RevenueCat key is refused';
        break;
      }
      if (report.failure === 'rate_limited') {
        status = 'STOPPED';
        stoppedBy = 'rate-limited: the pass yields; invoke again later';
        break;
      }
    }
  } catch (error) {
    // The database refused to record an outcome: the pass cannot go on safely.
    status = 'FAILED';
    stoppedBy = sanitizeFailure(error);
  }

  const finished = await deps.control.finish(batch.runId, status, stoppedBy);
  return {
    runId: batch.runId,
    kind: request.kind,
    mode: request.mode,
    status: finished.status,
    stoppedBy,
    selected: batch.accounts.length,
    processed: accounts.length,
    counts: finished.counts,
    requests: finished.requests,
    accounts,
    unknownUsers: batch.unknownUsers,
    skipped: batch.skipped,
    eligible: batch.eligible,
    nextCursor: status === 'COMPLETED' ? batch.nextCursor : null,
  };
}

/** The log line of a pass: counts and vocabularies only — never a user id, a product state or a key. */
export function describePassForLog(summary: PassSummary): Record<string, unknown> {
  return {
    runId: summary.runId,
    kind: summary.kind,
    mode: summary.mode,
    status: summary.status,
    stoppedBy: summary.stoppedBy,
    selected: summary.selected,
    processed: summary.processed,
    counts: summary.counts,
    requests: summary.requests,
    skipped: summary.skipped,
    eligible: summary.eligible,
    unknownUsers: summary.unknownUsers.length,
    hasNextCursor: summary.nextCursor !== null,
  };
}

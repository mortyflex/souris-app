// BeautIzzy — Plus reconciliation: the run control and the access rule bound
// to the subscription_reconciliation_* and subscription_has_plus_access RPCs
//
// The pass's ONLY database surface beside the mirror port it shares with the
// webhook (`createSupabaseSubscriptionMirror`). Every call goes through the
// SECURITY DEFINER functions of 20261008120000_add_subscription_reconciliation.sql
// and of the 6.5A mirror under the service role; no table is read or written
// directly, so selection, leases, backoff and THE access rule stay in the
// database.

import type { AccountReport, AccountToReconcile, PlusAccessReader } from './account-reconciliation.ts';
import type { ClaimedBatch, FinishedRun, ReconciliationControl, RunRequest, RunStatus } from './run.ts';

/** The slice of a supabase-js client this adapter needs (privileged server client). */
export interface ReconciliationRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function counts(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, count(entry)]));
}

export function asClaimedAccount(row: unknown): AccountToReconcile {
  if (!isRecord(row)) throw new Error('subscription reconciliation: claim answered a malformed account');
  const userId = textOrNull(row.user_id);
  if (userId === null) throw new Error('subscription reconciliation: claim answered an account without user id');
  const appUserIds = Array.isArray(row.app_user_ids) ? row.app_user_ids.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  return {
    userId,
    businessId: textOrNull(row.business_id),
    // The user id comes first: THE App User ID of the account; the mirror's known ids follow.
    appUserIds: [userId, ...appUserIds.filter((id) => id !== userId)],
    mirrorRows: count(row.mirror_rows),
    plusAccess: row.plus_access === true,
  };
}

export function asClaimedBatch(data: unknown): ClaimedBatch {
  if (!isRecord(data)) throw new Error('subscription reconciliation: subscription_reconciliation_claim answered no object');
  const runId = textOrNull(data.run_id);
  if (runId === null) throw new Error('subscription reconciliation: subscription_reconciliation_claim answered no run id');
  const skipped = isRecord(data.skipped) ? data.skipped : {};
  return {
    runId,
    accounts: Array.isArray(data.users) ? data.users.map(asClaimedAccount) : [],
    unknownUsers: Array.isArray(data.unknown_users) ? data.unknown_users.filter((id): id is string => typeof id === 'string') : [],
    skipped: { leased: count(skipped.leased), recent: count(skipped.recent), backoff: count(skipped.backoff) },
    eligible: count(data.eligible),
    nextCursor: textOrNull(data.next_cursor),
  };
}

export function asFinishedRun(data: unknown): FinishedRun {
  if (!isRecord(data)) throw new Error('subscription reconciliation: subscription_reconciliation_finish answered no object');
  const runId = textOrNull(data.run_id);
  const status = data.status;
  if (runId === null || (status !== 'COMPLETED' && status !== 'STOPPED' && status !== 'FAILED')) {
    throw new Error('subscription reconciliation: subscription_reconciliation_finish answered an unknown status');
  }
  return {
    runId,
    status: status as RunStatus,
    selected: count(data.selected),
    counts: counts(data.counts),
    requests: count(data.requests),
    cursorUserId: textOrNull(data.cursor_user_id),
    lastError: textOrNull(data.last_error),
  };
}

function scopeToJson(request: RunRequest): Record<string, unknown> {
  return 'users' in request.scope ? { users: [...request.scope.users] } : { source: request.scope.source };
}

export function createSupabaseReconciliationControl(client: ReconciliationRpcClient): ReconciliationControl {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      // The database message names the function, never a payload or a key.
      throw new Error(`subscription reconciliation: ${fn} failed: ${error.message}`);
    }
    return data;
  }

  return {
    async claim(request, leaseSeconds) {
      return asClaimedBatch(
        await call('subscription_reconciliation_claim', {
          p_kind: request.kind,
          p_mode: request.mode,
          p_scope: scopeToJson(request),
          p_limit: request.limit,
          p_after: request.after,
          p_min_age_seconds: request.minAgeSeconds,
          p_lease_seconds: leaseSeconds,
        }),
      );
    },

    async settle(runId, report: AccountReport) {
      await call('subscription_reconciliation_settle', {
        p_run_id: runId,
        p_user_id: report.userId,
        p_outcome: report.outcome,
        p_detail: report.detail,
        p_requests: report.requests,
      });
    },

    async finish(runId, status, error) {
      return asFinishedRun(await call('subscription_reconciliation_finish', { p_run_id: runId, p_status: status, p_error: error }));
    },
  };
}

/** THE effective-access rule, asked through `subscription_has_plus_access` (service_role holds EXECUTE on it). */
export function createSupabasePlusAccessReader(client: ReconciliationRpcClient): PlusAccessReader {
  return {
    async hasPlusAccess(userId) {
      const { data, error } = await client.rpc('subscription_has_plus_access', { p_user_id: userId });
      if (error) throw new Error(`subscription reconciliation: subscription_has_plus_access failed: ${error.message}`);
      if (typeof data !== 'boolean') throw new Error('subscription reconciliation: subscription_has_plus_access answered no boolean');
      return data;
    },
  };
}

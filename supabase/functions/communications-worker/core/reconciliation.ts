// Souris — Communication Core (Lot B hardening): reconciliation retry pass
//
// A trigger reconciliation that failed left a durable job
// (`communication_reconciliation_jobs`). This pass re-runs the SAME
// authoritative database reconciliation for each due job — the reminder
// business rules live in Postgres (`communications_run_reconciliation`) and
// are never re-implemented here. A job names a TARGET only; the retry always
// reconciles the CURRENT authoritative state, so stale data cannot win.
//
//   claim a bounded batch (atomic; the pushed-forward next_attempt_at is the lease)
//   for each job:
//     run the authoritative reconciliation
//     success            → complete (removed, unless a newer failure coalesced)
//     failure            → the CENTRAL retry policy decides: back off, or PARK
//                          (a durable trace the next authoritative change of
//                          the same target revives)
//
// Observability: counts and sanitized errors only. A raised Postgres message
// could quote a value, so email-shaped tokens are redacted before anything is
// stored or summarized. This is an INTERNAL reconciliation failure — a
// different concept from a provider-send failure, settled on a different
// table.

import {
  COMMUNICATION_RETRY_POLICY,
  decideAfterRetryableFailure,
  type RetryPolicy,
} from './retry-policy.ts';

export type ReconciliationScope = 'APPOINTMENT' | 'BUSINESS';

export interface ClaimedReconciliationJob {
  readonly id: string;
  readonly businessId: string;
  readonly scopeType: ReconciliationScope;
  readonly sourceId: string;
  /** Attempt number of THIS claim (the claim already incremented it). */
  readonly attemptCount: number;
  /** The `updated_at` observed at claim time; settlements are conditional on it. */
  readonly claimedUpdatedAt: string;
}

export interface ReconciliationRetryQueue {
  /** Atomically claim a bounded batch of due retry jobs. */
  claimJobs(): Promise<readonly ClaimedReconciliationJob[]>;
  /** Re-runs the authoritative database reconciliation; throws on failure. */
  runReconciliation(job: ClaimedReconciliationJob): Promise<void>;
  completeJob(id: string, claimedUpdatedAt: string): Promise<void>;
  /** delaySeconds null = park the job as a durable trace. */
  failJob(id: string, error: string, delaySeconds: number | null, claimedUpdatedAt: string): Promise<void>;
}

export interface ReconciliationSummary {
  readonly claimed: number;
  readonly reconciled: number;
  readonly retried: number;
  readonly parked: number;
}

/** Redacts email-shaped tokens and bounds the message: internal errors only. */
export function sanitizeReconciliationError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown reconciliation error';
  return message.replace(/[^\s@]+@[^\s@]+/g, '[email]').slice(0, 300);
}

export async function runReconciliationRetries(
  queue: ReconciliationRetryQueue,
  policy: RetryPolicy = COMMUNICATION_RETRY_POLICY,
): Promise<ReconciliationSummary> {
  const claimed = await queue.claimJobs();
  let reconciled = 0;
  let retried = 0;
  let parked = 0;

  for (const job of claimed) {
    try {
      await queue.runReconciliation(job);
    } catch (error) {
      const decision = decideAfterRetryableFailure(policy, job.attemptCount);
      const sanitized = sanitizeReconciliationError(error);
      if (decision.kind === 'RETRY') {
        await queue.failJob(job.id, sanitized, decision.delaySeconds, job.claimedUpdatedAt);
        retried += 1;
      } else {
        await queue.failJob(
          job.id,
          `${sanitized} (retry attempts exhausted)`,
          null,
          job.claimedUpdatedAt,
        );
        parked += 1;
      }
      continue;
    }
    await queue.completeJob(job.id, job.claimedUpdatedAt);
    reconciled += 1;
  }

  return { claimed: claimed.length, reconciled, retried, parked };
}

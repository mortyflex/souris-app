// BeautIzzy — Communication Core: the worker pass
//
// One invocation = FIRST re-run any failed trigger reconciliations
// (reconciliation.ts — a recovered reconciliation may enqueue an immediate
// event this same pass then sends), THEN claim a bounded batch of due
// records, ask the database for the final go-ahead on each one, dispatch
// through its channel's transport, and settle each one exactly once (sent,
// retry under the central policy, or failed). Everything time-, state- and
// concurrency-sensitive is the database's job (communications_claim_due /
// authorize_dispatch / mark_* and the reconciliation claim/settle RPCs): two
// overlapping invocations can never process the same record; a record
// cancelled after being claimed is skipped; a record of a Business that is
// no longer entitled to communications (BeautIzzy Plus, server-side
// enforcement — Phase 6.5B) is suspended by the database and never
// dispatched. The worker holds no entitlement rule of its own.
//
// Compatibility rule: the pass begins with a side-effect-free check that the
// database exposes the pre-dispatch gate (`verifyDispatchAuthorization`). A
// worker deployed BEFORE its migration therefore refuses the whole pass with
// `WorkerCompatibilityError` — nothing claimed (no reconciliation job, no
// communication), no attempt count moved, no status changed, no provider
// called — instead of claiming records it could never authorize and letting
// their leases expire into FAILED. It never falls back to dispatching
// without authorization.
//
// Observability rule: summaries carry counts and ids only. Payloads and
// recipients are business-private and are never logged.

import type { CommunicationQueue } from './queue.ts';
import {
  runReconciliationRetries,
  type ReconciliationRetryQueue,
  type ReconciliationSummary,
} from './reconciliation.ts';
import type { TransportRegistry, TransportResult } from './transport.ts';
import {
  COMMUNICATION_RETRY_POLICY,
  decideAfterRetryableFailure,
  type RetryPolicy,
} from './retry-policy.ts';

export interface WorkerSummary {
  readonly claimed: number;
  readonly sent: number;
  readonly retried: number;
  readonly failed: number;
  /** Claimed records skipped without dispatch (cancelled between claim and dispatch). */
  readonly skipped: number;
  /** Claimed records the database suspended before dispatch: the Business is not entitled now. */
  readonly suspended: number;
  /** The reconciliation retry pass that ran before sending (counts only). */
  readonly reconciliation: ReconciliationSummary;
}

export interface WorkerDependencies {
  readonly queue: CommunicationQueue;
  readonly transports: TransportRegistry;
  /** Absent in tests that exercise sending alone: the retry pass then reports zeros. */
  readonly reconciliation?: ReconciliationRetryQueue;
  readonly retryPolicy?: RetryPolicy;
}

/**
 * The database does not expose what this worker build needs (the pre-dispatch
 * authorization gate of migration 20261005120000). Raised BEFORE anything is
 * claimed; the Deno entry answers 500 with this message.
 */
export class WorkerCompatibilityError extends Error {
  constructor(detail: string) {
    super(
      `communications worker: pre-dispatch authorization gate unavailable — apply migration ` +
        `20261005120000_add_communication_entitlement_enforcement.sql before deploying this worker ` +
        `(${detail})`,
    );
    this.name = 'WorkerCompatibilityError';
  }
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 500);
  }
  return 'unknown transport error';
}

export async function runCommunicationsWorker(
  deps: WorkerDependencies,
): Promise<WorkerSummary> {
  const policy = deps.retryPolicy ?? COMMUNICATION_RETRY_POLICY;

  // Compatibility FIRST, before any claim: a worker whose database lacks the
  // pre-dispatch gate refuses the pass and touches nothing.
  try {
    await deps.queue.verifyDispatchAuthorization();
  } catch (error) {
    throw new WorkerCompatibilityError(sanitizeError(error));
  }

  // Recover FIRST: a reconciliation that failed at trigger time is re-run
  // from current authoritative state, so anything it (re)schedules or
  // enqueues immediately is eligible for the send pass below.
  const reconciliation = deps.reconciliation
    ? await runReconciliationRetries(deps.reconciliation, policy)
    : { claimed: 0, reconciled: 0, retried: 0, parked: 0 };

  const claimed = await deps.queue.claimDue();
  let sent = 0;
  let retried = 0;
  let failed = 0;
  let skipped = 0;
  let suspended = 0;

  for (const communication of claimed) {
    // Bound crash loops: a record repeatedly claimed by workers that died
    // before settling it must not be dispatched forever.
    if (communication.attemptCount > policy.maxAttempts) {
      await deps.queue.markFailed(
        communication.id,
        'retry attempts exhausted before dispatch',
      );
      failed += 1;
      continue;
    }

    // Final eligibility check, immediately before dispatch, decided by the
    // database: a record cancelled after the claim must not be sent, and a
    // record of a Business that is not entitled NOW is suspended there and
    // must not be sent either.
    const authorization = await deps.queue.authorizeDispatch(communication.id);
    if (authorization === 'SUSPENDED') {
      suspended += 1;
      continue;
    }
    if (authorization !== 'DISPATCH') {
      skipped += 1;
      continue;
    }

    const transport = deps.transports[communication.channel];
    if (!transport) {
      await deps.queue.markFailed(
        communication.id,
        `no transport registered for channel ${communication.channel}`,
      );
      failed += 1;
      continue;
    }

    let result: TransportResult;
    try {
      result = await transport.send(communication);
    } catch (error) {
      // A throwing transport is a transient infrastructure problem, not a
      // verdict on the message: treat it as retryable.
      result = { status: 'RETRYABLE_FAILURE', error: sanitizeError(error) };
    }

    if (result.status === 'SENT') {
      await deps.queue.markSent(communication.id, result.providerMessageId ?? null);
      sent += 1;
      continue;
    }
    if (result.status === 'PERMANENT_FAILURE') {
      await deps.queue.markFailed(communication.id, result.error);
      failed += 1;
      continue;
    }
    const decision = decideAfterRetryableFailure(policy, communication.attemptCount);
    if (decision.kind === 'RETRY') {
      await deps.queue.markRetry(communication.id, result.error, decision.delaySeconds);
      retried += 1;
    } else {
      await deps.queue.markFailed(
        communication.id,
        `${result.error} (retry attempts exhausted)`,
      );
      failed += 1;
    }
  }

  return {
    claimed: claimed.length,
    sent,
    retried,
    failed,
    skipped,
    suspended,
    reconciliation,
  };
}

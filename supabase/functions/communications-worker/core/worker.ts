// Souris — Communication Core: the worker pass
//
// One invocation = claim a bounded batch of due records, dispatch each one
// through its channel's transport, settle each one exactly once (sent, retry
// under the central policy, or failed). Everything time- and
// concurrency-sensitive is the database's job (communications_claim_due /
// mark_*): two overlapping invocations can never process the same record,
// and a record cancelled after being claimed is re-checked immediately
// before dispatch and skipped.
//
// Observability rule: summaries carry counts and ids only. Payloads and
// recipients are business-private and are never logged.

import type { CommunicationQueue } from './queue.ts';
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
}

export interface WorkerDependencies {
  readonly queue: CommunicationQueue;
  readonly transports: TransportRegistry;
  readonly retryPolicy?: RetryPolicy;
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
  const claimed = await deps.queue.claimDue();
  let sent = 0;
  let retried = 0;
  let failed = 0;
  let skipped = 0;

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

    // Cancellation re-check, immediately before dispatch: a record cancelled
    // after the claim must not be sent.
    const status = await deps.queue.readStatus(communication.id);
    if (status !== 'PROCESSING') {
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

  return { claimed: claimed.length, sent, retried, failed, skipped };
}

// BeautIzzy — Communication Core: the queue port the worker runs against
//
// The authoritative queue is the `scheduled_communications` table; the
// production adapter (supabase-queue.ts) binds this port to the
// `communications_*` functions. Tests bind it to an in-memory fake
// (testing/fake-queue.ts). The worker itself never sees SQL, supabase-js or a
// wall clock: dueness, leases, retry instants AND the final pre-dispatch
// eligibility (status re-check + BeautIzzy Plus entitlement, Phase 6.5B) are
// decided by the database.

import type { CommunicationChannel, OutgoingCommunication } from './transport.ts';

export type CommunicationStatus =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

/**
 * The database's verdict on one CLAIMED record, immediately before dispatch.
 *
 *   DISPATCH   still PROCESSING and the Business is entitled now: send it
 *   SUSPENDED  still PROCESSING but the Business is NOT entitled now (server-side
 *              enforcement enabled): the database cancelled the record
 *              (ENTITLEMENT_SUSPENDED); never send it
 *   SKIPPED    no longer PROCESSING (cancelled between claim and dispatch, or
 *              settled elsewhere) or absent: never send it
 */
export type DispatchAuthorization = 'DISPATCH' | 'SUSPENDED' | 'SKIPPED';

export interface ClaimedCommunication extends OutgoingCommunication {
  readonly channel: CommunicationChannel;
  /** Attempt number of THIS claim (the claim already incremented it). */
  readonly attemptCount: number;
}

export interface CommunicationQueue {
  /**
   * Side-effect-free compatibility check, run BEFORE anything is claimed:
   * resolves when the database exposes the pre-dispatch gate this worker
   * needs, rejects otherwise (a worker deployed before its migration). It
   * must never lock, claim, settle or rewrite a record.
   */
  verifyDispatchAuthorization(): Promise<void>;
  /** Atomically claim a bounded batch of due records (they become PROCESSING). */
  claimDue(): Promise<readonly ClaimedCommunication[]>;
  /** The final pre-dispatch check of one claimed record — decided by the database. */
  authorizeDispatch(id: string): Promise<DispatchAuthorization>;
  markSent(id: string, providerMessageId: string | null): Promise<void>;
  /** Back to SCHEDULED; the database applies the delay to its own clock. */
  markRetry(id: string, error: string, delaySeconds: number): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

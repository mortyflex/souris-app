// BeautIzzy — Communication Core: the queue port the worker runs against
//
// The authoritative queue is the `scheduled_communications` table; the
// production adapter (supabase-queue.ts) binds this port to the
// `communications_*` functions. Tests bind it to an in-memory fake
// (testing/fake-queue.ts). The worker itself never sees SQL, supabase-js or a
// wall clock: dueness, leases and retry instants are decided by the database.

import type { CommunicationChannel, OutgoingCommunication } from './transport.ts';

export type CommunicationStatus =
  | 'SCHEDULED'
  | 'PROCESSING'
  | 'SENT'
  | 'FAILED'
  | 'CANCELLED';

export interface ClaimedCommunication extends OutgoingCommunication {
  readonly channel: CommunicationChannel;
  /** Attempt number of THIS claim (the claim already incremented it). */
  readonly attemptCount: number;
}

export interface CommunicationQueue {
  /** Atomically claim a bounded batch of due records (they become PROCESSING). */
  claimDue(): Promise<readonly ClaimedCommunication[]>;
  /** Current status of one record — the pre-dispatch cancellation re-check. */
  readStatus(id: string): Promise<CommunicationStatus | null>;
  markSent(id: string, providerMessageId: string | null): Promise<void>;
  /** Back to SCHEDULED; the database applies the delay to its own clock. */
  markRetry(id: string, error: string, delaySeconds: number): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

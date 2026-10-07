// BeautIzzy — Communication Core: in-memory queue for worker tests
//
// Mirrors the observable contract of the communications_* functions closely
// enough to exercise the worker: claiming turns SCHEDULED into PROCESSING and
// increments attempt_count; the mark_* settlements only act on rows still
// PROCESSING; a cancellation wins over any later settlement. Dueness is not
// simulated — tests control exactly which records exist.

import type {
  ClaimedCommunication,
  CommunicationQueue,
  CommunicationStatus,
} from '../queue.ts';
import type { CommunicationChannel } from '../transport.ts';

export interface FakeQueueRecord {
  readonly id: string;
  readonly businessId: string;
  readonly kind: string;
  readonly channel: CommunicationChannel;
  readonly recipient: string;
  readonly payload: Record<string, unknown>;
  status: CommunicationStatus;
  attemptCount: number;
  lastError: string | null;
  providerMessageId: string | null;
  /** Every delay handed to markRetry, in order. */
  readonly retryDelaysSeconds: number[];
}

export class FakeCommunicationQueue implements CommunicationQueue {
  private readonly records = new Map<string, FakeQueueRecord>();

  /** Called after a claim settles, before the batch is returned to the worker. */
  onClaimed?: (ids: readonly string[]) => void;

  addScheduled(record: {
    id: string;
    channel: CommunicationChannel;
    payload?: Record<string, unknown>;
    attemptCount?: number;
    kind?: string;
  }): FakeQueueRecord {
    const stored: FakeQueueRecord = {
      id: record.id,
      businessId: 'business-1',
      kind: record.kind ?? 'APPOINTMENT_REMINDER',
      channel: record.channel,
      recipient: 'client@example.test',
      payload: record.payload ?? {},
      status: 'SCHEDULED',
      attemptCount: record.attemptCount ?? 0,
      lastError: null,
      providerMessageId: null,
      retryDelaysSeconds: [],
    };
    this.records.set(record.id, stored);
    return stored;
  }

  read(id: string): FakeQueueRecord {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`fake queue: unknown record ${id}`);
    }
    return record;
  }

  cancel(id: string): void {
    const record = this.read(id);
    if (record.status === 'SCHEDULED' || record.status === 'PROCESSING') {
      record.status = 'CANCELLED';
    }
  }

  async claimDue(): Promise<readonly ClaimedCommunication[]> {
    const claimed: ClaimedCommunication[] = [];
    for (const record of this.records.values()) {
      if (record.status !== 'SCHEDULED') {
        continue;
      }
      record.status = 'PROCESSING';
      record.attemptCount += 1;
      claimed.push({
        id: record.id,
        businessId: record.businessId,
        kind: record.kind,
        channel: record.channel,
        recipient: record.recipient,
        payload: record.payload,
        attemptCount: record.attemptCount,
      });
    }
    this.onClaimed?.(claimed.map((record) => record.id));
    return claimed;
  }

  async readStatus(id: string): Promise<CommunicationStatus | null> {
    return this.records.get(id)?.status ?? null;
  }

  async markSent(id: string, providerMessageId: string | null): Promise<void> {
    const record = this.read(id);
    if (record.status === 'CANCELLED') {
      // Mirrors communications_mark_sent: a record cancelled while the
      // dispatch was in flight stays CANCELLED, but the dispatch is recorded.
      record.providerMessageId = providerMessageId ?? record.providerMessageId;
      record.lastError = 'DISPATCHED_BEFORE_CANCELLATION';
      return;
    }
    if (record.status !== 'PROCESSING') {
      return;
    }
    record.status = 'SENT';
    record.providerMessageId = providerMessageId;
    record.lastError = null;
  }

  async markRetry(id: string, error: string, delaySeconds: number): Promise<void> {
    const record = this.read(id);
    if (record.status !== 'PROCESSING') {
      return;
    }
    record.status = 'SCHEDULED';
    record.lastError = error;
    record.retryDelaysSeconds.push(delaySeconds);
  }

  async markFailed(id: string, error: string): Promise<void> {
    const record = this.read(id);
    if (record.status !== 'PROCESSING') {
      return;
    }
    record.status = 'FAILED';
    record.lastError = error;
  }
}

// Souris — Communication Core: the queue port bound to the communications_* functions
//
// The worker's only database surface. Every call goes through the RPCs of
// 20260926130000_create_communication_core.sql under the service role; no
// table is read or written directly, so the lifecycle rules stay centralized
// in the database. Batch size and lease live in the SQL function defaults —
// claimDue sends no arguments on purpose.

import type {
  ClaimedCommunication,
  CommunicationQueue,
  CommunicationStatus,
} from './queue.ts';
import type { CommunicationChannel } from './transport.ts';

/** The slice of a supabase-js client this adapter needs (service-role key). */
export interface CommunicationsRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const STATUSES: readonly CommunicationStatus[] = [
  'SCHEDULED',
  'PROCESSING',
  'SENT',
  'FAILED',
  'CANCELLED',
];

function asClaimedCommunication(row: unknown): ClaimedCommunication {
  const record = row as Record<string, unknown>;
  const channel = record.channel;
  if (channel !== 'EMAIL' && channel !== 'SMS') {
    throw new Error(`communications: unknown channel in claimed row`);
  }
  const payload = record.payload;
  return {
    id: String(record.id),
    businessId: String(record.business_id),
    kind: String(record.kind),
    channel: channel as CommunicationChannel,
    recipient: String(record.recipient),
    payload:
      payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
    attemptCount: Number(record.attempt_count),
  };
}

export function createSupabaseCommunicationQueue(
  client: CommunicationsRpcClient,
): CommunicationQueue {
  async function call(fn: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      throw new Error(`communications: ${fn} failed: ${error.message}`);
    }
    return data;
  }

  return {
    async claimDue() {
      const data = await call('communications_claim_due');
      if (!Array.isArray(data)) {
        return [];
      }
      return data.map(asClaimedCommunication);
    },

    async readStatus(id) {
      const data = await call('communications_read_status', { p_id: id });
      if (data === null) {
        return null;
      }
      const status = String(data) as CommunicationStatus;
      return STATUSES.includes(status) ? status : null;
    },

    async markSent(id, providerMessageId) {
      await call('communications_mark_sent', {
        p_id: id,
        p_provider_message_id: providerMessageId,
      });
    },

    async markRetry(id, error, delaySeconds) {
      await call('communications_mark_retry', {
        p_id: id,
        p_error: error,
        p_retry_delay_seconds: delaySeconds,
      });
    },

    async markFailed(id, error) {
      await call('communications_mark_failed', { p_id: id, p_error: error });
    },
  };
}

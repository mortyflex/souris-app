// BeautIzzy — Communication Core: the queue port bound to the communications_* functions
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
import type {
  ClaimedReconciliationJob,
  ReconciliationRetryQueue,
} from './reconciliation.ts';
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

function asClaimedReconciliationJob(row: unknown): ClaimedReconciliationJob {
  const record = row as Record<string, unknown>;
  const scopeType = record.scope_type;
  if (scopeType !== 'APPOINTMENT' && scopeType !== 'BUSINESS') {
    throw new Error('communications: unknown scope in claimed reconciliation job');
  }
  return {
    id: String(record.id),
    businessId: String(record.business_id),
    scopeType,
    sourceId: String(record.source_id ?? ''),
    attemptCount: Number(record.attempt_count),
    claimedUpdatedAt: String(record.updated_at),
  };
}

/**
 * The reconciliation retry port bound to the Lot B hardening RPCs
 * (20260928120000_add_communication_reconciliation_retry.sql). Batch size and
 * lease live in the SQL defaults; the authoritative reminder rules stay in
 * `communications_run_reconciliation`.
 */
export function createSupabaseReconciliationRetryQueue(
  client: CommunicationsRpcClient,
): ReconciliationRetryQueue {
  async function call(fn: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      throw new Error(`communications: ${fn} failed: ${error.message}`);
    }
    return data;
  }

  return {
    async claimJobs() {
      const data = await call('communications_claim_reconciliation_jobs');
      if (!Array.isArray(data)) {
        return [];
      }
      return data.map(asClaimedReconciliationJob);
    },

    async runReconciliation(job) {
      await call('communications_run_reconciliation', {
        p_business_id: job.businessId,
        p_scope_type: job.scopeType,
        p_source_id: job.sourceId,
      });
    },

    async completeJob(id, claimedUpdatedAt) {
      await call('communications_complete_reconciliation_job', {
        p_id: id,
        p_claimed_updated_at: claimedUpdatedAt,
      });
    },

    async failJob(id, error, delaySeconds, claimedUpdatedAt) {
      await call('communications_fail_reconciliation_job', {
        p_id: id,
        p_claimed_updated_at: claimedUpdatedAt,
        p_error: error,
        p_retry_delay_seconds: delaySeconds,
      });
    },
  };
}

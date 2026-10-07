// BeautIzzy — SyncRemoteGateway bound to the Supabase sync functions
//
// The whole operational write surface of the application is two RPCs
// (supabase/migrations/20260917120000_create_sync_push_functions.sql). No
// table is written directly: a parent row and its complete child set must
// land in ONE transaction, together with the version comparison, and only a
// database function can guarantee that.
//
// The whole operational READ surface is one RPC
// (supabase/migrations/20260917200000_create_sync_pull_function.sql), for the
// same reason turned around: parents and children read through separate table
// calls are separate snapshots, and a push landing between them would hand the
// device a Service with another revision's phases. Its answer is returned
// UNVALIDATED — `parseRemoteBusinessSnapshot` is the gate before SQLite.
//
// Uses the ONE publishable-key client with the signed-in owner's session.
// The functions are SECURITY INVOKER: owner-only RLS decides every row.
// Errors are reduced to stable codes here — a Postgres message may quote row
// values (client names, phone numbers) and must never travel further.

import type { PostgrestError } from '@supabase/supabase-js';

import {
  SyncRemoteError,
  type RemotePushRequest,
  type RemotePushResult,
  type SyncRemoteGateway,
} from '@/persistence/sync/remote-gateway';

import type { SourisSupabaseClient } from './client';
import type { Json } from './database-types';

export type SupabaseSyncApi = Pick<SourisSupabaseClient, 'rpc'>;

/** Exported for tests: PostgREST / Postgres error → stable sync failure. */
export function mapSyncPostgrestError(error: Pick<PostgrestError, 'code' | 'message'>): SyncRemoteError {
  const code = error.code ?? '';
  if (code === '') {
    // postgrest-js reports a failed fetch (no network) with an empty code.
    return new SyncRemoteError('NETWORK');
  }
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') {
    return new SyncRemoteError('FORBIDDEN', code);
  }
  // Data exceptions (22xxx) and integrity violations (23xxx): this aggregate only.
  if (/^2[23][0-9A-Z]{3}$/.test(code)) {
    return new SyncRemoteError('REJECTED', code);
  }
  if (/network request failed|failed to fetch|fetch failed/i.test(error.message)) {
    return new SyncRemoteError('NETWORK');
  }
  return new SyncRemoteError('UNKNOWN', /^[0-9A-Z]{5,8}$/.test(code) ? code : undefined);
}

function toPositiveInteger(value: unknown): number | undefined {
  // bigint columns arrive as JSON numbers; a string is tolerated, nothing else.
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

/** Exported for tests: jsonb result of `sync_push_aggregate` → validated push result. */
export function toRemotePushResult(data: unknown): RemotePushResult {
  if (typeof data !== 'object' || data === null) throw new SyncRemoteError('UNKNOWN', 'BADRESULT');
  const { status, sync_version: version } = data as Record<string, unknown>;
  const parsed = toPositiveInteger(version);
  switch (status) {
    case 'APPLIED':
      if (parsed === undefined || parsed < 1) throw new SyncRemoteError('UNKNOWN', 'BADRESULT');
      return { status: 'APPLIED', syncVersion: parsed };
    case 'CONFLICT':
      return { status: 'CONFLICT', remoteVersion: parsed };
    case 'ABSENT':
      return { status: 'ABSENT' };
    case 'FINANCIAL_CONFLICT': {
      const { appointment_id: appointmentId, expected_total_cents: expected, active_deposit_cents: active } =
        data as Record<string, unknown>;
      if (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0) {
        throw new SyncRemoteError('UNKNOWN', 'BADRESULT');
      }
      if (typeof active !== 'number' || !Number.isSafeInteger(active) || active < 0) {
        throw new SyncRemoteError('UNKNOWN', 'BADRESULT');
      }
      return {
        status: 'FINANCIAL_CONFLICT',
        appointmentId: typeof appointmentId === 'string' ? appointmentId : undefined,
        expectedTotalCents: expected,
        activeDepositTotalCents: active,
      };
    }
    default:
      throw new SyncRemoteError('UNKNOWN', 'BADRESULT');
  }
}

export function createSupabaseSyncGateway(client: SupabaseSyncApi): SyncRemoteGateway {
  return {
    async countBusinessAggregates(businessId: string): Promise<number> {
      const { data, error } = await client.rpc('sync_count_business_aggregates', {
        p_business_id: businessId,
      });
      if (error) throw mapSyncPostgrestError(error);
      const count = toPositiveInteger(data);
      if (count === undefined) throw new SyncRemoteError('UNKNOWN', 'BADRESULT');
      return count;
    },

    async pushAggregate(request: RemotePushRequest): Promise<RemotePushResult> {
      const { data, error } = await client.rpc('sync_push_aggregate', {
        p_business_id: request.businessId,
        p_aggregate_type: request.aggregateType,
        p_aggregate_id: request.aggregateId,
        p_operation: request.operation,
        p_expected_version: request.expectedVersion ?? null,
        // The payload interfaces are plain JSON values by construction.
        p_payload: (request.payload ?? null) as Json | null,
      });
      if (error) throw mapSyncPostgrestError(error);
      return toRemotePushResult(data);
    },

    async pullBusinessAggregates(businessId: string, since: Date | undefined): Promise<unknown> {
      const { data, error } = await client.rpc('sync_pull_business_aggregates', {
        p_business_id: businessId,
        p_since: since === undefined ? null : since.toISOString(),
      });
      if (error) throw mapSyncPostgrestError(error);
      return data;
    },
  };
}

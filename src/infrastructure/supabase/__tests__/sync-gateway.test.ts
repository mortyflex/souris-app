import { SyncRemoteError, type RemotePushRequest } from '@/persistence/sync/remote-gateway';

import {
  createSupabaseSyncGateway,
  mapSyncPostgrestError,
  toRemotePushResult,
  type SupabaseSyncApi,
} from '../sync-gateway';

const BUSINESS_ID = '8f5c2a1e-3b7d-4c9a-9e2f-1a2b3c4d5e6f';

function createClient(result: { data: unknown; error: unknown }) {
  const rpc = jest.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseSyncApi, rpc };
}

const request: RemotePushRequest = {
  businessId: BUSINESS_ID,
  aggregateType: 'PRODUCT',
  aggregateId: 'product-1',
  operation: 'UPSERT',
  expectedVersion: 3,
  payload: { name: 'Masque', brand: null, category: null, barcode: '0088', photo_path: null, price_cents: 99, stock_quantity: 2, active: true },
};

describe('mapSyncPostgrestError', () => {
  it('reduces every failure to a stable code and never keeps the server message', () => {
    const cases: readonly (readonly [string, string, string, string | undefined])[] = [
      ['', 'TypeError: Network request failed', 'NETWORK', undefined],
      ['42501', 'sync: not the owner of this Business', 'FORBIDDEN', '42501'],
      ['PGRST301', 'JWT expired', 'FORBIDDEN', 'PGRST301'],
      ['23503', 'Key (business_id, client_id)=(…, client-lea) is not present', 'REJECTED', '23503'],
      ['23514', 'Failing row contains (…, Léa, 06 12 34 56 78)', 'REJECTED', '23514'],
      ['22023', 'sync: unknown aggregate type', 'REJECTED', '22023'],
      ['PGRST202', 'Could not find the function public.sync_push_aggregate', 'UNKNOWN', 'PGRST202'],
      ['XX000', 'fetch failed', 'NETWORK', undefined],
    ];
    for (const [code, message, expected, detail] of cases) {
      const mapped = mapSyncPostgrestError({ code, message });
      expect([code, mapped.code, mapped.detail]).toEqual([code, expected, detail]);
      expect(mapped.message).not.toContain('Léa');
      expect(mapped.message).not.toContain('06 12');
    }
  });
});

describe('toRemotePushResult', () => {
  it('validates the jsonb answer', () => {
    expect(toRemotePushResult({ status: 'APPLIED', sync_version: 7 })).toEqual({ status: 'APPLIED', syncVersion: 7 });
    expect(toRemotePushResult({ status: 'APPLIED', sync_version: '12' })).toEqual({ status: 'APPLIED', syncVersion: 12 });
    expect(toRemotePushResult({ status: 'CONFLICT', sync_version: 4 })).toEqual({ status: 'CONFLICT', remoteVersion: 4 });
    expect(toRemotePushResult({ status: 'CONFLICT', sync_version: null })).toEqual({ status: 'CONFLICT', remoteVersion: undefined });
    expect(toRemotePushResult({ status: 'ABSENT' })).toEqual({ status: 'ABSENT' });
    // The remote refused a financial write (CLOUD_SYNC.md §21.2): both amounts are required.
    expect(
      toRemotePushResult({
        status: 'FINANCIAL_CONFLICT',
        appointment_id: 'appointment-lea',
        expected_total_cents: 6000,
        active_deposit_cents: 10000,
      }),
    ).toEqual({
      status: 'FINANCIAL_CONFLICT',
      appointmentId: 'appointment-lea',
      expectedTotalCents: 6000,
      activeDepositTotalCents: 10000,
    });
    expect(
      toRemotePushResult({ status: 'FINANCIAL_CONFLICT', expected_total_cents: 0, active_deposit_cents: 1 }),
    ).toMatchObject({ appointmentId: undefined });
    // The future entitlement refusal (CLOUD_SYNC.md §26): a structured, per-Business answer — never an error,
    // never a generic unknown; whatever detail the server adds later is not read.
    expect(toRemotePushResult({ status: 'ENTITLEMENT_REQUIRED' })).toEqual({ status: 'ENTITLEMENT_REQUIRED' });
    expect(toRemotePushResult({ status: 'ENTITLEMENT_REQUIRED', reason: 'EXPIRED', sync_version: 3 })).toEqual({
      status: 'ENTITLEMENT_REQUIRED',
    });
    for (const bad of [
      { status: 'FINANCIAL_CONFLICT' },
      { status: 'FINANCIAL_CONFLICT', expected_total_cents: 10, active_deposit_cents: -1 },
      { status: 'FINANCIAL_CONFLICT', expected_total_cents: '10', active_deposit_cents: 20 },
    ]) {
      expect(() => toRemotePushResult(bad)).toThrow(SyncRemoteError);
    }
    for (const bad of [null, 'APPLIED', { status: 'APPLIED' }, { status: 'APPLIED', sync_version: 0 }, { status: 'MERGED' }]) {
      expect(() => toRemotePushResult(bad)).toThrow(SyncRemoteError);
    }
  });
});

describe('createSupabaseSyncGateway', () => {
  it('pushes through the ONE rpc with the Business id, the expected version and the payload', async () => {
    const { client, rpc } = createClient({ data: { status: 'APPLIED', sync_version: 4 }, error: null });
    await expect(createSupabaseSyncGateway(client).pushAggregate(request)).resolves.toEqual({ status: 'APPLIED', syncVersion: 4 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('sync_push_aggregate', {
      p_business_id: BUSINESS_ID,
      p_aggregate_type: 'PRODUCT',
      p_aggregate_id: 'product-1',
      p_operation: 'UPSERT',
      p_expected_version: 3,
      p_payload: request.payload,
    });
  });

  it('sends explicit NULLs for a never-acknowledged DELETE', async () => {
    const { client, rpc } = createClient({ data: { status: 'ABSENT' }, error: null });
    await createSupabaseSyncGateway(client).pushAggregate({ ...request, operation: 'DELETE', expectedVersion: undefined, payload: undefined });
    expect(rpc).toHaveBeenCalledWith('sync_push_aggregate', expect.objectContaining({ p_expected_version: null, p_payload: null }));
  });

  it('counts the Business aggregates and refuses a malformed count', async () => {
    const ok = createClient({ data: 12, error: null });
    await expect(createSupabaseSyncGateway(ok.client).countBusinessAggregates(BUSINESS_ID)).resolves.toBe(12);
    expect(ok.rpc).toHaveBeenCalledWith('sync_count_business_aggregates', { p_business_id: BUSINESS_ID });

    const bad = createClient({ data: null, error: null });
    await expect(createSupabaseSyncGateway(bad.client).countBusinessAggregates(BUSINESS_ID)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('reads through the ONE pull rpc: NULL for the complete dataset, an ISO instant for an incremental read — and returns the answer unvalidated', async () => {
    const answer = { pulled_at: '2026-09-18T09:00:00.000Z', clients: [], services: [], products: [], appointments: [], sales: [] };
    const { client, rpc } = createClient({ data: answer, error: null });
    const gateway = createSupabaseSyncGateway(client);

    expect(await gateway.pullBusinessAggregates(BUSINESS_ID, undefined)).toBe(answer);
    expect(rpc).toHaveBeenLastCalledWith('sync_pull_business_aggregates', { p_business_id: BUSINESS_ID, p_since: null });

    await gateway.pullBusinessAggregates(BUSINESS_ID, new Date('2026-09-18T08:55:00.000Z'));
    expect(rpc).toHaveBeenLastCalledWith('sync_pull_business_aggregates', {
      p_business_id: BUSINESS_ID,
      p_since: '2026-09-18T08:55:00.000Z',
    });

    // Not deployed yet (PGRST202), not the owner, offline: stable codes, no server message.
    const missing = createClient({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(createSupabaseSyncGateway(missing.client).pullBusinessAggregates(BUSINESS_ID, undefined)).rejects.toMatchObject({ code: 'UNKNOWN', detail: 'PGRST202' });
    const forbidden = createClient({ data: null, error: { code: '42501', message: 'sync: not the owner of this Business' } });
    await expect(createSupabaseSyncGateway(forbidden.client).pullBusinessAggregates(BUSINESS_ID, undefined)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws stable failures', async () => {
    const offline = createClient({ data: null, error: { code: '', message: 'TypeError: Network request failed' } });
    await expect(createSupabaseSyncGateway(offline.client).pushAggregate(request)).rejects.toMatchObject({ code: 'NETWORK' });
    const forbidden = createClient({ data: null, error: { code: '42501', message: 'nope' } });
    await expect(createSupabaseSyncGateway(forbidden.client).countBusinessAggregates(BUSINESS_ID)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

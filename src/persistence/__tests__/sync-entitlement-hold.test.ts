// BeautIzzy — Cloud Sync × BeautIzzy Plus (Phase 6.5C, step 3): the server
// refuses a write for lack of a Plus entitlement (`ENTITLEMENT_REQUIRED`, a
// server behaviour to come, simulated by the fake remote). The entry stays
// exactly as it is, nothing is acknowledged, the Business goes on a bounded
// hold that survives a restart, the pull goes on, no retry loop hammers the
// server, the held writes resume in order once the hold is lifted, and
// nothing crosses Businesses (docs/architecture/CLOUD_SYNC.md §26).

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { clearPersistedDataForDevelopment } from '../development-reset';
import { readMetadata, writeMetadata } from '../metadata';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { insertClient, updateClient } from '../stores/clients';
import { insertProduct } from '../stores/products';
import { insertService, updateService } from '../stores/services';
import { approveInitialUpload } from '../sync/bootstrap';
import {
  clearSyncEntitlementHold,
  isSyncEntitlementHoldActive,
  liftSyncEntitlementHold,
  readSyncEntitlementHold,
  SYNC_ENTITLEMENT_HOLD_KEY,
  writeSyncEntitlementHold,
} from '../sync/entitlement-hold';
import { findSyncOutboxEntry, loadSyncOutbox } from '../sync/outbox';
import {
  createSyncPushWorker,
  hasEligiblePushWork,
  isForegroundSyncTickDue,
  isSyncRunDue,
  nextSyncAttemptAt,
} from '../sync/push-worker';
import { SyncRemoteError } from '../sync/remote-gateway';
import { loadSyncState, readAcknowledgedRemoteVersion } from '../sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '../testing/fake-sync-remote';
import { clientLea, createTestSeed, productSerum, REMOTE_BUSINESS_ID, remoteBusinessProfile, serviceCut } from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const OTHER_BUSINESS_ID = '0d9e8c7b-6a5f-4e4d-8c3b-2a1f0e9d8c7b';
const NOW = new Date('2026-10-26T09:00:00.000Z');
const MINUTE_MS = 60_000;

function context(db: SourisDatabase, remote: FakeSyncRemote, startAt: Date) {
  let current = startAt;
  const worker = createSyncPushWorker({ database: db, gateway: remote, now: () => current });
  return {
    worker,
    run: () => worker.run(REMOTE_BUSINESS_ID),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
    now: () => current,
  };
}

/** A Business that synchronizes (one Service went through the approved initial upload), entitled so far. */
async function openSyncedDevice() {
  const db = openTestDatabase();
  bootstrapPersistence(db, () => createTestSeed({ clients: [], services: [serviceCut], products: [], appointments: [] }));
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toMatchObject({ status: 'APPROVED' });
  const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
  const device = context(db, remote, NOW);
  expect(await device.run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', pushed: 1 });
  remote.clearRequests();
  return { db, remote, ...device };
}

const pending = (db: SourisDatabase) =>
  loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => ({
    type: entry.aggregateType,
    id: entry.aggregateId,
    operation: entry.operation,
    revision: entry.revision,
    attempts: entry.attemptCount,
    lastError: entry.lastError,
    nextAttemptAt: entry.nextAttemptAt,
  }));

const ack = (db: SourisDatabase, aggregateType: 'CLIENT' | 'SERVICE' | 'PRODUCT', aggregateId: string) =>
  readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, { aggregateType, aggregateId })?.remoteVersion;

describe('the hold record', () => {
  it('is stored for ONE Business, read for that Business only, and cleared without touching another Business’s hold', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    const hold = { businessId: REMOTE_BUSINESS_ID, refusals: 2, refusedAt: NOW, nextAttemptAt: new Date(NOW.getTime() + 2 * MINUTE_MS) };
    writeSyncEntitlementHold(db, hold);
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toEqual(hold);
    expect(readSyncEntitlementHold(db, OTHER_BUSINESS_ID)).toBeUndefined();
    expect(isSyncEntitlementHoldActive(db, REMOTE_BUSINESS_ID, NOW)).toBe(true);
    expect(isSyncEntitlementHoldActive(db, REMOTE_BUSINESS_ID, new Date(NOW.getTime() + 2 * MINUTE_MS - 1))).toBe(true);
    expect(isSyncEntitlementHoldActive(db, REMOTE_BUSINESS_ID, new Date(NOW.getTime() + 2 * MINUTE_MS))).toBe(false);
    expect(isSyncEntitlementHoldActive(db, OTHER_BUSINESS_ID, NOW)).toBe(false);

    clearSyncEntitlementHold(db, OTHER_BUSINESS_ID);
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toEqual(hold);
    clearSyncEntitlementHold(db, REMOTE_BUSINESS_ID);
    expect(readMetadata(db, SYNC_ENTITLEMENT_HOLD_KEY)).toBeUndefined();
    clearSyncEntitlementHold(db, REMOTE_BUSINESS_ID); // a no-op without a record
    expect(() => writeSyncEntitlementHold(db, { ...hold, refusals: 0 })).toThrow(RangeError);
  });

  it('reads a corrupt or malformed row as no hold, and clears it', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    for (const raw of ['{corrupt', '[]', 'null', JSON.stringify({ businessId: REMOTE_BUSINESS_ID, refusals: 'many' }), JSON.stringify({ businessId: REMOTE_BUSINESS_ID, refusals: 1, refusedAt: 'yesterday', nextAttemptAt: 'soon' })]) {
      writeMetadata(db, SYNC_ENTITLEMENT_HOLD_KEY, raw);
      expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBeUndefined();
      expect(isSyncEntitlementHoldActive(db, REMOTE_BUSINESS_ID, NOW)).toBe(false);
    }
    clearSyncEntitlementHold(db, REMOTE_BUSINESS_ID);
    expect(readMetadata(db, SYNC_ENTITLEMENT_HOLD_KEY)).toBeUndefined();
  });

  it('is cleared by the development reset, with the rest of the sync bookkeeping', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    writeSyncEntitlementHold(db, { businessId: REMOTE_BUSINESS_ID, refusals: 1, refusedAt: NOW, nextAttemptAt: NOW });
    clearPersistedDataForDevelopment(db);
    expect(readMetadata(db, SYNC_ENTITLEMENT_HOLD_KEY)).toBeUndefined();
  });
});

describe('the push worker under an entitlement refusal', () => {
  it('1. a normal push is untouched: applied, acknowledged, settled, no hold', async () => {
    const { db, remote, run } = await openSyncedDevice();
    insertClient(db, clientLea);
    expect(await run()).toMatchObject({ status: 'PUSHED', pushed: 1, failed: 0 });
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)?.syncVersion).toBe(1);
    expect(pending(db)).toEqual([]);
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBeUndefined();
  });

  it('2–6. a refused write: the entry stays with its payload, nothing acknowledged, the refusal and the backoff recorded, a hold written, no run-level failure', async () => {
    const { db, remote, run, now } = await openSyncedDevice();
    insertClient(db, clientLea);
    const localBefore = loadSnapshot(db);
    const entryBefore = findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id })!;
    remote.refuseEntitlement(true);

    const result = await run();
    const until = nextSyncAttemptAt(now(), 0);
    expect(result).toMatchObject({
      status: 'PUSHED',
      pushed: 0,
      failed: 0,
      conflicts: [],
      entitlementHold: { until, refused: { aggregateType: 'CLIENT', aggregateId: clientLea.id } },
    });
    expect(result.status === 'PUSHED' && result.stoppedBy).toBeUndefined();
    // ONE request, answered with the refusal; nothing was written remotely.
    expect(remote.requests).toHaveLength(1);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)).toBeUndefined();
    // The entry: same id, operation, revision, created instant; the refusal and its backoff recorded.
    const entry = findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id })!;
    expect(entry).toMatchObject({
      id: entryBefore.id,
      operation: 'UPSERT',
      revision: entryBefore.revision,
      createdAt: entryBefore.createdAt,
      attemptCount: 1,
      lastError: 'ENTITLEMENT_REQUIRED',
      nextAttemptAt: until,
    });
    // The local record is untouched, and nothing is acknowledged.
    expect(loadSnapshot(db)).toEqual(localBefore);
    expect(ack(db, 'CLIENT', clientLea.id)).toBeUndefined();
    expect(loadSyncState(db, REMOTE_BUSINESS_ID).map((state) => state.aggregateId)).toEqual([serviceCut.id]);
    // The hold: one refusal, next attempt after the bounded backoff.
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toEqual({ businessId: REMOTE_BUSINESS_ID, refusals: 1, refusedAt: now(), nextAttemptAt: until });
  });

  it('7. the pull proceeds in the same run as the refusal, and in every run under the hold', async () => {
    const { db, remote, run, advance } = await openSyncedDevice();
    insertClient(db, clientLea);
    remote.refuseEntitlement(true);
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-elsewhere', {
      name: 'Ailleurs',
      brand: null,
      category: null,
      barcode: null,
      price_cents: 1200,
      stock_quantity: 3,
      active: true,
      photo_path: null,
    });

    const refused = await run();
    expect(refused).toMatchObject({ entitlementHold: { refused: { aggregateId: clientLea.id } }, pull: { status: 'PULLED', applied: 1 } });
    expect(remote.pulls).toHaveLength(1);
    expect(loadSnapshot(db).products.map((product) => product.id)).toEqual(['product-elsewhere']);

    // Under the hold: no push request at all, the pull still runs.
    advance(10_000);
    const held = await run();
    expect(held).toMatchObject({ pushed: 0, entitlementHold: { until: nextSyncAttemptAt(NOW, 0) }, pull: { status: 'PULLED' } });
    expect(held.status === 'PUSHED' && held.entitlementHold?.refused).toBeUndefined();
    expect(remote.requests).toHaveLength(1);
    expect(remote.pulls).toHaveLength(2);
  });

  it('8. several pending entries: ONE request tells the whole story, the others are not sent and stay untouched; the order holds on recovery', async () => {
    const { db, remote, run, advance } = await openSyncedDevice();
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    insertClient(db, clientLea);
    updateService(db, { ...serviceCut, businessId: REMOTE_BUSINESS_ID, name: 'Coupe longue' });
    remote.refuseEntitlement(true);

    await run();
    expect(remote.requests.map((request) => request.aggregateType)).toEqual(['CLIENT']);
    expect(pending(db)).toEqual([
      expect.objectContaining({ type: 'PRODUCT', attempts: 0, lastError: undefined, nextAttemptAt: undefined }),
      expect.objectContaining({ type: 'CLIENT', attempts: 1, lastError: 'ENTITLEMENT_REQUIRED' }),
      expect.objectContaining({ type: 'SERVICE', attempts: 0, lastError: undefined, nextAttemptAt: undefined }),
    ]);

    // Plus is back and the hold lifted (as the runner does): everything goes, in dependency order, once.
    remote.refuseEntitlement(false);
    expect(liftSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBe(1);
    advance(1);
    expect(await run()).toMatchObject({ pushed: 3, failed: 0 });
    expect(remote.requests.map((request) => request.aggregateType)).toEqual(['CLIENT', 'CLIENT', 'SERVICE', 'PRODUCT']);
    expect(pending(db)).toEqual([]);
    expect([ack(db, 'CLIENT', clientLea.id), ack(db, 'SERVICE', serviceCut.id), ack(db, 'PRODUCT', productSerum.id)]).toEqual([1, 2, 1]);
  });

  it('9. repeated refusals: one request per elapsed backoff, growing 1, 2, 4 … 60 minutes — never one per tick', async () => {
    const { db, remote, run, advance, now } = await openSyncedDevice();
    insertClient(db, clientLea);
    remote.refuseEntitlement(true);

    const delaysMinutes: number[] = [];
    for (let refusal = 1; refusal <= 12; refusal += 1) {
      const before = remote.requests.length;
      await run();
      expect(remote.requests).toHaveLength(before + 1);
      const hold = readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)!;
      expect(hold.refusals).toBe(refusal);
      delaysMinutes.push((hold.nextAttemptAt.getTime() - now().getTime()) / MINUTE_MS);
      // Every tick before the backoff elapses sends nothing.
      advance(MINUTE_MS / 2);
      await run();
      await run();
      expect(remote.requests).toHaveLength(before + 1);
      expect(isSyncRunDue(db, REMOTE_BUSINESS_ID, now())).toBe(false);
      expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, now())).toBe(false);
      // …while the device still pulls on its tick.
      expect(isForegroundSyncTickDue(db, REMOTE_BUSINESS_ID, now())).toBe(true);
      advance(hold.nextAttemptAt.getTime() - now().getTime());
    }
    expect(delaysMinutes).toEqual([1, 2, 4, 8, 16, 32, 60, 60, 60, 60, 60, 60]);
    expect(pending(db)).toHaveLength(1);
    expect(findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id })).toMatchObject({ attemptCount: 12, revision: 1 });
  });

  it('9b. a local mutation during the hold is not sent before the hold elapses, then goes with the rest', async () => {
    const { db, remote, run, advance } = await openSyncedDevice();
    insertClient(db, clientLea);
    remote.refuseEntitlement(true);
    await run();
    expect(remote.requests).toHaveLength(1);

    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    advance(1000);
    await run();
    expect(remote.requests).toHaveLength(1);
    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, new Date(NOW.getTime() + 1000))).toBe(false);

    remote.refuseEntitlement(false);
    advance(MINUTE_MS);
    expect(await run()).toMatchObject({ pushed: 2 });
    expect(remote.requests.map((request) => request.aggregateType)).toEqual(['CLIENT', 'CLIENT', 'PRODUCT']);
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBeUndefined();
  });

  it('10. a restart respects the persisted hold, then retries once it elapsed', async () => {
    const synced = await openSyncedDevice();
    insertClient(synced.db, clientLea);
    synced.remote.refuseEntitlement(true);
    await synced.run();
    const hold = readSyncEntitlementHold(synced.db, REMOTE_BUSINESS_ID)!;

    // The app restarts 20 seconds later: a new worker over the same database.
    const restarted = context(synced.db, synced.remote, new Date(NOW.getTime() + 20_000));
    expect(await restarted.run()).toMatchObject({ pushed: 0, entitlementHold: { until: hold.nextAttemptAt } });
    expect(synced.remote.requests).toHaveLength(1);
    expect(pending(synced.db)).toHaveLength(1);

    restarted.advance(MINUTE_MS);
    await restarted.run();
    expect(synced.remote.requests).toHaveLength(2);
    expect(readSyncEntitlementHold(synced.db, REMOTE_BUSINESS_ID)?.refusals).toBe(2);
  });

  it('11. recovery: once the server accepts, the held writes land once each, acknowledged, and the hold is gone', async () => {
    const { db, remote, run, advance } = await openSyncedDevice();
    insertClient(db, clientLea);
    remote.refuseEntitlement(true);
    await run();
    remote.refuseEntitlement(false);
    advance(MINUTE_MS);
    expect(await run()).toMatchObject({ pushed: 1, failed: 0 });
    expect(remote.requests).toHaveLength(2);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)?.syncVersion).toBe(1);
    expect(ack(db, 'CLIENT', clientLea.id)).toBe(1);
    expect(pending(db)).toEqual([]);
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    // A further run sends nothing again: no duplicate write.
    await run();
    expect(remote.requests).toHaveLength(2);
  });

  it('12. the hold is lifted locally (Plus looks back) but the server still refuses: a fresh hold, nothing lost, no loop', async () => {
    const { db, remote, run, now } = await openSyncedDevice();
    insertClient(db, clientLea);
    remote.refuseEntitlement(true);
    await run();
    expect(liftSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBe(1);
    expect(findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id })).toMatchObject({ attemptCount: 1, lastError: 'ENTITLEMENT_REQUIRED' });

    expect(await run()).toMatchObject({ pushed: 0, entitlementHold: { refused: { aggregateId: clientLea.id } } });
    expect(remote.requests).toHaveLength(2);
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toEqual({ businessId: REMOTE_BUSINESS_ID, refusals: 1, refusedAt: now(), nextAttemptAt: nextSyncAttemptAt(now(), 0) });
    await run();
    expect(remote.requests).toHaveLength(2);
    expect(pending(db)).toHaveLength(1);
  });

  it('13. a hold recorded for another Business holds nothing here; the worker never runs for a Business the device is not bound to', async () => {
    const { db, remote, run, worker } = await openSyncedDevice();
    insertClient(db, clientLea);
    writeSyncEntitlementHold(db, { businessId: OTHER_BUSINESS_ID, refusals: 3, refusedAt: NOW, nextAttemptAt: new Date(NOW.getTime() + 60 * MINUTE_MS) });
    expect(await run()).toMatchObject({ pushed: 1 });
    expect(readSyncEntitlementHold(db, OTHER_BUSINESS_ID)).toMatchObject({ refusals: 3 });
    expect(await worker.run(OTHER_BUSINESS_ID)).toEqual({ status: 'SKIPPED', reason: 'BUSINESS_MISMATCH' });
    expect(remote.requests).toHaveLength(1);
  });

  it('14. the next answer of the server ends an elapsed hold; a conflict or a financial answer counts too', async () => {
    const { db, remote, run, advance } = await openSyncedDevice();
    insertClient(db, clientLea);
    remote.refuseEntitlement(true);
    await run();
    remote.refuseEntitlement(false);
    advance(MINUTE_MS);
    // The remote moved meanwhile: the push answers CONFLICT, which still proves the writes are not refused.
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id, {
      first_name: 'Léa',
      last_name: 'Ailleurs',
      phone: null,
      email: null,
      birthday: null,
      notes: null,
      photo_path: null,
      sms_marketing_consent: null,
      sms_marketing_consent_updated_at: null,
      sms_marketing_consent_source: null,
      archived_at: null,
    });
    const result = await run();
    expect(result).toMatchObject({ pushed: 0, conflicts: [expect.objectContaining({ aggregateId: clientLea.id })] });
    expect(result.status === 'PUSHED' && result.entitlementHold).toBeUndefined();
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBeUndefined();
  });

  it('15. authentication and permission failures keep their behaviour: FORBIDDEN stops the run, no hold, the entry stays eligible', async () => {
    const { db, remote, run } = await openSyncedDevice();
    insertClient(db, clientLea);
    remote.failNext(new SyncRemoteError('FORBIDDEN', '42501'));
    expect(await run()).toMatchObject({ status: 'PUSHED', pushed: 0, failed: 1, stoppedBy: 'FORBIDDEN' });
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    const forbidden = findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id })!;
    expect(forbidden.lastError).toBe('FORBIDDEN:42501');
    expect(forbidden.nextAttemptAt).toBeUndefined();
    expect(remote.pulls).toHaveLength(0);

    // A Business the signed-in user does not own is refused before anything else — the refusal of a stranger is never an entitlement hold.
    const foreign = createFakeSyncRemote([OTHER_BUSINESS_ID]);
    foreign.refuseEntitlement(true);
    const stranger = context(db, foreign, NOW);
    expect(await stranger.run()).toMatchObject({ status: 'PUSHED', pushed: 0, stoppedBy: 'FORBIDDEN' });
    expect(foreign.requests).toHaveLength(1);
    expect(readSyncEntitlementHold(db, REMOTE_BUSINESS_ID)).toBeUndefined();
  });

  it('16. enforcement disabled (the deployed server never refuses): nothing changes — no hold, no request held back', async () => {
    const { db, remote, run } = await openSyncedDevice();
    insertClient(db, clientLea);
    updateClient(db, { ...clientLea, firstName: 'Léa-bis' });
    expect(await run()).toMatchObject({ pushed: 1 });
    expect(remote.requests).toHaveLength(1);
    expect(readMetadata(db, SYNC_ENTITLEMENT_HOLD_KEY)).toBeUndefined();
    expect(pending(db)).toEqual([]);
  });

  it('a Service refused keeps the exact child set it will push later', async () => {
    const { db, remote, run, advance } = await openSyncedDevice();
    insertService(db, { ...serviceCut, id: 'service-new', businessId: REMOTE_BUSINESS_ID, name: 'Brushing' });
    remote.refuseEntitlement(true);
    await run();
    const refusedPayload = remote.requests[0]!.payload;
    remote.refuseEntitlement(false);
    advance(MINUTE_MS);
    await run();
    expect(remote.requests[1]!.payload).toEqual(refusedPayload);
    expect(remote.find(REMOTE_BUSINESS_ID, 'SERVICE', 'service-new')?.payload).toEqual(refusedPayload);
  });
});

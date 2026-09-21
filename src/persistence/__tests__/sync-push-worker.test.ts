// Souris — Cloud Sync V1C: bootstrap + incremental push through the real
// stores and a contract-faithful in-memory remote
// (docs/architecture/CLOUD_SYNC.md §10.8, §11, §15)

import type { Sale } from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { clearPersistedDataForDevelopment } from '../development-reset';
import {
  checkoutAppointment,
  deleteAppointment,
  insertAppointment,
  reorderAppointmentItems,
} from '../stores/appointments';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { writeMetadata } from '../metadata';
import { deleteClientPermanently, insertClient, updateClient } from '../stores/clients';
import { deleteProduct, insertProduct, setProductStock } from '../stores/products';
import { completeSale } from '../stores/sales';
import { insertService, updateService } from '../stores/services';
import {
  approveInitialUpload,
  readInitialUploadApproval,
  readSyncBootstrapRecord,
  SYNC_INITIAL_UPLOAD_APPROVAL_KEY,
} from '../sync/bootstrap';
import { countSyncOutboxRows, findSyncOutboxEntry, loadSyncOutbox } from '../sync/outbox';
import { createSyncPushWorker, hasEligiblePushWork, isSyncRunDue, nextSyncAttemptAt } from '../sync/push-worker';
import {
  SyncRemoteError,
  type RemoteAppointmentPayload,
  type RemoteClientPayload,
  type RemoteProductPayload,
  type RemoteSalePayload,
  type RemoteServicePayload,
} from '../sync/remote-gateway';
import { loadSyncState, readAcknowledgedRemoteVersion } from '../sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '../testing/fake-sync-remote';
import {
  appointmentLea,
  clientLea,
  createTestSeed,
  productMask,
  productSerum,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
  serviceColor,
  serviceCut,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const OTHER_BUSINESS_ID = '0d9e8c7b-6a5f-4e4d-8c3b-2a1f0e9d8c7b';
const NOW = new Date('2026-09-17T09:00:00.000Z');

const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

const walkInSale: Sale = {
  id: 'sale-walk-in',
  businessId: REMOTE_BUSINESS_ID,
  completedAt: new Date('2026-09-11T09:15:00.000Z'),
  payment: { paidAt: new Date('2026-09-11T09:15:00.000Z'), cardAmountCents: 0, cashAmountCents: 198 },
  items: [
    { id: 'sale-walk-in-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 0.99, quantity: 2 },
  ],
};

/** Seeded while unbound (no outbox entry), then bound: the pilot situation. */
function openPopulatedBoundDatabase(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  expect(countSyncOutboxRows(db)).toBe(0);
  return db;
}

/** The supervised pilot step: existing local data + the explicit approval for THIS Business. */
function openApprovedPopulatedDatabase(): SourisDatabase {
  const db = openPopulatedBoundDatabase();
  expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toMatchObject({ status: 'APPROVED' });
  return db;
}

function openEmptyBoundDatabase(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, emptySeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

function setup(db: SourisDatabase, remote: FakeSyncRemote = createFakeSyncRemote([REMOTE_BUSINESS_ID])) {
  let current = NOW;
  const worker = createSyncPushWorker({ database: db, gateway: remote, now: () => current });
  return {
    remote,
    worker,
    run: () => worker.run(REMOTE_BUSINESS_ID),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms);
    },
    now: () => current,
  };
}

/**
 * A Business that REALLY synchronized once — the only state in which pushes
 * are automatic: one baseline Service went through the approved initial
 * upload, so `sync_state` holds an acknowledged revision. The request log is
 * cleared so a test counts only what it does itself.
 */
async function openSyncedDatabase() {
  const db = openTestDatabase();
  bootstrapPersistence(db, () =>
    createTestSeed({ clients: [], services: [serviceCut], products: [], appointments: [] }),
  );
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toMatchObject({ status: 'APPROVED' });
  const context = setup(db);
  expect(await context.run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', initialUploadEnqueued: 1, pushed: 1 });
  context.remote.clearRequests();
  return { db, ...context };
}

function pending(db: SourisDatabase) {
  return loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => [
    entry.aggregateType,
    entry.aggregateId,
    entry.operation,
    entry.revision,
  ]);
}

function ack(db: SourisDatabase, aggregateType: 'CLIENT' | 'SERVICE' | 'APPOINTMENT' | 'PRODUCT' | 'SALE', aggregateId: string) {
  return readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, { aggregateType, aggregateId })?.remoteVersion;
}

describe('bootstrap — first sync of a bound Business', () => {
  it('a normal new account stays empty: nothing enqueued, nothing uploaded, EMPTY stored — and EMPTY licenses nothing later', async () => {
    const db = openEmptyBoundDatabase();
    const { remote, run } = setup(db);

    expect(await run()).toEqual({
      status: 'PUSHED',
      bootstrap: 'EMPTY',
      initialUploadEnqueued: 0,
      pushed: 0,
      failed: 0,
      conflicts: [],
    });
    expect(remote.requests).toEqual([]);
    expect(remote.list(REMOTE_BUSINESS_ID)).toEqual([]);
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY');

    // V1D: a stored EMPTY is asked again at every run (one count, nothing else) — the Business may
    // have been populated from another device meanwhile, which is a restore, not an empty account.
    expect(await run()).toMatchObject({ status: 'PUSHED', bootstrap: 'EMPTY', pushed: 0 });
    expect(remote.countCalls).toBe(2);
    expect(remote.pulls).toEqual([]); // nothing is pulled from a Business just counted empty

    // EMPTY is not an acknowledgement: the first local aggregate makes it stale (regression block below).
    insertClient(db, clientLea);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });
    expect(remote.countCalls).toBe(3);
    expect(remote.list(REMOTE_BUSINESS_ID)).toEqual([]);
  });

  it('APPROVED populated local + empty remote: every existing aggregate is enqueued once WITHOUT any fabricated acknowledgement; an interrupted upload resumes', async () => {
    const db = openApprovedPopulatedDatabase();
    const { remote, run } = setup(db);
    // Offline for the pushes only: the decision is taken, the upload is not pretended.
    remote.beforePush(() => {
      throw new SyncRemoteError('NETWORK');
    });

    const first = await run();
    expect(first).toMatchObject({ status: 'PUSHED', bootstrap: 'INITIAL_UPLOAD', initialUploadEnqueued: 6, pushed: 0, stoppedBy: 'NETWORK' });
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(pending(db)).toEqual([
      ['CLIENT', 'client-lea', 'UPSERT', 1],
      ['SERVICE', 'service-color', 'UPSERT', 1],
      ['SERVICE', 'service-cut', 'UPSERT', 1],
      ['PRODUCT', 'product-mask', 'UPSERT', 1],
      ['PRODUCT', 'product-serum', 'UPSERT', 1],
      ['APPOINTMENT', 'appointment-lea', 'UPSERT', 1],
    ]);

    // The approval was consumed by the enqueue it authorized; the stored decision carries on.
    expect(readInitialUploadApproval(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('INITIAL_UPLOAD');

    // Resumes after a relaunch (new worker, same database): no new approval, nothing enqueued twice.
    remote.beforePush(undefined);
    const second = await setup(db, remote).run();
    expect(second).toMatchObject({ status: 'PUSHED', bootstrap: 'INITIAL_UPLOAD', initialUploadEnqueued: 0, pushed: 6, failed: 0, conflicts: [] });
    expect(pending(db)).toEqual([]);
    expect(remote.list(REMOTE_BUSINESS_ID).map((row) => row.key).sort()).toEqual([
      'APPOINTMENT/appointment-lea',
      'CLIENT/client-lea',
      'PRODUCT/product-mask',
      'PRODUCT/product-serum',
      'SERVICE/service-color',
      'SERVICE/service-cut',
    ]);
    // Acknowledged versions are the ones the server returned.
    expect(loadSyncState(db, REMOTE_BUSINESS_ID).map((state) => state.remoteVersion)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(remote.countCalls).toBe(1);
    // The operational data was never touched.
    expect(loadSnapshot(db).clients).toEqual([clientLea]);
  });

  it('an entry already pending before the first sync keeps its revision; the initial upload only adds the missing ones', async () => {
    const db = openApprovedPopulatedDatabase();
    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    updateClient(db, { ...clientLea, firstName: 'Léa-Rose' });
    expect(pending(db)).toEqual([['CLIENT', 'client-lea', 'UPSERT', 2]]);

    const { remote, run } = setup(db);
    expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', initialUploadEnqueued: 5, pushed: 6 });
    expect((remote.find(REMOTE_BUSINESS_ID, 'CLIENT', 'client-lea')?.payload as RemoteClientPayload).first_name).toBe('Léa-Rose');
  });

  it('local empty + remote populated: STOP (restore needs its approval) — nothing pushed or pulled, re-evaluated on the next run', async () => {
    const db = openEmptyBoundDatabase();
    const { remote, run } = setup(db);
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', 'client-remote', {
      first_name: 'Zoé', last_name: null, phone: null, email: null, birthday: null, notes: null, archived_at: null,
    });

    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED');
    expect(remote.pulls).toEqual([]);

    // Data created locally meanwhile is NOT pushed: both sides are now populated.
    insertClient(db, clientLea);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RECONCILIATION_REQUIRED' });
    expect(remote.requests).toEqual([]);
    expect(pending(db)).toEqual([['CLIENT', 'client-lea', 'UPSERT', 1]]);
    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, NOW)).toBe(false);
    expect(isSyncRunDue(db, REMOTE_BUSINESS_ID, NOW)).toBe(false); // no run resolves a reconciliation
  });

  it('local populated + remote populated without known sync state: STOP — explicit reconciliation, remote untouched', async () => {
    const db = openPopulatedBoundDatabase();
    const { remote, run } = setup(db);
    const version = remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id, {
      first_name: 'Test', last_name: null, phone: null, email: null, birthday: null, notes: null, archived_at: null,
    });

    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RECONCILIATION_REQUIRED' });
    expect(remote.requests).toEqual([]);
    expect(countSyncOutboxRows(db)).toBe(0);
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)).toMatchObject({ syncVersion: version });
  });

  it('cannot decide while offline: FAILED, nothing stored, nothing enqueued, approval kept; decides on the next run', async () => {
    const db = openApprovedPopulatedDatabase();
    const { remote, run } = setup(db);
    remote.failNext(new SyncRemoteError('NETWORK'));

    expect(await run()).toEqual({ status: 'FAILED', reason: 'NETWORK' });
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(countSyncOutboxRows(db)).toBe(0);
    expect(readInitialUploadApproval(db, REMOTE_BUSINESS_ID)?.approvedAt).toEqual(NOW);

    expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', pushed: 6 });
  });

  it('a decision stored for another Business id is never inherited', async () => {
    const db = openEmptyBoundDatabase();
    db.runSync('INSERT INTO souris_metadata (key, value) VALUES (?, ?)', [
      'sync_bootstrap',
      JSON.stringify({ businessId: OTHER_BUSINESS_ID, decision: 'EMPTY', decidedAt: NOW.toISOString() }),
    ]);
    const { remote, run } = setup(db);
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-remote', {
      name: 'x', brand: null, category: null, barcode: null, price_cents: 1, stock_quantity: 0, active: true,
    });
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
  });

  it('the development reset clears the decision together with the sync bookkeeping', async () => {
    const db = openApprovedPopulatedDatabase();
    const { run } = setup(db);
    await run();
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('INITIAL_UPLOAD');

    clearPersistedDataForDevelopment(db);
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
  });

  it('the development reset clears a pending approval: reseeded fixtures are never covered by it', async () => {
    const db = openApprovedPopulatedDatabase();
    clearPersistedDataForDevelopment(db);
    expect(readInitialUploadApproval(db, REMOTE_BUSINESS_ID)).toBeUndefined();

    // What the reset does next: reseed (development fixtures) under the bound Business.
    bootstrapPersistence(db, createTestSeed);
    const { remote, run } = setup(db);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });
    expect(remote.requests).toEqual([]);
  });
});

describe('initial upload — never automatic, one explicit Business-scoped approval', () => {
  it('populated local + empty remote does NOTHING before approval: classified, not enqueued, not pushed — run after run', async () => {
    const db = openPopulatedBoundDatabase();
    const { remote, run } = setup(db);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });
    }
    expect(remote.requests).toEqual([]);
    expect(remote.list(REMOTE_BUSINESS_ID)).toEqual([]);
    expect(countSyncOutboxRows(db)).toBe(0);
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('INITIAL_UPLOAD_REQUIRES_APPROVAL');
    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, NOW)).toBe(false);

    // A mutation made meanwhile is recorded locally as usual, and is not pushed either.
    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });
    expect(remote.requests).toEqual([]);
    expect(pending(db)).toEqual([['CLIENT', 'client-lea', 'UPSERT', 1]]);
    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, NOW)).toBe(false);
  });

  it('approving records the approval only — nothing is enqueued or sent until the next run classifies again', async () => {
    const db = openPopulatedBoundDatabase();
    const { remote, run } = setup(db);
    await run();

    expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toEqual({
      status: 'APPROVED',
      approval: { businessId: REMOTE_BUSINESS_ID, approvedAt: NOW },
    });
    expect(countSyncOutboxRows(db)).toBe(0);
    expect(remote.requests).toEqual([]);

    expect(await run()).toMatchObject({ status: 'PUSHED', bootstrap: 'INITIAL_UPLOAD', initialUploadEnqueued: 6, pushed: 6 });
  });

  it('an approval for Business A cannot authorize Business B', async () => {
    // The API refuses any Business the database is not bound to…
    const db = openPopulatedBoundDatabase();
    expect(approveInitialUpload(db, OTHER_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'BUSINESS_MISMATCH' });
    expect(readInitialUploadApproval(db, OTHER_BUSINESS_ID)).toBeUndefined();

    const unbound = openTestDatabase();
    bootstrapPersistence(unbound, createTestSeed);
    expect(approveInitialUpload(unbound, REMOTE_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'NOT_BOUND' });

    // …and an approval record that names another Business (left over, copied, forged) authorizes nothing.
    writeMetadata(
      db,
      SYNC_INITIAL_UPLOAD_APPROVAL_KEY,
      JSON.stringify({ businessId: OTHER_BUSINESS_ID, approvedAt: NOW.toISOString() }),
    );
    expect(readInitialUploadApproval(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    const { remote, run } = setup(db, createFakeSyncRemote([REMOTE_BUSINESS_ID, OTHER_BUSINESS_ID]));
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });
    expect(remote.requests).toEqual([]);
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('the approval survives a restart', async () => {
    const db = openApprovedPopulatedDatabase();

    // Relaunch: migrate + seed-once + hydrate run again on the same file, a new worker is created.
    bootstrapPersistence(db, createTestSeed);
    expect(readInitialUploadApproval(db, REMOTE_BUSINESS_ID)).toEqual({ businessId: REMOTE_BUSINESS_ID, approvedAt: NOW });

    const { remote, run } = setup(db);
    expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', initialUploadEnqueued: 6, pushed: 6 });
    expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6);
  });

  it('the approval queues the initial aggregates ONCE: it is consumed, and cannot be given again once sync is running', async () => {
    const db = openApprovedPopulatedDatabase();
    const { remote, run } = setup(db);
    expect(await run()).toMatchObject({ initialUploadEnqueued: 6, pushed: 6 });
    expect(readInitialUploadApproval(db, REMOTE_BUSINESS_ID)).toBeUndefined();

    expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'NOT_REQUIRED' });
    expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', initialUploadEnqueued: 0, pushed: 0 });
    expect(remote.requests).toHaveLength(6);
    expect(remote.countCalls).toBe(1);
  });

  it('an approval never overrides a populated remote: reconciliation stays blocked', async () => {
    const db = openApprovedPopulatedDatabase();
    const { remote, run } = setup(db);
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-remote', {
      name: 'x', brand: null, category: null, barcode: null, price_cents: 1, stock_quantity: 0, active: true,
    });

    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RECONCILIATION_REQUIRED' });
    expect(remote.requests).toEqual([]);
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('already-synchronized Businesses keep pushing automatically — no approval involved', async () => {
    const db = openApprovedPopulatedDatabase();
    const { remote, run } = setup(db);
    await run();

    // Normal incremental push after the initial upload.
    updateClient(db, { ...clientLea, phone: '07 00 00 00 00' });
    expect(await run()).toMatchObject({ status: 'PUSHED', pushed: 1 });

    // Even if the stored decision were lost, acknowledged state means "already synchronized", not "initial upload".
    db.runSync('DELETE FROM souris_metadata WHERE key = ?', ['sync_bootstrap']);
    updateClient(db, { ...clientLea, phone: '07 11 11 11 11' });
    expect(await run()).toMatchObject({ status: 'PUSHED', bootstrap: 'ALREADY_SYNCED', initialUploadEnqueued: 0, pushed: 1 });
    expect((remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)?.payload as RemoteClientPayload).phone).toBe('07 11 11 11 11');
    expect(readInitialUploadApproval(db, REMOTE_BUSINESS_ID)).toBeUndefined();
  });
});

describe('EMPTY is not a synchronization acknowledgement (E2E regression)', () => {
  it('the exact real sequence: EMPTY → create Client / Service / Product → run is BLOCKED, remote stays empty → approve → run uploads the 3', async () => {
    // 1–2. fresh local + empty remote → EMPTY
    const db = openEmptyBoundDatabase();
    const { remote, run } = setup(db);
    expect(await run()).toMatchObject({ status: 'PUSHED', bootstrap: 'EMPTY', pushed: 0 });
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY');

    // 3–4. the user creates one Client, one Service, one Product → outbox = 3
    insertClient(db, clientLea);
    insertService(db, { ...serviceCut, businessId: REMOTE_BUSINESS_ID });
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    const three = [
      ['CLIENT', 'client-lea', 'UPSERT', 1],
      ['SERVICE', 'service-cut', 'UPSERT', 1],
      ['PRODUCT', 'product-serum', 'UPSERT', 1],
    ];
    expect(pending(db)).toEqual(three);
    // A pending outbox is not proof of anything: the periodic check stays silent.
    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, NOW)).toBe(false);

    // 5–7. run again → BLOCKED, remote COMPLETELY empty, nothing acknowledged, outbox intact — run after run
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });
    }
    expect(remote.requests).toEqual([]);
    expect(remote.list(REMOTE_BUSINESS_ID)).toEqual([]);
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(pending(db)).toEqual(three);
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('INITIAL_UPLOAD_REQUIRES_APPROVAL');

    // 8–10. explicit approval → run → the remote receives exactly the 3 aggregates
    expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toMatchObject({ status: 'APPROVED' });
    expect(remote.requests).toEqual([]);
    expect(await run()).toMatchObject({ status: 'PUSHED', bootstrap: 'INITIAL_UPLOAD', initialUploadEnqueued: 0, pushed: 3, failed: 0, conflicts: [] });
    expect(remote.list(REMOTE_BUSINESS_ID).map((row) => row.key).sort()).toEqual([
      'CLIENT/client-lea',
      'PRODUCT/product-serum',
      'SERVICE/service-cut',
    ]);
    expect(pending(db)).toEqual([]);

    // One-time: consumed; and from here — real acknowledged state — incremental pushes are automatic.
    expect(readInitialUploadApproval(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'NOT_REQUIRED' });
    updateClient(db, { ...clientLea, phone: '07 00 00 00 00' });
    expect(await run()).toMatchObject({ status: 'PUSHED', pushed: 1 });
    expect(ack(db, 'CLIENT', clientLea.id)).toBe(2);
  });

  it('EMPTY survives a restart while the device is still empty: re-counted (V1D), still EMPTY, nothing uploaded', async () => {
    const db = openEmptyBoundDatabase();
    const first = setup(db);
    expect(await first.run()).toMatchObject({ bootstrap: 'EMPTY' });

    bootstrapPersistence(db, emptySeed); // relaunch: migrate + seed-once + hydrate
    const { run } = setup(db, first.remote); // a new worker on the same database
    expect(await run()).toEqual({ status: 'PUSHED', bootstrap: 'EMPTY', initialUploadEnqueued: 0, pushed: 0, failed: 0, conflicts: [] });
    expect(first.remote.countCalls).toBe(2); // one count per explicit run — see the V1D restore tests
    expect(first.remote.requests).toEqual([]);
    expect(first.remote.pulls).toEqual([]);
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY');
    // Nothing to upload, so nothing to approve either.
    expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'NOT_REQUIRED' });
  });

  it('EMPTY → the first local mutation requires the approval, across a restart too; a stale EMPTY does not refuse it', async () => {
    const db = openEmptyBoundDatabase();
    const first = setup(db);
    await first.run();

    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    bootstrapPersistence(db, emptySeed);
    const { remote, run } = setup(db, first.remote);
    // Nothing may be PUSHED under a stale EMPTY — but a run is due: the periodic check re-classifies (V1D.1).
    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, NOW)).toBe(false);
    expect(isSyncRunDue(db, REMOTE_BUSINESS_ID, NOW)).toBe(true);

    // The stored decision still reads EMPTY, but it is stale: approving is allowed, pushing is not.
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('EMPTY');
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });
    expect(remote.requests).toEqual([]);

    // Business-scoped as ever.
    expect(approveInitialUpload(db, OTHER_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'BUSINESS_MISMATCH' });
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });

    expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toMatchObject({ status: 'APPROVED' });
    expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', pushed: 1 });
    expect(remote.list(REMOTE_BUSINESS_ID).map((row) => row.key)).toEqual(['PRODUCT/product-serum']);
  });

  it('a stale EMPTY is re-classified against the REAL remote: populated meanwhile → reconciliation, nothing pushed', async () => {
    const db = openEmptyBoundDatabase();
    const { remote, run } = setup(db);
    await run();

    insertClient(db, clientLea);
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-remote', {
      name: 'x', brand: null, category: null, barcode: null, price_cents: 1, stock_quantity: 0, active: true,
    });

    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RECONCILIATION_REQUIRED' });
    expect(remote.requests).toEqual([]);
    expect(pending(db)).toEqual([['CLIENT', 'client-lea', 'UPSERT', 1]]);
  });

  it('EMPTY never uploads data, even for an aggregate that appears DURING the run', async () => {
    const db = openEmptyBoundDatabase();
    const { remote, run } = setup(db);
    await run();
    // Two created-then-deleted aggregates: local tables empty again, two DELETE entries.
    insertClient(db, clientLea);
    deleteClientPermanently(db, clientLea.id);
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    deleteProduct(db, productSerum.id);

    // While the first (CLIENT) request is in flight, the Product is recreated with the same id.
    remote.beforePush(() => {
      remote.beforePush(undefined);
      insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    });
    expect(await run()).toMatchObject({ status: 'PUSHED', bootstrap: 'EMPTY', pushed: 1 });

    expect(remote.requests.map((request) => [request.aggregateType, request.operation])).toEqual([['CLIENT', 'DELETE']]);
    expect(remote.list(REMOTE_BUSINESS_ID)).toEqual([]);
    expect(pending(db)).toEqual([['PRODUCT', 'product-serum', 'UPSERT', 3]]);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });
    expect(remote.list(REMOTE_BUSINESS_ID)).toEqual([]);
  });

  it('ALREADY_SYNCED is trusted only while acknowledged state really exists', async () => {
    const db = openPopulatedBoundDatabase();
    db.runSync('INSERT INTO souris_metadata (key, value) VALUES (?, ?)', [
      'sync_bootstrap',
      JSON.stringify({ businessId: REMOTE_BUSINESS_ID, decision: 'ALREADY_SYNCED', decidedAt: NOW.toISOString() }),
    ]);
    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    const { remote, run } = setup(db);

    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, NOW)).toBe(false);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' });
    expect(remote.requests).toEqual([]);
  });

  it('a Business with real acknowledged state keeps pushing new aggregates automatically', async () => {
    const { db, remote, run } = await openSyncedDatabase();

    insertClient(db, clientLea);
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, NOW)).toBe(true);
    expect(await run()).toMatchObject({ status: 'PUSHED', bootstrap: 'INITIAL_UPLOAD', pushed: 2, conflicts: [] });
    expect(remote.countCalls).toBe(1);
    expect(readInitialUploadApproval(db, REMOTE_BUSINESS_ID)).toBeUndefined();
  });
});

describe('guards — never push unscoped data', () => {
  it('skips an unbound database, a Business mismatch, a non-UUID id, and a concurrent run', async () => {
    const unbound = openTestDatabase();
    bootstrapPersistence(unbound, createTestSeed);
    const unboundSetup = setup(unbound);
    expect(await unboundSetup.run()).toEqual({ status: 'SKIPPED', reason: 'NOT_BOUND' });

    const db = openApprovedPopulatedDatabase();
    const { remote, worker, run } = setup(db, createFakeSyncRemote([REMOTE_BUSINESS_ID, OTHER_BUSINESS_ID]));
    expect(await worker.run(OTHER_BUSINESS_ID)).toEqual({ status: 'SKIPPED', reason: 'BUSINESS_MISMATCH' });
    expect(await worker.run('fixture-business')).toEqual({ status: 'SKIPPED', reason: 'INVALID_BUSINESS_ID' });

    const [first, second] = await Promise.all([run(), run()]);
    expect(first.status).toBe('PUSHED');
    expect(second).toEqual({ status: 'SKIPPED', reason: 'ALREADY_RUNNING' });

    expect(unboundSetup.remote.requests).toEqual([]);
    expect(remote.requests.every((request) => request.businessId === REMOTE_BUSINESS_ID)).toBe(true);
    expect(remote.list(OTHER_BUSINESS_ID)).toEqual([]);
  });

  it('Business isolation: a Business the signed-in user does not own is refused and the run stops', async () => {
    const db = openPopulatedBoundDatabase();
    const { remote, run } = setup(db, createFakeSyncRemote([OTHER_BUSINESS_ID]));

    expect(await run()).toEqual({ status: 'FAILED', reason: 'FORBIDDEN' });
    expect(remote.requests).toEqual([]);
    expect(remote.list(OTHER_BUSINESS_ID)).toEqual([]);
  });

  it('never pushes a local row stamped with another Business id — and never mistakes it for a deletion', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    db.runSync('UPDATE products SET business_id = ? WHERE id = ?', ['fixture-business', productSerum.id]);

    expect(await run()).toMatchObject({ pushed: 0, failed: 1 });
    expect(remote.requests).toEqual([]);
    expect(findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'PRODUCT', aggregateId: productSerum.id }))
      .toMatchObject({ operation: 'UPSERT', attemptCount: 1, lastError: 'LOCAL_INVALID' });
  });
});

describe('incremental push — current aggregate state', () => {
  async function synced() {
    const db = openApprovedPopulatedDatabase();
    const context = setup(db);
    await context.run();
    expect(pending(db)).toEqual([]);
    return { db, ...context };
  }

  it('uploads the CURRENT aggregate with its complete ordered child set, stable ids, and snapshots', async () => {
    const { db, remote, run } = await synced();

    const service = remote.find(REMOTE_BUSINESS_ID, 'SERVICE', serviceColor.id)?.payload as RemoteServicePayload;
    expect(service).toEqual({
      name: 'Coloration',
      type: 'TECHNIQUE',
      price_cents: 9500,
      active: true,
      phases: [
        { id: 'color-application', position: 0, name: 'Application', duration_minutes: 15, requires_staff: true },
        { id: 'color-processing', position: 1, name: 'Temps de pose', duration_minutes: 35, requires_staff: false },
        { id: 'color-rinse', position: 2, name: 'Rinçage', duration_minutes: 25, requires_staff: true },
      ],
    });

    const appointment = remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)?.payload as RemoteAppointmentPayload;
    expect(appointment).toMatchObject({
      client_id: 'client-lea',
      staff_member_id: 'staff-amelie',
      start_at: appointmentLea.startAt.toISOString(),
      status: 'SCHEDULED',
      notes: 'Racines uniquement',
      paid_at: null,
      card_amount_cents: null,
      cash_amount_cents: null,
    });
    expect(appointment.items.map((item) => [item.id, item.item_order, item.service_option_id, item.price_cents, item.phases.map((phase) => phase.id)])).toEqual([
      ['appointment-lea-item-0', 0, null, 9500, ['color-application', 'color-processing', 'color-rinse']],
      ['appointment-lea-item-1', 1, 'option-long', 4000, ['cut']],
    ]);

    // A catalog edit does not rewrite the Appointment snapshot, and a reorder is pushed as the new child order.
    updateService(db, { ...serviceColor, name: 'Couleur', price: 120, phases: [serviceColor.phases[1]!, serviceColor.phases[0]!] });
    reorderAppointmentItems(db, appointmentLea.id, ['appointment-lea-item-1', 'appointment-lea-item-0']);
    expect(await run()).toMatchObject({ pushed: 2, failed: 0, conflicts: [] });

    const edited = remote.find(REMOTE_BUSINESS_ID, 'SERVICE', serviceColor.id);
    expect(edited?.syncVersion).toBe(2);
    expect((edited?.payload as RemoteServicePayload).phases.map((phase) => [phase.id, phase.position])).toEqual([
      ['color-processing', 0],
      ['color-application', 1],
    ]);
    const reordered = remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)?.payload as RemoteAppointmentPayload;
    expect(reordered.items.map((item) => [item.id, item.item_order, item.service_name, item.price_cents])).toEqual([
      ['appointment-lea-item-1', 0, 'Coupe', 4000],
      ['appointment-lea-item-0', 1, 'Coloration', 9500],
    ]);
    expect(ack(db, 'SERVICE', serviceColor.id)).toBe(2);
  });

  it('cents remain exact and the device-local image path is never uploaded', async () => {
    const { db, remote, run } = await synced();
    insertProduct(db, { ...productSerum, id: 'product-cents', businessId: REMOTE_BUSINESS_ID, price: 0.29, stockQuantity: 3 });
    completeSale(db, walkInSale, [{ productId: productMask.id, quantity: 2 }]);
    checkoutAppointment(db, appointmentLea.id, {
      paidAt: new Date('2026-09-11T10:00:00.000Z'),
      cardAmountCents: 13_499,
      cashAmountCents: 1,
    });
    await run();

    const product = remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-cents')?.payload as RemoteProductPayload;
    expect(product.price_cents).toBe(29);
    const mask = remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', productMask.id)?.payload as RemoteProductPayload;
    expect(mask).toEqual({
      name: 'Masque réparateur', brand: 'Redken', category: 'hair-care', barcode: '00884486453280',
      price_cents: 5000, stock_quantity: 3, active: true,
    });
    expect(JSON.stringify(remote.requests)).not.toContain('file://');

    const sale = remote.find(REMOTE_BUSINESS_ID, 'SALE', walkInSale.id)?.payload as RemoteSalePayload;
    expect(sale).toEqual({
      client_id: null,
      appointment_id: null,
      completed_at: '2026-09-11T09:15:00.000Z',
      paid_at: '2026-09-11T09:15:00.000Z',
      card_amount_cents: 0,
      cash_amount_cents: 198,
      items: [{ id: 'sale-walk-in-item-0', position: 0, product_id: productMask.id, product_name: 'Masque réparateur', unit_price_cents: 99, quantity: 2 }],
    });

    const appointment = remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)?.payload as RemoteAppointmentPayload;
    expect([appointment.status, appointment.paid_at, appointment.card_amount_cents, appointment.cash_amount_cents]).toEqual([
      'COMPLETED', '2026-09-11T10:00:00.000Z', 13_499, 1,
    ]);
    for (const request of remote.requests) {
      for (const match of JSON.stringify(request.payload ?? {}).matchAll(/"[a-z_]*cents":(-?[0-9.e+]+)/g)) {
        expect(Number.isInteger(Number(match[1]))).toBe(true);
      }
    }
  });

  it('pushes in dependency order so remote foreign keys hold: Client before Appointment before linked Sale', async () => {
    const { db, remote, run } = await openSyncedDatabase();

    // Local creation order is the WORST one for the remote foreign keys.
    const { payment: _standalonePayment, ...unpaidSale } = walkInSale;
    const sale: Sale = { ...unpaidSale, id: 'sale-linked', clientId: clientLea.id, appointmentId: appointmentLea.id };
    insertProduct(db, { ...productMask, businessId: REMOTE_BUSINESS_ID });
    completeSale(db, sale, []);
    insertAppointment(db, { ...appointmentLea, businessId: REMOTE_BUSINESS_ID });
    insertClient(db, clientLea);

    expect(await run()).toMatchObject({ pushed: 4, failed: 0 });
    expect(remote.requests.map((request) => request.aggregateType)).toEqual(['CLIENT', 'PRODUCT', 'APPOINTMENT', 'SALE']);
  });
});

describe('acknowledgement, revisions and retries', () => {
  it('persists the server-returned version and sends it back as the expected version', async () => {
    const { db, remote, run, now } = await openSyncedDatabase();

    insertClient(db, clientLea);
    await run();
    expect(loadSyncState(db, REMOTE_BUSINESS_ID).filter((state) => state.aggregateType === 'CLIENT')).toEqual([
      { businessId: REMOTE_BUSINESS_ID, aggregateType: 'CLIENT', aggregateId: clientLea.id, remoteVersion: 1, lastSyncedAt: now() },
    ]);

    updateClient(db, { ...clientLea, phone: '07 00 00 00 00' });
    await run();
    expect(remote.requests.map((request) => request.expectedVersion)).toEqual([undefined, 1]);
    expect(ack(db, 'CLIENT', clientLea.id)).toBe(2);
    expect(pending(db)).toEqual([]);
  });

  it('a local mutation DURING the upload keeps the newer entry pending; the acknowledged version still advances', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertClient(db, clientLea);

    remote.beforePush(() => {
      remote.beforePush(undefined);
      updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    });
    expect(await run()).toMatchObject({ pushed: 1 });

    // The remote holds the state that was read BEFORE the edit; the entry survived at its new revision.
    expect((remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)?.payload as RemoteClientPayload).first_name).toBe('Léa');
    expect(pending(db)).toEqual([['CLIENT', 'client-lea', 'UPSERT', 2]]);
    expect(ack(db, 'CLIENT', clientLea.id)).toBe(1);

    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });
    expect((remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)?.payload as RemoteClientPayload).first_name).toBe('Léa-Marie');
    expect(ack(db, 'CLIENT', clientLea.id)).toBe(2);
    expect(pending(db)).toEqual([]);
  });

  it('offline: the entry stays pending and eligible, the run stops at once, local data is untouched', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertClient(db, clientLea);
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    remote.failNext(new SyncRemoteError('NETWORK'));

    expect(await run()).toMatchObject({ pushed: 0, failed: 1, stoppedBy: 'NETWORK' });
    expect(remote.requests).toHaveLength(1);
    const entry = findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id });
    expect(entry).toMatchObject({ attemptCount: 1, lastError: 'NETWORK' });
    expect(entry?.nextAttemptAt).toBeUndefined();
    expect(loadSnapshot(db).clients).toEqual([clientLea]);

    expect(await run()).toMatchObject({ pushed: 2, failed: 0 });
    expect(pending(db)).toEqual([]);
  });

  it('a lost acknowledgement is retried idempotently: no duplicate, no conflict, no extra remote revision', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertClient(db, clientLea);
    remote.loseNextResponse();

    expect(await run()).toMatchObject({ pushed: 0, failed: 1, stoppedBy: 'NETWORK' });
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)?.syncVersion).toBe(1);
    expect(ack(db, 'CLIENT', clientLea.id)).toBeUndefined();

    expect(await run()).toMatchObject({ pushed: 1, failed: 0, conflicts: [] });
    expect(remote.list(REMOTE_BUSINESS_ID).filter((row) => row.key.startsWith('CLIENT/'))).toHaveLength(1);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)?.syncVersion).toBe(1);
    expect(ack(db, 'CLIENT', clientLea.id)).toBe(1);
    expect(pending(db)).toEqual([]);
  });

  it('a rejected aggregate backs off (bounded) with a code-only error while the others continue', async () => {
    const { db, remote, run, advance, now } = await openSyncedDatabase();
    insertClient(db, clientLea);
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    remote.failNext(new SyncRemoteError('REJECTED', '23514'));

    expect(await run()).toMatchObject({ pushed: 1, failed: 1 });
    const entry = findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id });
    expect(entry).toMatchObject({ attemptCount: 1, lastError: 'REJECTED:23514' });
    expect(entry?.nextAttemptAt).toEqual(new Date(now().getTime() + 60_000));
    expect(entry?.lastError).not.toContain('Léa');

    // Not eligible before the backoff elapses: no request at all.
    const before = remote.requests.length;
    expect(await run()).toMatchObject({ pushed: 0, failed: 0 });
    expect(remote.requests).toHaveLength(before);
    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, now())).toBe(false);
    expect(isSyncRunDue(db, REMOTE_BUSINESS_ID, now())).toBe(false); // a backing-off device never polls

    advance(60_000);
    expect(hasEligiblePushWork(db, REMOTE_BUSINESS_ID, now())).toBe(true);
    expect(isSyncRunDue(db, REMOTE_BUSINESS_ID, now())).toBe(true);
    expect(await run()).toMatchObject({ pushed: 1, failed: 0 });

    expect(nextSyncAttemptAt(NOW, 3).getTime() - NOW.getTime()).toBe(8 * 60_000);
    expect(nextSyncAttemptAt(NOW, 50).getTime() - NOW.getTime()).toBe(60 * 60_000);
  });

  it('a newer local revision never inherits the failure of the attempt it overtook', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertClient(db, clientLea);
    remote.beforePush(() => {
      remote.beforePush(undefined);
      updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
      throw new SyncRemoteError('REJECTED', '23514');
    });

    await run();
    const entry = findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id });
    expect(entry).toMatchObject({ revision: 2, attemptCount: 0 });
    expect(entry?.lastError).toBeUndefined();
    expect(entry?.nextAttemptAt).toBeUndefined();
  });
});

describe('conflicts — a changed remote aggregate is never overwritten', () => {
  it('remote ahead of the acknowledged version: CONFLICT result, remote untouched, entry kept pending', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertClient(db, clientLea);
    await run();

    const elsewhere: RemoteClientPayload = {
      first_name: 'Léa', last_name: 'Martin-Durand', phone: null, email: null, birthday: '02-29', notes: null, archived_at: null,
    };
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id, elsewhere);
    updateClient(db, { ...clientLea, phone: '07 11 11 11 11' });

    const result = await run();
    expect(result).toMatchObject({
      status: 'PUSHED',
      pushed: 0,
      conflicts: [
        { aggregateType: 'CLIENT', aggregateId: clientLea.id, operation: 'UPSERT', acknowledgedVersion: 1, remoteVersion: 2 },
      ],
    });
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)).toMatchObject({ payload: elsewhere, syncVersion: 2, deleted: false });
    expect(ack(db, 'CLIENT', clientLea.id)).toBe(1);
    expect(findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id }))
      .toMatchObject({ operation: 'UPSERT', attemptCount: 1, lastError: 'CONFLICT' });
    // SQLite stays the operational truth for the user.
    expect(loadSnapshot(db).clients[0]?.phone).toBe('07 11 11 11 11');
  });

  it('a DELETE never tombstones a remote revision the device did not acknowledge', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    await run();
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'PRODUCT', productSerum.id, {
      name: 'Sérum', brand: null, category: null, barcode: null, price_cents: 3200, stock_quantity: 7, active: true,
    });
    deleteProduct(db, productSerum.id);

    expect(await run()).toMatchObject({ pushed: 0, conflicts: [{ operation: 'DELETE', acknowledgedVersion: 1, remoteVersion: 2 }] });
    expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', productSerum.id)).toMatchObject({ deleted: false, syncVersion: 2 });
    expect(pending(db)).toEqual([['PRODUCT', 'product-serum', 'DELETE', 1]]);
  });
});

describe('DELETE', () => {
  it('sends a tombstone without needing the local row, and acknowledges the tombstone version', async () => {
    const db = openApprovedPopulatedDatabase();
    const { remote, run } = setup(db);
    await run();

    deleteAppointment(db, appointmentLea.id);
    deleteClientPermanently(db, clientLea.id);
    expect(loadSnapshot(db).clients).toEqual([]);

    expect(await run()).toMatchObject({ pushed: 2, failed: 0, conflicts: [] });
    const deletes = remote.requests.filter((request) => request.operation === 'DELETE');
    expect(deletes.map((request) => [request.aggregateType, request.expectedVersion, request.payload])).toEqual([
      ['CLIENT', 1, undefined],
      ['APPOINTMENT', 1, undefined],
    ]);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)).toMatchObject({ deleted: true, syncVersion: 2 });
    expect(remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)).toMatchObject({ deleted: true, syncVersion: 2 });
    expect(ack(db, 'CLIENT', clientLea.id)).toBe(2);
    expect(pending(db)).toEqual([]);

    // Retrying a tombstone is a no-op remotely.
    expect(remote.list(REMOTE_BUSINESS_ID)).toHaveLength(6);
  });

  it('never-remote DELETE: settles once the remote confirms it holds no row — no tombstone, no acknowledged version', async () => {
    const db = openEmptyBoundDatabase();
    const { remote, run } = setup(db);
    await run();
    insertClient(db, clientLea);
    deleteClientPermanently(db, clientLea.id);
    expect(pending(db)).toEqual([['CLIENT', 'client-lea', 'DELETE', 2]]);

    expect(await run()).toMatchObject({ pushed: 1, failed: 0, conflicts: [] });
    expect(remote.requests).toEqual([
      expect.objectContaining({ operation: 'DELETE', expectedVersion: undefined, payload: undefined }),
    ]);
    expect(remote.list(REMOTE_BUSINESS_ID)).toEqual([]);
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(pending(db)).toEqual([]);
  });

  it('never-remote DELETE stays pending while offline: it is not settled blindly', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertClient(db, clientLea);
    remote.loseNextResponse();
    await run(); // the row DID reach the remote, the acknowledgement did not come back
    deleteClientPermanently(db, clientLea.id);

    remote.failNext(new SyncRemoteError('NETWORK'));
    await run();
    expect(pending(db)).toEqual([['CLIENT', 'client-lea', 'DELETE', 2]]);

    // Back online: the remote row exists at a version this device never acknowledged → reported, not overwritten.
    expect(await run()).toMatchObject({ conflicts: [{ operation: 'DELETE', acknowledgedVersion: undefined, remoteVersion: 1 }] });
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)).toMatchObject({ deleted: false });
  });

  it('an UPSERT entry whose local row is gone is pushed as a DELETE', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    await run();
    setProductStock(db, productSerum.id, 4);
    db.runSync('DELETE FROM products WHERE id = ?', [productSerum.id]); // bypasses the store on purpose

    expect(await run()).toMatchObject({ pushed: 1 });
    expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', productSerum.id)).toMatchObject({ deleted: true });
  });

  it('recreating a deleted aggregate with the same id clears the remote tombstone under the acknowledged version', async () => {
    const { db, remote, run } = await openSyncedDatabase();
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID });
    await run();
    deleteProduct(db, productSerum.id);
    await run();
    insertProduct(db, { ...productSerum, businessId: REMOTE_BUSINESS_ID, stockQuantity: 9 });

    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', productSerum.id)).toMatchObject({ deleted: false, syncVersion: 3 });
    expect(remote.requests.at(-1)?.expectedVersion).toBe(2);
  });
});

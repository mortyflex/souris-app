// BeautIzzy — Cloud Sync V1D: new-device restore + incremental pull, through the
// real stores, the real worker and a contract-faithful in-memory remote
// (docs/architecture/CLOUD_SYNC.md §11.2, §16)

import type { Appointment } from '@/domain/appointments';
import type { Client } from '@/domain/clients';
import type { Sale } from '@/domain/sales';
import { selectProductImageUri } from '@/features/products/images/product-photo-storage';

import { bootstrapPersistence, loadSnapshot, type PersistedSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { clearPersistedDataForDevelopment } from '../development-reset';
import {
  checkoutAppointment,
  deleteAppointment,
  insertAppointment,
  updateAppointment,
  updateAppointmentDiscount,
} from '../stores/appointments';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import {
  archiveClient,
  deleteClientPermanently,
  insertClient,
  setClientPhotoPath,
  updateClient,
} from '../stores/clients';
import { deleteProduct, insertProduct, setProductStock, updateProduct } from '../stores/products';
import { completeSale } from '../stores/sales';
import { updateService } from '../stores/services';
import {
  approveInitialRestore,
  approveInitialUpload,
  readInitialRestoreApproval,
  readSyncBootstrapRecord,
} from '../sync/bootstrap';
import { countSyncOutboxRows, loadSyncOutbox } from '../sync/outbox';
import { PULL_OVERLAP_MS, readSyncPullCursor } from '../sync/pull-cursor';
import { createSyncPushWorker, didSyncRunChangeLocalData } from '../sync/push-worker';
import {
  SyncRemoteError,
  type RemoteAppointmentPayload,
  type RemoteClientPayload,
  type RemoteProductPayload,
  type RemoteServicePayload,
} from '../sync/remote-gateway';
import { parseRemoteBusinessSnapshot, RemoteSnapshotInvalidError } from '../sync/remote-snapshot';
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
const NOW = new Date('2026-09-18T09:00:00.000Z');

const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

const clientZoe: Client = { id: 'client-zoe', firstName: 'Zoé' };

const appointmentCancelled: Appointment = {
  ...appointmentLea,
  id: 'appointment-cancelled',
  startAt: new Date('2026-09-12T13:00:00.000Z'),
  notes: undefined,
  items: [{ ...appointmentLea.items[1]!, id: 'appointment-cancelled-item-0', order: 0 }],
};

const walkInSale: Sale = {
  id: 'sale-walk-in',
  businessId: REMOTE_BUSINESS_ID,
  completedAt: new Date('2026-09-11T09:15:00.000Z'),
  payment: { paidAt: new Date('2026-09-11T09:15:00.000Z'), cardAmountCents: 0, cashAmountCents: 198 },
  items: [{ id: 'sale-walk-in-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 0.99, quantity: 2 }],
};

const linkedSale: Sale = {
  id: 'sale-linked',
  businessId: REMOTE_BUSINESS_ID,
  clientId: clientLea.id,
  appointmentId: appointmentLea.id,
  completedAt: new Date('2026-09-11T10:40:00.000Z'),
  items: [
    { id: 'sale-linked-item-0', productId: productSerum.id, productName: 'Sérum', unitPrice: 32, quantity: 1 },
    { id: 'sale-linked-item-1', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 49.9, quantity: 1 },
  ],
};

function worker(db: SourisDatabase, remote: FakeSyncRemote, now: () => Date = () => NOW) {
  const instance = createSyncPushWorker({ database: db, gateway: remote, now });
  return () => instance.run(REMOTE_BUSINESS_ID);
}

/**
 * The device that OWNS the data: seeded while unbound, bound, the initial
 * upload explicitly approved, then a working day on top of it — a checkout, a
 * cancellation, a paid walk-in Sale, an Appointment-linked Sale, an archived
 * Client, and a Product that was uploaded and then deleted (a tombstone).
 */
async function openUploadedSource(remote: FakeSyncRemote) {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
  const run = worker(db, remote);
  expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', pushed: 6 });

  insertClient(db, clientZoe);
  archiveClient(db, clientZoe.id, new Date('2026-09-13T08:00:00.000Z'));
  insertProduct(db, { id: 'product-gone', businessId: REMOTE_BUSINESS_ID, name: 'Retiré', price: 5, stockQuantity: 0, active: false });
  insertAppointment(db, { ...appointmentCancelled, businessId: REMOTE_BUSINESS_ID });
  updateAppointment(db, {
    ...appointmentCancelled,
    businessId: REMOTE_BUSINESS_ID,
    status: 'CANCELLED',
    cancellation: { cancelledAt: new Date('2026-09-12T08:30:00.000Z'), cancelledBy: 'CLIENT', reason: 'Empêchement' },
  });
  updateProduct(db, { ...productMask, businessId: REMOTE_BUSINESS_ID, price: 49.9 });
  completeSale(db, walkInSale, [{ productId: productMask.id, quantity: 2 }]);
  completeSale(db, linkedSale, [
    { productId: productSerum.id, quantity: 1 },
    { productId: productMask.id, quantity: 1 },
  ]);
  checkoutAppointment(db, appointmentLea.id, {
    paidAt: new Date('2026-09-11T10:45:00.000Z'),
    cardAmountCents: 13501,
    cashAmountCents: 8189,
  });
  expect(await run()).toMatchObject({ status: 'PUSHED', failed: 0, conflicts: [] });
  deleteProduct(db, 'product-gone');
  expect(await run()).toMatchObject({ status: 'PUSHED', pushed: 1, failed: 0 });
  expect(countSyncOutboxRows(db)).toBe(0);
  remote.clearRequests(); // tests count only what the device under test does
  return db;
}

/** A fresh install: migrated, empty production seed, signed in and bound to the SAME Business. */
function openFreshBoundDevice(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, emptySeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

/** `image_uri` is device-local: a restored Product has none. Everything else must be identical. */
function withoutImages(snapshot: PersistedSnapshot): PersistedSnapshot {
  return {
    ...snapshot,
    products: snapshot.products.map((product) => {
      const { imageUri: _imageUri, ...rest } = product;
      return rest;
    }),
  };
}

function rawCents(db: SourisDatabase) {
  return {
    services: db.getAllSync('SELECT id, price_cents FROM services ORDER BY id'),
    products: db.getAllSync('SELECT id, price_cents, stock_quantity FROM products ORDER BY id'),
    appointmentItems: db.getAllSync('SELECT appointment_id, id, item_order, price_cents FROM appointment_items ORDER BY appointment_id, item_order'),
    appointmentPhases: db.getAllSync('SELECT appointment_id, appointment_item_id, position, id, duration_minutes, requires_staff FROM appointment_phases ORDER BY appointment_id, appointment_item_id, position'),
    servicePhases: db.getAllSync('SELECT service_id, position, id, duration_minutes, requires_staff FROM service_phases ORDER BY service_id, position'),
    saleItems: db.getAllSync('SELECT sale_id, id, position, product_id, product_name, unit_price_cents, quantity FROM sale_items ORDER BY sale_id, position'),
    payments: db.getAllSync("SELECT 'A' AS kind, id, paid_at, card_amount_cents, cash_amount_cents FROM appointments UNION ALL SELECT 'S', id, paid_at, card_amount_cents, cash_amount_cents FROM sales ORDER BY kind, id"),
  };
}

async function restoreFreshDevice(remote: FakeSyncRemote) {
  const db = openFreshBoundDevice();
  const run = worker(db, remote);
  expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
  expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
  expect(await run()).toMatchObject({ status: 'RESTORED' });
  return { db, run };
}

describe('bootstrap — an empty device bound to a populated Business', () => {
  it('classifies RESTORE_REQUIRED and restores NOTHING before the explicit approval — run after run', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const db = openFreshBoundDevice();
    const run = worker(db, remote);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    }
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED');
    expect(remote.pulls).toEqual([]); // the dataset was never even fetched
    expect(loadSnapshot(db)).toEqual({ clients: [], services: [], products: [], appointments: [], sales: [], calendarBlocks: [], appointmentDeposits: [], serviceCategories: [] });
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('a device that stored EMPTY discovers the Business was populated meanwhile: RESTORE_REQUIRED, not a silent empty account', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = openFreshBoundDevice();
    const run = worker(db, remote);
    expect(await run()).toMatchObject({ status: 'PUSHED', bootstrap: 'EMPTY' });

    await openUploadedSource(remote);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
  });

  it('approving records the approval only: no request, no row — and it is Business-scoped, refused on a populated or synchronized device', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openUploadedSource(remote);
    const db = openFreshBoundDevice();

    expect(approveInitialRestore(db, OTHER_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'BUSINESS_MISMATCH' });
    expect(approveInitialRestore(openTestDatabaseWithSchema(), REMOTE_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'NOT_BOUND' });
    // A device that already synchronizes has nothing to restore.
    expect(approveInitialRestore(source, REMOTE_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'NOT_REQUIRED' });
    // A restore never runs over local data.
    const populated = openTestDatabase();
    bootstrapPersistence(populated, createTestSeed);
    bindLocalDatabaseToBusiness(populated, remoteBusinessProfile);
    expect(approveInitialRestore(populated, REMOTE_BUSINESS_ID, NOW)).toEqual({ status: 'REFUSED', reason: 'LOCAL_NOT_EMPTY' });

    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW)).toEqual({
      status: 'APPROVED',
      approval: { businessId: REMOTE_BUSINESS_ID, approvedAt: NOW },
    });
    expect(remote.pulls).toEqual([]);
    expect(loadSnapshot(db).clients).toEqual([]);
    // Survives a restart.
    bootstrapPersistence(db, emptySeed);
    expect(readInitialRestoreApproval(db, REMOTE_BUSINESS_ID)?.approvedAt).toEqual(NOW);
    expect(readInitialRestoreApproval(db, OTHER_BUSINESS_ID)).toBeUndefined();
  });

  it('local populated + remote populated stays RECONCILIATION_REQUIRED: a restore approval never overwrites local data', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const db = openFreshBoundDevice();
    const run = worker(db, remote);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');

    // She adds a Client on the new phone before the restore ran.
    insertClient(db, { id: 'client-new-phone', firstName: 'Nina' });
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RECONCILIATION_REQUIRED' });
    expect(remote.pulls).toEqual([]);
    expect(loadSnapshot(db).clients.map((client) => client.id)).toEqual(['client-new-phone']);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', 'client-new-phone')).toBeUndefined();
  });
});

function openTestDatabaseWithSchema(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, emptySeed);
  return db;
}

describe('new-device restore', () => {
  it('rebuilds all five aggregate families with their children — identical to the source device, images aside', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openUploadedSource(remote);
    const db = openFreshBoundDevice();
    const run = worker(db, remote);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');

    const result = await run();
    expect(result).toEqual({
      status: 'RESTORED',
      restored: { clients: 2, services: 2, products: 2, appointments: 2, sales: 2, calendarBlocks: 0, appointmentDeposits: 0, serviceCategories: 0, tombstones: 1 },
    });
    expect(didSyncRunChangeLocalData(result)).toBe(true);
    expect(remote.pulls).toEqual([undefined]); // ONE read of the complete dataset

    // The app hydrates from SQLite exactly as on the source device — same records, same order.
    const restored = loadSnapshot(db);
    expect(restored).toEqual(withoutImages(loadSnapshot(source)));
    expect(restored.clients.map((client) => client.id)).toEqual([clientLea.id, clientZoe.id]);
    expect(restored.clients[1]?.archivedAt).toEqual(new Date('2026-09-13T08:00:00.000Z'));
    expect(restored.clients[0]?.birthday).toEqual({ month: 2, day: 29 });
    // The tombstoned Product was not resurrected.
    expect(restored.products.map((product) => product.id)).toEqual([productMask.id, productSerum.id]);
    // `image_uri` stays local-only: absent after a restore.
    expect(db.getAllSync('SELECT id FROM products WHERE image_uri IS NOT NULL')).toEqual([]);
    expect(loadSnapshot(source).products[0]?.imageUri).toBe(productMask.imageUri);
  });

  it('preserves exact integer cents, ids, child ids and order, snapshots, lifecycle and payment data', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openUploadedSource(remote);
    const { db } = await restoreFreshDevice(remote);

    // Byte-for-byte at the SQL level: no euro round trip anywhere.
    expect(rawCents(db)).toEqual(rawCents(source));
    expect(db.getAllSync('SELECT id, price_cents, stock_quantity FROM products ORDER BY id')).toEqual([
      { id: productMask.id, price_cents: 4990, stock_quantity: 2 },
      { id: productSerum.id, price_cents: 3200, stock_quantity: 0 },
    ]);
    expect(db.getAllSync('SELECT unit_price_cents, quantity FROM sale_items WHERE sale_id = ?', [walkInSale.id])).toEqual([
      { unit_price_cents: 99, quantity: 2 },
    ]);

    const restored = loadSnapshot(db);
    const paid = restored.appointments.find((appointment) => appointment.id === appointmentLea.id)!;
    expect(paid.status).toBe('COMPLETED');
    expect(paid.payment).toEqual({ paidAt: new Date('2026-09-11T10:45:00.000Z'), cardAmountCents: 13501, cashAmountCents: 8189 });
    expect(paid.startAt).toEqual(appointmentLea.startAt);
    // Appointment snapshot: item order, option, snapshot price, the booking's own phase durations.
    expect(paid.items.map((item) => [item.id, item.order, item.serviceOptionId, item.price])).toEqual([
      ['appointment-lea-item-0', 0, undefined, 95],
      ['appointment-lea-item-1', 1, 'option-long', 40],
    ]);
    expect(paid.items[1]?.phases).toEqual([{ id: 'cut', name: 'Coupe', durationMinutes: 30, requiresStaff: true }]);
    expect(paid.items[0]?.phases.map((phase) => [phase.id, phase.requiresStaff])).toEqual([
      ['color-application', true],
      ['color-processing', false],
      ['color-rinse', true],
    ]);

    const cancelled = restored.appointments.find((appointment) => appointment.id === appointmentCancelled.id)!;
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellation).toEqual({ cancelledAt: new Date('2026-09-12T08:30:00.000Z'), cancelledBy: 'CLIENT', reason: 'Empêchement' });
    expect(cancelled.payment).toBeUndefined();

    // Sales: the standalone one keeps its payment; the Appointment-linked one keeps its link and has none.
    expect(restored.sales.find((sale) => sale.id === walkInSale.id)).toEqual(walkInSale);
    expect(restored.sales.find((sale) => sale.id === linkedSale.id)).toEqual(linkedSale);
  });

  it('acknowledges every remote sync_version, leaves the outbox empty, stores ALREADY_SYNCED, the cursor, and consumes the approval', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const { db } = await restoreFreshDevice(remote);

    const acknowledged = Object.fromEntries(
      loadSyncState(db, REMOTE_BUSINESS_ID).map((state) => [`${state.aggregateType}/${state.aggregateId}`, state.remoteVersion]),
    );
    const held = Object.fromEntries(remote.list(REMOTE_BUSINESS_ID).map((row) => [row.key, row.syncVersion]));
    expect(acknowledged).toEqual(held); // tombstone included: it is a known revision
    expect(Object.keys(acknowledged)).toHaveLength(11);
    expect(acknowledged[`PRODUCT/${productMask.id}`]).toBeGreaterThan(1); // the REAL versions, not a fabricated 1

    expect(countSyncOutboxRows(db)).toBe(0);
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('ALREADY_SYNCED');
    expect(readInitialRestoreApproval(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(readSyncPullCursor(db, REMOTE_BUSINESS_ID)).toBeInstanceOf(Date);
  });

  it('the restored device then works normally: nothing echoes back, local edits push under the restored versions', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const { db, run } = await restoreFreshDevice(remote);
    remote.clearRequests();

    const idle = await run();
    expect(idle).toMatchObject({ status: 'PUSHED', bootstrap: 'ALREADY_SYNCED', pushed: 0, pull: { status: 'PULLED', applied: 0, deleted: 0 } });
    expect(didSyncRunChangeLocalData(idle)).toBe(false);
    expect(remote.requests).toEqual([]); // no sync echo

    const before = remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)!.syncVersion;
    updateClient(db, { ...clientLea, phone: '07 00 00 00 00' });
    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(remote.requests).toHaveLength(1);
    expect(remote.requests[0]).toMatchObject({ aggregateType: 'CLIENT', expectedVersion: before });
    expect((remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)!.payload as RemoteClientPayload).phone).toBe('07 00 00 00 00');
  });

  it('drops outbox intents left over on the empty device: they describe aggregates that were never uploaded', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const db = openFreshBoundDevice();
    insertClient(db, { id: 'client-mistake', firstName: 'Erreur' });
    deleteClientPermanently(db, 'client-mistake');
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => entry.operation)).toEqual(['DELETE']);

    const run = worker(db, remote);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
    expect(await run()).toMatchObject({ status: 'RESTORED' });
    expect(countSyncOutboxRows(db)).toBe(0);
  });
});

describe('restore failure — SQLite unchanged, approval kept, retry works', () => {
  const untouched = (db: SourisDatabase) => {
    expect(loadSnapshot(db)).toEqual({ clients: [], services: [], products: [], appointments: [], sales: [], calendarBlocks: [], appointmentDeposits: [], serviceCategories: [] });
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);
    expect(countSyncOutboxRows(db)).toBe(0);
    expect(readSyncPullCursor(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)?.decision).toBe('RESTORE_REQUIRED');
    expect(readInitialRestoreApproval(db, REMOTE_BUSINESS_ID)).toBeDefined();
  };

  it('a failure in the MIDDLE of the local transaction rolls everything back; the next run restores completely', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const db = openFreshBoundDevice();
    const run = worker(db, remote);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');

    // The device breaks while writing Sales — clients, services, products and appointments are already inserted.
    const failing: SourisDatabase = {
      ...db,
      runSync: (sql, params) => {
        if (sql.startsWith('INSERT INTO sale_items')) throw new Error('disk full');
        return db.runSync(sql, params);
      },
    };
    const interrupted = await createSyncPushWorker({ database: failing, gateway: remote, now: () => NOW }).run(REMOTE_BUSINESS_ID);
    expect(interrupted).toEqual({ status: 'FAILED', reason: 'LOCAL' });
    expect(didSyncRunChangeLocalData(interrupted)).toBe(false);
    untouched(db);

    // Restart (new worker, relaunch bootstrap): no new approval needed.
    bootstrapPersistence(db, emptySeed);
    expect(await worker(db, remote)()).toMatchObject({ status: 'RESTORED', restored: { clients: 2, sales: 2 } });
    expect(loadSnapshot(db).sales).toHaveLength(2);
  });

  it('offline or refused by the remote while fetching: FAILED with the remote code, nothing written', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const db = openFreshBoundDevice();
    const run = worker(db, remote);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');

    remote.beforePull(() => {
      throw new SyncRemoteError('NETWORK');
    });
    expect(await run()).toEqual({ status: 'FAILED', reason: 'NETWORK' });
    untouched(db);

    // The pull function is not deployed yet (PGRST202 → UNKNOWN): same outcome.
    remote.beforePull(() => {
      throw new SyncRemoteError('UNKNOWN', 'PGRST202');
    });
    expect(await run()).toEqual({ status: 'FAILED', reason: 'UNKNOWN' });
    untouched(db);

    remote.beforePull(undefined);
    expect(await run()).toMatchObject({ status: 'RESTORED' });
  });

  it('validates the WHOLE dataset before mutating SQLite: one invalid aggregate refuses the restore', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const db = openFreshBoundDevice();
    const run = worker(db, remote);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');

    const good = (await remote.pullBusinessAggregates(REMOTE_BUSINESS_ID, undefined)) as Record<string, Record<string, unknown>[]>;
    const corrupt = (mutate: (data: typeof good) => void) => {
      const copy = JSON.parse(JSON.stringify(good)) as typeof good;
      mutate(copy);
      return copy;
    };
    const invalidDatasets = [
      corrupt((data) => (data.sales![0]!.items as Record<string, unknown>[])[0]!.unit_price_cents = 0.99), // euros, not cents
      corrupt((data) => (data.appointments![0]!.card_amount_cents = null)), // half a payment
      corrupt((data) => (data.services![0]!.phases as Record<string, unknown>[])[1]!.position = 0), // duplicate position
      corrupt((data) => (data.clients![0]!.sync_version = 0)),
      corrupt((data) => (data.appointments![0]!.client_id = 'client-unknown')), // dangling reference
      corrupt((data) => data.clients!.push({ ...data.clients![0]! })), // duplicate id
      { clients: [] },
      'not json',
    ];
    for (const dataset of invalidDatasets) {
      remote.answerNextPullWith(dataset);
      expect(await run()).toEqual({ status: 'FAILED', reason: 'INVALID_REMOTE_DATA' });
      untouched(db);
    }

    expect(await run()).toMatchObject({ status: 'RESTORED' });
  });

  it('a record created WHILE the dataset was being fetched stops the restore: never over local data', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const db = openFreshBoundDevice();
    const run = worker(db, remote);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');

    remote.beforePull(() => insertClient(db, { id: 'client-during', firstName: 'Pendant' }));
    expect(await run()).toEqual({ status: 'FAILED', reason: 'RESTORE_REFUSED' });
    expect(loadSnapshot(db).clients.map((client) => client.id)).toEqual(['client-during']);
    expect(loadSnapshot(db).services).toEqual([]);
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);

    remote.beforePull(undefined);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RECONCILIATION_REQUIRED' });
  });

  it('the development reset clears the restore approval and the pull cursor with the rest of the sync bookkeeping', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    await openUploadedSource(remote);
    const { db } = await restoreFreshDevice(remote);
    expect(readSyncPullCursor(db, REMOTE_BUSINESS_ID)).toBeDefined();

    clearPersistedDataForDevelopment(db);
    expect(readSyncPullCursor(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toEqual([]);

    const fresh = openFreshBoundDevice();
    const run = worker(fresh, remote);
    expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
    expect(approveInitialRestore(fresh, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
    clearPersistedDataForDevelopment(fresh);
    expect(readInitialRestoreApproval(fresh, REMOTE_BUSINESS_ID)).toBeUndefined();
  });
});

describe('Business isolation', () => {
  it('restores only the bound Business, refuses a Business the signed-in user does not own, and never inherits another Business\'s approval or cursor', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID, OTHER_BUSINESS_ID]);
    await openUploadedSource(remote);
    remote.writeFromElsewhere(OTHER_BUSINESS_ID, 'CLIENT', 'client-other-salon', {
      first_name: 'Autre', last_name: 'Salon', phone: null, email: null, birthday: null, notes: null, photo_path: null, sms_marketing_consent: null, sms_marketing_consent_updated_at: null, sms_marketing_consent_source: null, archived_at: null,
    });
    // The SAME id exists in both Businesses with different content.
    remote.writeFromElsewhere(OTHER_BUSINESS_ID, 'CLIENT', clientLea.id, {
      first_name: 'Homonyme', last_name: null, phone: null, email: null, birthday: null, notes: null, photo_path: null, sms_marketing_consent: null, sms_marketing_consent_updated_at: null, sms_marketing_consent_source: null, archived_at: null,
    });

    const { db } = await restoreFreshDevice(remote);
    const clients = loadSnapshot(db).clients;
    expect(clients.map((client) => client.id)).toEqual([clientLea.id, clientZoe.id]);
    expect(clients[0]?.firstName).toBe('Léa');
    expect(loadSyncState(db, OTHER_BUSINESS_ID)).toEqual([]);
    expect(db.getAllSync("SELECT DISTINCT business_id FROM (SELECT business_id FROM services UNION SELECT business_id FROM products UNION SELECT business_id FROM appointments UNION SELECT business_id FROM sales)")).toEqual([
      { business_id: REMOTE_BUSINESS_ID },
    ]);
    expect(readSyncPullCursor(db, OTHER_BUSINESS_ID)).toBeUndefined();

    // A user who does not own the Business gets FORBIDDEN, not an empty dataset.
    const stranger = createFakeSyncRemote([OTHER_BUSINESS_ID]);
    const device = openFreshBoundDevice();
    expect(await worker(device, stranger)()).toEqual({ status: 'FAILED', reason: 'FORBIDDEN' });
    await expect(stranger.pullBusinessAggregates(REMOTE_BUSINESS_ID, undefined)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(loadSnapshot(device).clients).toEqual([]);

    // A worker asked to run for another Business than the bound one never reaches the network.
    expect(await createSyncPushWorker({ database: db, gateway: remote }).run(OTHER_BUSINESS_ID)).toEqual({
      status: 'SKIPPED',
      reason: 'BUSINESS_MISMATCH',
    });
  });
});

/** Two devices of one Business: `a` uploaded it, `b` restored it. */
async function openTwoDevices() {
  const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
  const a = await openUploadedSource(remote);
  const { db: b } = await restoreFreshDevice(remote);
  const runA = worker(a, remote);
  const runB = worker(b, remote);
  expect(await runA()).toMatchObject({ pull: { status: 'PULLED', applied: 0 } });
  remote.clearRequests();
  return { remote, a, b, runA, runB };
}

describe('incremental pull', () => {
  it('remote newer + local clean: applies the aggregate transactionally, acknowledges the returned version, creates NO outbox entry', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();

    updateClient(b, { ...clientLea, lastName: 'Martin-Durand', phone: undefined });
    updateService(b, {
      ...serviceColor,
      businessId: REMOTE_BUSINESS_ID,
      price: 99.5,
      phases: [
        { id: 'color-application', name: 'Application', durationMinutes: 20, requiresStaff: true },
        { id: 'color-rinse', name: 'Rinçage', durationMinutes: 25, requiresStaff: true },
      ],
    });
    setProductStock(b, productSerum.id, 7);
    insertClient(b, { id: 'client-from-b', firstName: 'Inès' });
    insertAppointment(b, { ...appointmentLea, id: 'appointment-from-b', businessId: REMOTE_BUSINESS_ID, clientId: 'client-from-b' });
    expect(await runB()).toMatchObject({ pushed: 5, conflicts: [] });
    remote.clearRequests();

    const result = await runA();
    expect(result).toMatchObject({
      status: 'PUSHED',
      pushed: 0,
      pull: { status: 'PULLED', applied: 5, deleted: 0, failed: 0, conflicts: [], cursorAdvanced: true },
    });
    expect(didSyncRunChangeLocalData(result)).toBe(true);

    // Device A now equals device B — and keeps its own local-only image.
    expect(withoutImages(loadSnapshot(a))).toEqual(withoutImages(loadSnapshot(b)));
    expect(loadSnapshot(a).products.find((product) => product.id === productMask.id)?.imageUri).toBe(productMask.imageUri);
    expect(a.getAllSync('SELECT price_cents FROM services WHERE id = ?', [serviceColor.id])).toEqual([{ price_cents: 9950 }]);
    expect(a.getAllSync('SELECT position, id FROM service_phases WHERE service_id = ? ORDER BY position', [serviceColor.id])).toEqual([
      { position: 0, id: 'color-application' },
      { position: 1, id: 'color-rinse' },
    ]);
    // In-place update: the list order of existing records did not move.
    expect(loadSnapshot(a).clients.map((client) => client.id)).toEqual([clientLea.id, clientZoe.id, 'client-from-b']);

    // sync_state follows the remote; no echo — nothing pending, nothing pushed back.
    for (const row of remote.list(REMOTE_BUSINESS_ID)) {
      const [aggregateType, aggregateId] = row.key.split('/') as ['CLIENT', string];
      expect(readAcknowledgedRemoteVersion(a, REMOTE_BUSINESS_ID, { aggregateType, aggregateId })?.remoteVersion).toBe(row.syncVersion);
    }
    expect(countSyncOutboxRows(a)).toBe(0);
    expect(remote.requests).toEqual([]);
    const again = await runA();
    expect(again).toMatchObject({ pushed: 0, pull: { applied: 0, deleted: 0 } });
    expect(didSyncRunChangeLocalData(again)).toBe(false);
    expect(remote.requests).toEqual([]);
  });

  it('local dirty + remote unchanged: left to the push, which goes first', async () => {
    const { remote, a, runA } = await openTwoDevices();
    updateClient(a, { ...clientLea, email: 'lea@example.test' });

    expect(await runA()).toMatchObject({ pushed: 1, conflicts: [], pull: { status: 'PULLED', applied: 0, conflicts: [] } });
    expect((remote.find(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id)!.payload as RemoteClientPayload).email).toBe('lea@example.test');
    expect(loadSnapshot(a).clients[0]?.email).toBe('lea@example.test');
    expect(countSyncOutboxRows(a)).toBe(0);
  });

  it('a push whose answer was lost is acknowledged by the push pass — the pull never reads it as a conflict', async () => {
    const { remote, a, runA } = await openTwoDevices();
    updateClient(a, { ...clientLea, phone: '01 02 03 04 05' });
    remote.loseNextResponse();
    expect(await runA()).toMatchObject({ pushed: 0, stoppedBy: 'NETWORK' });
    expect(countSyncOutboxRows(a)).toBe(1);

    const retried = await runA();
    expect(retried).toMatchObject({ pushed: 1, conflicts: [], pull: { status: 'PULLED', conflicts: [], applied: 0 } });
    expect(countSyncOutboxRows(a)).toBe(0);
  });

  it('reads incrementally from the stored server cursor minus the overlap; re-read revisions are skipped', async () => {
    const { remote, b, runB } = await openTwoDevices();
    const cursor = readSyncPullCursor(b, REMOTE_BUSINESS_ID)!;

    // The dataset was written seconds before the restore, i.e. INSIDE the overlap window of B's
    // cursor: the first pull reads it again and recognizes every acknowledged version.
    remote.advanceClock(PULL_OVERLAP_MS * 3);
    const first = await runB();
    expect(remote.pulls).toEqual([new Date(cursor.getTime() - PULL_OVERLAP_MS)]);
    expect(first).toMatchObject({ pull: { status: 'PULLED', fetched: 11, skipped: 11, applied: 0, deleted: 0, failed: 0, cursorAdvanced: true } });
    const advanced = readSyncPullCursor(b, REMOTE_BUSINESS_ID)!;
    expect(advanced.getTime()).toBeGreaterThan(cursor.getTime() + PULL_OVERLAP_MS);

    // The cursor moved past it: the remote now returns nothing at all.
    remote.advanceClock(PULL_OVERLAP_MS * 3);
    expect(await runB()).toMatchObject({ pull: { status: 'PULLED', fetched: 0, cursorAdvanced: true } });
    expect(remote.pulls[1]).toEqual(new Date(advanced.getTime() - PULL_OVERLAP_MS));

    // Only what changes afterwards comes back.
    remote.advanceClock(PULL_OVERLAP_MS * 3);
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', 'client-later', { first_name: 'Plus tard', last_name: null, phone: null, email: null, birthday: null, notes: null, photo_path: null, sms_marketing_consent: null, sms_marketing_consent_updated_at: null, sms_marketing_consent_source: null, archived_at: null });
    expect(await runB()).toMatchObject({ pull: { status: 'PULLED', fetched: 1, applied: 1 } });
  });

  it('a failed or invalid pull applies nothing, keeps the cursor, never disturbs the push — and is retried', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();
    updateClient(b, { ...clientLea, firstName: 'Léa-Rose' });
    expect(await runB()).toMatchObject({ pushed: 1 });
    const cursor = readSyncPullCursor(a, REMOTE_BUSINESS_ID);
    insertClient(a, { id: 'client-from-a', firstName: 'Anna' });

    remote.beforePull(() => {
      throw new SyncRemoteError('UNKNOWN', 'PGRST202');
    });
    expect(await runA()).toMatchObject({ status: 'PUSHED', pushed: 1, pull: { status: 'FAILED', reason: 'UNKNOWN' } });
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', 'client-from-a')).toBeDefined(); // the push still went through
    remote.beforePull(undefined);

    remote.answerNextPullWith({ pulled_at: '2026-09-18T09:00:00.000Z', clients: [{ id: clientLea.id, sync_version: 99, deleted_at: null, first_name: 42 }], services: [], products: [], appointments: [], sales: [] });
    expect(await runA()).toMatchObject({ pull: { status: 'FAILED', reason: 'INVALID_REMOTE_DATA' } });
    expect(loadSnapshot(a).clients[0]?.firstName).toBe('Léa');
    expect(readSyncPullCursor(a, REMOTE_BUSINESS_ID)).toEqual(cursor);

    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', applied: 1 } });
    expect(loadSnapshot(a).clients[0]?.firstName).toBe('Léa-Rose');
  });

  it('an aggregate whose reference is missing locally is not applied and HOLDS the cursor, so it is fetched again', async () => {
    const { remote, a, runA } = await openTwoDevices();
    const cursor = readSyncPullCursor(a, REMOTE_BUSINESS_ID);
    const appointmentPayload = remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)!.payload;
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT', 'appointment-orphan', { ...appointmentPayload, client_id: 'client-nowhere' } as typeof appointmentPayload);

    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', applied: 0, failed: 1, cursorAdvanced: false } });
    expect(loadSnapshot(a).appointments.map((appointment) => appointment.id)).not.toContain('appointment-orphan');
    expect(a.getAllSync("SELECT id FROM appointment_items WHERE appointment_id = 'appointment-orphan'")).toEqual([]); // rolled back as a whole
    expect(readSyncPullCursor(a, REMOTE_BUSINESS_ID)).toEqual(cursor);
    expect(readAcknowledgedRemoteVersion(a, REMOTE_BUSINESS_ID, { aggregateType: 'APPOINTMENT', aggregateId: 'appointment-orphan' })).toBeUndefined();

    // Once the Client exists remotely too, the same pull window brings both.
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', 'client-nowhere', { first_name: 'Enfin', last_name: null, phone: null, email: null, birthday: null, notes: null, photo_path: null, sms_marketing_consent: null, sms_marketing_consent_updated_at: null, sms_marketing_consent_source: null, archived_at: null });
    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', applied: 2, failed: 0, cursorAdvanced: true } });
  });
});

describe('Client birthday + notes — synced like every other Client property', () => {
  const NOTES = 'Allergie au PPD.\n\nPréfère le matin\n— cuir chevelu sensible';
  const clientPayload = (remote: FakeSyncRemote, id: string) =>
    remote.find(REMOTE_BUSINESS_ID, 'CLIENT', id)?.payload as RemoteClientPayload | undefined;

  it('local create and local edit reach the cloud, then restore identically on a fresh device', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openUploadedSource(remote);
    const run = worker(source, remote);

    insertClient(source, { id: 'client-nour', firstName: 'Nour', birthday: { month: 9, day: 21 }, notes: NOTES });
    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(clientPayload(remote, 'client-nour')).toMatchObject({ birthday: '09-21', notes: NOTES });

    updateClient(source, { ...clientLea, birthday: { month: 7, day: 3 }, notes: 'Peau réactive' });
    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(clientPayload(remote, clientLea.id)).toMatchObject({ birthday: '07-03', notes: 'Peau réactive' });

    const { db: restored } = await restoreFreshDevice(remote);
    expect(loadSnapshot(restored).clients).toEqual(loadSnapshot(source).clients);
    expect(loadSnapshot(restored).clients.find((client) => client.id === 'client-nour')).toEqual({
      id: 'client-nour',
      firstName: 'Nour',
      birthday: { month: 9, day: 21 },
      notes: NOTES,
    });
  });

  it('an edit on one device is pulled by the other; clearing both values propagates as absent, not as empty text', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();

    updateClient(b, { ...clientLea, notes: NOTES });
    expect(await runB()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    expect(loadSnapshot(a).clients.find((client) => client.id === clientLea.id)).toEqual({ ...clientLea, notes: NOTES });
    expect(countSyncOutboxRows(a)).toBe(0);

    // Device A clears the birthday AND the note.
    const { birthday: _birthday, ...leaWithoutBirthday } = clientLea;
    updateClient(a, leaWithoutBirthday);
    expect(await runA()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(clientPayload(remote, clientLea.id)).toMatchObject({ birthday: null, notes: null });

    expect(await runB()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    const pulled = loadSnapshot(b).clients.find((client) => client.id === clientLea.id);
    expect(pulled).toEqual(leaWithoutBirthday);
    expect('birthday' in pulled!).toBe(false);
    expect('notes' in pulled!).toBe(false);
    expect(b.getAllSync('SELECT birthday, notes FROM clients WHERE id = ?', [clientLea.id])).toEqual([
      { birthday: null, notes: null },
    ]);
  });

  it('a Client without birthday or notes keeps syncing with explicit NULLs — the pre-existing shape', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openUploadedSource(remote);

    expect(clientPayload(remote, clientZoe.id)).toMatchObject({ birthday: null, notes: null });
    const { db: restored } = await restoreFreshDevice(remote);
    const zoe = loadSnapshot(restored).clients.find((client) => client.id === clientZoe.id);
    expect(zoe).toEqual(loadSnapshot(source).clients.find((client) => client.id === clientZoe.id));
    expect('notes' in zoe!).toBe(false);
  });
});

describe('Client photo — a stable storage path synced with the CLIENT aggregate', () => {
  const PHOTO = `${REMOTE_BUSINESS_ID}/clients/client-lea/photo-1.jpg`;
  const NEXT_PHOTO = `${REMOTE_BUSINESS_ID}/clients/client-lea/photo-2.jpg`;
  const clientPayload = (remote: FakeSyncRemote, id: string) =>
    remote.find(REMOTE_BUSINESS_ID, 'CLIENT', id)?.payload as RemoteClientPayload | undefined;
  const findClient = (db: SourisDatabase, id: string) =>
    loadSnapshot(db).clients.find((client) => client.id === id);

  it('a photo set locally reaches the cloud as its path, then restores identically on a fresh device', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openUploadedSource(remote);
    const run = worker(source, remote);

    setClientPhotoPath(source, clientLea.id, PHOTO);
    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(clientPayload(remote, clientLea.id)).toMatchObject({ photo_path: PHOTO, notes: null });

    const { db: restored } = await restoreFreshDevice(remote);
    expect(findClient(restored, clientLea.id)).toEqual({ ...clientLea, photoPath: PHOTO });
    expect(loadSnapshot(restored).clients).toEqual(loadSnapshot(source).clients);
  });

  it('a replacement and a removal on one device are pulled by the other; nothing else moves', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();

    setClientPhotoPath(b, clientLea.id, PHOTO);
    expect(await runB()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    expect(findClient(a, clientLea.id)).toEqual({ ...clientLea, photoPath: PHOTO });
    expect(countSyncOutboxRows(a)).toBe(0);

    setClientPhotoPath(a, clientLea.id, NEXT_PHOTO);
    expect(await runA()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(await runB()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    expect(findClient(b, clientLea.id)?.photoPath).toBe(NEXT_PHOTO);

    setClientPhotoPath(b, clientLea.id, undefined);
    expect(await runB()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(clientPayload(remote, clientLea.id)).toMatchObject({ photo_path: null });
    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    const pulled = findClient(a, clientLea.id);
    expect(pulled).toEqual(clientLea);
    expect('photoPath' in pulled!).toBe(false);
  });

  it('an identity edit keeps the photo on both devices', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();

    setClientPhotoPath(a, clientLea.id, PHOTO);
    await runA();
    await runB();
    // The Client form knows nothing about photos: its Client has no photoPath.
    updateClient(b, { ...clientLea, phone: '07 00 00 00 00' });
    expect(await runB()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(clientPayload(remote, clientLea.id)).toMatchObject({ photo_path: PHOTO, phone: '07 00 00 00 00' });
    await runA();
    expect(findClient(a, clientLea.id)).toEqual({ ...clientLea, phone: '07 00 00 00 00', photoPath: PHOTO });
  });

  it('a remote that predates the column (no photo_path key) parses as "no photo"', () => {
    const snapshot = parseRemoteBusinessSnapshot({
      pulled_at: '2026-09-25T08:00:00.000Z',
      clients: [
        {
          id: 'client-old',
          sync_version: 1,
          deleted_at: null,
          first_name: 'Ancienne',
          last_name: null,
          phone: null,
          email: null,
          birthday: null,
          notes: null,
          archived_at: null,
        },
      ],
      services: [],
      products: [],
      appointments: [],
      sales: [],
    });
    expect(snapshot.clients[0]?.payload).toMatchObject({ photo_path: null });
  });
});

describe('Product photo — ONE shared photo per Product id, legacy local images never promoted', () => {
  const PHOTO_C = `${REMOTE_BUSINESS_ID}/products/${productMask.id}/photo-c.jpg`;
  const LEGACY_A = productMask.imageUri!;
  const LEGACY_B = 'file:///device-b/Documents/products/product-mask-1600000000000-9.jpg';
  const productPayload = (remote: FakeSyncRemote, id: string) =>
    remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', id)?.payload as RemoteProductPayload | undefined;
  const findProductIn = (db: SourisDatabase, id: string) =>
    loadSnapshot(db).products.find((product) => product.id === id);
  const shownOn = (db: SourisDatabase, sharedPhotoUri: string | undefined) =>
    selectProductImageUri(findProductIn(db, productMask.id), sharedPhotoUri);

  it('same Product id, legacy photo A on device A and B on device B, no server photo: sync uploads NEITHER', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();
    b.runSync('UPDATE products SET image_uri = ? WHERE id = ?', [LEGACY_B, productMask.id]);

    // Unrelated edits on both devices push the Product — never its local image.
    setProductStock(a, productMask.id, 9);
    await runA();
    await runB();
    expect(productPayload(remote, productMask.id)).toMatchObject({ photo_path: null, stock_quantity: 9 });
    expect(JSON.stringify(productPayload(remote, productMask.id))).not.toContain('file://');
    expect(findProductIn(b, productMask.id)?.stockQuantity).toBe(9);

    // Each device still shows its own legacy image, and only locally.
    expect(findProductIn(a, productMask.id)).toMatchObject({ imageUri: LEGACY_A });
    expect(findProductIn(b, productMask.id)).toMatchObject({ imageUri: LEGACY_B });
    expect(findProductIn(a, productMask.id)?.photoPath).toBeUndefined();
    expect(shownOn(a, undefined)).toBe(LEGACY_A);
    expect(shownOn(b, undefined)).toBe(LEGACY_B);
  });

  it('device A explicitly takes photo C: the server gets it, device B receives it, and B\'s legacy photo no longer wins', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();
    b.runSync('UPDATE products SET image_uri = ? WHERE id = ?', [LEGACY_B, productMask.id]);

    // What the catalog writes once photo C is uploaded (ProductCatalogProvider).
    const onA = findProductIn(a, productMask.id)!;
    const { imageUri: _legacyA, ...withoutLegacy } = onA;
    updateProduct(a, { ...withoutLegacy, photoPath: PHOTO_C });
    expect(await runA()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(productPayload(remote, productMask.id)).toMatchObject({ photo_path: PHOTO_C });

    expect(await runB()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    const onB = findProductIn(b, productMask.id)!;
    expect(onB.photoPath).toBe(PHOTO_C);
    // B's old local image is still on disk and in its row — but it never wins.
    expect(onB.imageUri).toBe(LEGACY_B);
    const cachedC = 'file:///device-b/Documents/product-photos/photo-c.jpg';
    expect(shownOn(b, cachedC)).toBe(cachedC);
    expect(shownOn(b, undefined)).toBeUndefined();
    expect(shownOn(a, 'file:///a/photo-c.jpg')).toBe('file:///a/photo-c.jpg');
  });

  it('photoPath survives SQLite, push, pull and a fresh-device restore; removal propagates as absent', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();
    updateProduct(b, { ...findProductIn(b, productMask.id)!, photoPath: PHOTO_C });
    await runB();
    await runA();
    expect(findProductIn(a, productMask.id)?.photoPath).toBe(PHOTO_C);

    const { db: restored } = await restoreFreshDevice(remote);
    expect(findProductIn(restored, productMask.id)?.photoPath).toBe(PHOTO_C);
    // A restored device never receives anyone's legacy local image.
    expect(findProductIn(restored, productMask.id)?.imageUri).toBeUndefined();

    const { photoPath: _photo, ...removed } = findProductIn(a, productMask.id)!;
    updateProduct(a, removed);
    await runA();
    expect(productPayload(remote, productMask.id)).toMatchObject({ photo_path: null });
    await runB();
    expect('photoPath' in findProductIn(b, productMask.id)!).toBe(false);
  });

  it('a remote that predates the column (no photo_path key) parses as "no shared photo"', () => {
    const snapshot = parseRemoteBusinessSnapshot({
      pulled_at: '2026-09-26T08:00:00.000Z',
      clients: [],
      services: [],
      products: [
        {
          id: 'product-old',
          sync_version: 1,
          deleted_at: null,
          name: 'Ancien',
          brand: null,
          category: null,
          barcode: null,
          price_cents: 100,
          stock_quantity: 1,
          active: true,
        },
      ],
      appointments: [],
      sales: [],
    });
    expect(snapshot.products[0]?.payload).toMatchObject({ photo_path: null });
  });
});

describe('Appointment discount — synced with the APPOINTMENT aggregate', () => {
  const appointmentPayload = (remote: FakeSyncRemote, id: string) =>
    remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', id)?.payload as RemoteAppointmentPayload | undefined;
  const upcoming: Appointment = {
    ...appointmentCancelled,
    id: 'appointment-upcoming',
    businessId: REMOTE_BUSINESS_ID,
    startAt: new Date('2026-09-25T08:00:00.000Z'),
  };
  const findAppointment = (db: SourisDatabase, id: string) =>
    loadSnapshot(db).appointments.find((appointment) => appointment.id === id);

  it('a percentage discount created with the Appointment reaches the cloud and restores identically', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openUploadedSource(remote);
    const run = worker(source, remote);

    insertAppointment(source, { ...upcoming, discount: { type: 'PERCENT', percent: 20 } });
    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(appointmentPayload(remote, upcoming.id)).toMatchObject({
      discount_percent: 20,
      discount_amount_cents: null,
    });

    const { db: restored } = await restoreFreshDevice(remote);
    expect(findAppointment(restored, upcoming.id)).toEqual(findAppointment(source, upcoming.id));
    expect(findAppointment(restored, upcoming.id)?.discount).toEqual({ type: 'PERCENT', percent: 20 });
    expect(loadSnapshot(restored).appointments).toEqual(loadSnapshot(source).appointments);
  });

  it('a fixed discount travels as exact integer cents and restores identically', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openUploadedSource(remote);
    const run = worker(source, remote);

    insertAppointment(source, upcoming);
    updateAppointmentDiscount(source, upcoming.id, { type: 'FIXED', amountCents: 1500 });
    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(appointmentPayload(remote, upcoming.id)).toMatchObject({
      discount_percent: null,
      discount_amount_cents: 1500,
    });

    const { db: restored } = await restoreFreshDevice(remote);
    expect(findAppointment(restored, upcoming.id)?.discount).toEqual({ type: 'FIXED', amountCents: 1500 });
    expect(
      restored.getAllSync('SELECT discount_percent, discount_amount_cents FROM appointments WHERE id = ?', [upcoming.id]),
    ).toEqual([{ discount_percent: null, discount_amount_cents: 1500 }]);
  });

  it('an edit and a removal on one device are pulled by the other; removal propagates as explicit NULLs', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();
    insertAppointment(a, upcoming);
    expect(await runA()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(await runB()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    const versionBefore = remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', upcoming.id)?.syncVersion ?? 0;

    updateAppointmentDiscount(b, upcoming.id, { type: 'PERCENT', percent: 10 });
    expect(await runB()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', upcoming.id)?.syncVersion).toBe(versionBefore + 1);
    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    expect(findAppointment(a, upcoming.id)?.discount).toEqual({ type: 'PERCENT', percent: 10 });
    expect(countSyncOutboxRows(a)).toBe(0);

    // Device A switches to a fixed amount, then removes the discount.
    updateAppointmentDiscount(a, upcoming.id, { type: 'FIXED', amountCents: 2500 });
    expect(await runA()).toMatchObject({ pushed: 1, conflicts: [] });
    updateAppointmentDiscount(a, upcoming.id, undefined);
    expect(await runA()).toMatchObject({ pushed: 1, conflicts: [] });
    expect(appointmentPayload(remote, upcoming.id)).toMatchObject({
      discount_percent: null,
      discount_amount_cents: null,
    });

    expect(await runB()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    const pulled = findAppointment(b, upcoming.id);
    expect(pulled).toEqual(upcoming);
    expect('discount' in pulled!).toBe(false);
  });

  it('an Appointment without a discount keeps syncing with explicit NULLs and restores without one', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openUploadedSource(remote);

    expect(appointmentPayload(remote, appointmentLea.id)).toMatchObject({
      discount_percent: null,
      discount_amount_cents: null,
    });
    const { db: restored } = await restoreFreshDevice(remote);
    const lea = findAppointment(restored, appointmentLea.id);
    expect(lea).toEqual(findAppointment(source, appointmentLea.id));
    expect('discount' in lea!).toBe(false);
  });
});

describe('conflicts — remote newer + local dirty', () => {
  it('reports the conflict and overwrites NEITHER side: local edit kept and pending, remote revision kept, version not acknowledged', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();
    const acknowledged = readAcknowledgedRemoteVersion(a, REMOTE_BUSINESS_ID, { aggregateType: 'SERVICE', aggregateId: serviceCut.id })!.remoteVersion;

    updateService(b, { ...serviceCut, businessId: REMOTE_BUSINESS_ID, price: 45 });
    expect(await runB()).toMatchObject({ pushed: 1 });
    const remoteVersion = remote.find(REMOTE_BUSINESS_ID, 'SERVICE', serviceCut.id)!.syncVersion;
    updateService(a, { ...serviceCut, businessId: REMOTE_BUSINESS_ID, name: 'Coupe signature' });

    const conflict = { aggregateType: 'SERVICE', aggregateId: serviceCut.id, operation: 'UPSERT', acknowledgedVersion: acknowledged, remoteVersion };
    const result = await runA();
    expect(result).toMatchObject({
      status: 'PUSHED',
      pushed: 0,
      conflicts: [conflict], // the push was refused by the remote…
      pull: { status: 'PULLED', applied: 0, conflicts: [conflict], cursorAdvanced: true }, // …and the pull did not overwrite the local edit
    });
    expect(didSyncRunChangeLocalData(result)).toBe(false);

    // Local side intact and still pending.
    const local = loadSnapshot(a).services.find((service) => service.id === serviceCut.id)!;
    expect([local.name, local.price]).toEqual(['Coupe signature', 42]);
    expect(loadSyncOutbox(a, REMOTE_BUSINESS_ID)).toMatchObject([{ aggregateType: 'SERVICE', aggregateId: serviceCut.id, lastError: 'CONFLICT' }]);
    // Remote side intact.
    const held = remote.find(REMOTE_BUSINESS_ID, 'SERVICE', serviceCut.id)!;
    expect([(held.payload as RemoteServicePayload).name, (held.payload as RemoteServicePayload).price_cents, held.syncVersion]).toEqual(['Coupe', 4500, remoteVersion]);
    // The unseen revision is NOT acknowledged: a later push cannot slip past it.
    expect(readAcknowledgedRemoteVersion(a, REMOTE_BUSINESS_ID, { aggregateType: 'SERVICE', aggregateId: serviceCut.id })?.remoteVersion).toBe(acknowledged);

    // Other aggregates of the same pull are unaffected by the conflict.
    updateClient(b, { ...clientLea, phone: '09 99' });
    expect(await runB()).toMatchObject({ pushed: 1 });
    expect(await runA()).toMatchObject({ pull: { applied: 1 } });
    expect(loadSnapshot(a).clients[0]?.phone).toBe('09 99');
  });

  it('a remote TOMBSTONE never removes an aggregate with a pending local change', async () => {
    const { remote, a, runA } = await openTwoDevices();
    remote.tombstoneFromElsewhere(REMOTE_BUSINESS_ID, 'PRODUCT', productSerum.id);
    setProductStock(a, productSerum.id, 3);

    const result = await runA();
    expect(result).toMatchObject({ pushed: 0, pull: { status: 'PULLED', deleted: 0, conflicts: [{ aggregateType: 'PRODUCT', aggregateId: productSerum.id, operation: 'UPSERT' }] } });
    expect(loadSnapshot(a).products.find((product) => product.id === productSerum.id)?.stockQuantity).toBe(3);
    expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', productSerum.id)?.deleted).toBe(true);
    expect(countSyncOutboxRows(a)).toBe(1);
  });

  it('a local DELETE meeting a remote edit is a conflict too: the remote row is neither tombstoned nor re-created locally', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();
    insertProduct(b, { id: 'product-shared', businessId: REMOTE_BUSINESS_ID, name: 'Partagé', price: 10, stockQuantity: 1, active: true });
    expect(await runB()).toMatchObject({ pushed: 1 });
    expect(await runA()).toMatchObject({ pull: { applied: 1 } });

    setProductStock(b, 'product-shared', 9);
    expect(await runB()).toMatchObject({ pushed: 1 });
    deleteProduct(a, 'product-shared');

    expect(await runA()).toMatchObject({
      conflicts: [{ aggregateType: 'PRODUCT', aggregateId: 'product-shared', operation: 'DELETE' }],
      pull: { applied: 0, conflicts: [{ aggregateId: 'product-shared', operation: 'DELETE' }] },
    });
    expect(loadSnapshot(a).products.map((product) => product.id)).not.toContain('product-shared');
    expect(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', 'product-shared')).toMatchObject({ deleted: false });
  });
});

describe('remote tombstones', () => {
  it('local clean: removes the local aggregate with its children, acknowledges the tombstone version, records nothing in the outbox', async () => {
    const { remote, a, b, runA, runB } = await openTwoDevices();
    deleteAppointment(b, appointmentCancelled.id);
    deleteProduct(b, productSerum.id);
    expect(await runB()).toMatchObject({ pushed: 2 });
    remote.clearRequests();

    const result = await runA();
    expect(result).toMatchObject({ pull: { status: 'PULLED', applied: 0, deleted: 2, failed: 0, conflicts: [] } });
    expect(didSyncRunChangeLocalData(result)).toBe(true);
    expect(loadSnapshot(a).appointments.map((appointment) => appointment.id)).toEqual([appointmentLea.id]);
    expect(a.getAllSync('SELECT 1 FROM appointment_items WHERE appointment_id = ?', [appointmentCancelled.id])).toEqual([]);
    expect(a.getAllSync('SELECT 1 FROM appointment_phases WHERE appointment_id = ?', [appointmentCancelled.id])).toEqual([]);
    expect(loadSnapshot(a).products.map((product) => product.id)).toEqual([productMask.id]);
    // History keeps its own snapshot of the deleted Product.
    expect(loadSnapshot(a).sales.find((sale) => sale.id === linkedSale.id)?.items[0]?.productName).toBe('Sérum');

    expect(readAcknowledgedRemoteVersion(a, REMOTE_BUSINESS_ID, { aggregateType: 'PRODUCT', aggregateId: productSerum.id })?.remoteVersion)
      .toBe(remote.find(REMOTE_BUSINESS_ID, 'PRODUCT', productSerum.id)!.syncVersion);
    expect(countSyncOutboxRows(a)).toBe(0);
    expect(remote.requests).toEqual([]); // the deletion is not echoed back as a DELETE push
    expect(await runA()).toMatchObject({ pushed: 0, pull: { deleted: 0 } });
  });

  it('a tombstone of an aggregate this device never held is simply acknowledged', async () => {
    const { remote, a, runA } = await openTwoDevices();
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', 'client-brief', { first_name: 'Bref', last_name: null, phone: null, email: null, birthday: null, notes: null, photo_path: null, sms_marketing_consent: null, sms_marketing_consent_updated_at: null, sms_marketing_consent_source: null, archived_at: null });
    const version = remote.tombstoneFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', 'client-brief');

    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', applied: 0, deleted: 0, skipped: expect.any(Number), failed: 0 } });
    expect(loadSnapshot(a).clients.map((client) => client.id)).not.toContain('client-brief');
    expect(readAcknowledgedRemoteVersion(a, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: 'client-brief' })?.remoteVersion).toBe(version);
  });

  it('follows the local deletion guards: a Client still referenced by history, or a paid Appointment, is NOT removed — integrity wins', async () => {
    const { remote, a, runA } = await openTwoDevices();
    const cursor = readSyncPullCursor(a, REMOTE_BUSINESS_ID);
    remote.tombstoneFromElsewhere(REMOTE_BUSINESS_ID, 'CLIENT', clientLea.id);
    remote.tombstoneFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id);

    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', deleted: 0, failed: 2, cursorAdvanced: false } });
    expect(loadSnapshot(a).clients.map((client) => client.id)).toContain(clientLea.id);
    expect(loadSnapshot(a).appointments.find((appointment) => appointment.id === appointmentLea.id)?.payment).toBeDefined();
    expect(readSyncPullCursor(a, REMOTE_BUSINESS_ID)).toEqual(cursor); // held: fetched again next time
    expect(countSyncOutboxRows(a)).toBe(0);
  });

  it('a Client and the Appointments that referenced it, deleted elsewhere, are removed in ONE pull (reverse dependency order)', async () => {
    const { a, b, runA, runB } = await openTwoDevices();
    insertClient(b, { id: 'client-temp', firstName: 'Temp' });
    insertAppointment(b, { ...appointmentCancelled, id: 'appointment-temp', businessId: REMOTE_BUSINESS_ID, clientId: 'client-temp' });
    expect(await runB()).toMatchObject({ pushed: 2 });
    expect(await runA()).toMatchObject({ pull: { applied: 2 } });

    deleteAppointment(b, 'appointment-temp');
    deleteClientPermanently(b, 'client-temp');
    expect(await runB()).toMatchObject({ pushed: 2 });

    expect(await runA()).toMatchObject({ pull: { status: 'PULLED', deleted: 2, failed: 0, cursorAdvanced: true } });
    expect(loadSnapshot(a).clients.map((client) => client.id)).not.toContain('client-temp');
    expect(withoutImages(loadSnapshot(a))).toEqual(withoutImages(loadSnapshot(b)));
  });
});

describe('remote snapshot validation', () => {
  const base = { pulled_at: '2026-09-18T09:00:00.000Z', clients: [], services: [], products: [], appointments: [], sales: [] };

  it('normalizes any timestamptz rendering to the local ISO form, to the millisecond', () => {
    const snapshot = parseRemoteBusinessSnapshot({
      ...base,
      pulled_at: '2026-09-18T11:00:00.123456+02:00',
      clients: [{ id: 'c', sync_version: 3, deleted_at: null, first_name: 'Léa', archived_at: '2026-09-13T08:00:00.5+00:00' }],
    });
    expect(snapshot.pulledAt).toEqual(new Date('2026-09-18T09:00:00.123Z'));
    expect(snapshot.clients[0]).toEqual({
      id: 'c',
      syncVersion: 3,
      payload: { first_name: 'Léa', last_name: null, phone: null, email: null, birthday: null, notes: null, photo_path: null, sms_marketing_consent: null, sms_marketing_consent_updated_at: null, sms_marketing_consent_source: null, archived_at: '2026-09-13T08:00:00.500Z' },
    });
  });

  it('a tombstone carries no payload: its columns and children are never read as live data', () => {
    const snapshot = parseRemoteBusinessSnapshot({
      ...base,
      services: [{ id: 's', sync_version: 9, deleted_at: '2026-09-18T08:00:00.000Z', name: 42, phases: 'garbage' }],
    });
    expect(snapshot.services).toEqual([{ id: 's', syncVersion: 9, payload: undefined }]);
  });

  it('reads a Client row written before the notes column existed: no key means no note', () => {
    const snapshot = parseRemoteBusinessSnapshot({
      ...base,
      clients: [
        { id: 'old', sync_version: 3, deleted_at: null, first_name: 'Léa', birthday: '02-29' },
        { id: 'new', sync_version: 1, deleted_at: null, first_name: 'Nour', birthday: null, notes: 'Ligne 1\nLigne 2' },
      ],
    });

    expect(snapshot.clients.map((client) => client.payload)).toEqual([
      { first_name: 'Léa', last_name: null, phone: null, email: null, birthday: '02-29', notes: null, photo_path: null, sms_marketing_consent: null, sms_marketing_consent_updated_at: null, sms_marketing_consent_source: null, archived_at: null },
      { first_name: 'Nour', last_name: null, phone: null, email: null, birthday: null, notes: 'Ligne 1\nLigne 2', photo_path: null, sms_marketing_consent: null, sms_marketing_consent_updated_at: null, sms_marketing_consent_source: null, archived_at: null },
    ]);
  });

  it('reads an Appointment row written before the discount columns existed: no key means no discount', () => {
    const row = {
      sync_version: 2,
      deleted_at: null,
      client_id: 'client-lea',
      staff_member_id: 'staff-amelie',
      start_at: '2026-09-25T08:00:00.000Z',
      status: 'SCHEDULED',
      items: [],
    };
    const snapshot = parseRemoteBusinessSnapshot({
      ...base,
      appointments: [
        { ...row, id: 'old' },
        { ...row, id: 'percent', discount_percent: 20, discount_amount_cents: null },
        { ...row, id: 'fixed', discount_percent: null, discount_amount_cents: 1500 },
      ],
    });

    expect(
      snapshot.appointments.map(({ payload }) => [payload?.discount_percent, payload?.discount_amount_cents]),
    ).toEqual([
      [null, null],
      [20, null],
      [null, 1500],
    ]);
  });

  it('accepts the two ends of the percentage range, 1 and 50', () => {
    const row = {
      sync_version: 1,
      deleted_at: null,
      client_id: 'client-lea',
      staff_member_id: 'staff-amelie',
      start_at: '2026-09-25T08:00:00.000Z',
      status: 'SCHEDULED',
      items: [],
    };
    const snapshot = parseRemoteBusinessSnapshot({
      ...base,
      appointments: [
        { ...row, id: 'min', discount_percent: 1 },
        { ...row, id: 'max', discount_percent: 50 },
      ],
    });
    expect(snapshot.appointments.map(({ payload }) => payload?.discount_percent)).toEqual([1, 50]);
  });

  it.each([
    ['discount_percent', { discount_percent: 0 }],
    ['discount_percent', { discount_percent: 51 }],
    ['discount_percent', { discount_percent: 100 }],
    ['discount_percent', { discount_percent: 12.5 }],
    ['discount_amount_cents', { discount_amount_cents: 0 }],
    ['discount_amount_cents', { discount_amount_cents: -500 }],
    ['discount_amount_cents', { discount_percent: 20, discount_amount_cents: 1500 }],
  ])('refuses an invalid remote discount (%s)', (field, discount) => {
    const attempt = () =>
      parseRemoteBusinessSnapshot({
        ...base,
        appointments: [
          {
            id: 'a',
            sync_version: 1,
            deleted_at: null,
            client_id: 'client-lea',
            staff_member_id: 'staff-amelie',
            start_at: '2026-09-25T08:00:00.000Z',
            status: 'SCHEDULED',
            items: [],
            ...discount,
          },
        ],
      });
    expect(attempt).toThrow(RemoteSnapshotInvalidError);
    expect(attempt).toThrow(field);
  });

  it('names the offending field, never a value', () => {
    const secret = 'Madame Très-Privée 06 00 00 00 00';
    const attempt = () =>
      parseRemoteBusinessSnapshot({ ...base, clients: [{ id: 'c', sync_version: 1, deleted_at: null, first_name: 'x', last_name: { oops: secret } }] });
    expect(attempt).toThrow(RemoteSnapshotInvalidError);
    try {
      attempt();
    } catch (error) {
      expect((error as RemoteSnapshotInvalidError).field).toBe('clients[].last_name');
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it.each([
    ['an unknown status', { appointments: [{ id: 'a', sync_version: 1, deleted_at: null, client_id: 'c', staff_member_id: 's', start_at: '2026-09-18T09:00:00.000Z', status: 'DONE', items: [] }] }],
    ['a cancellation without its actor', { appointments: [{ id: 'a', sync_version: 1, deleted_at: null, client_id: 'c', staff_member_id: 's', start_at: '2026-09-18T09:00:00.000Z', status: 'CANCELLED', cancelled_at: '2026-09-18T09:00:00.000Z', items: [] }] }],
    ['a paid Appointment-linked Sale', { sales: [{ id: 's', sync_version: 1, deleted_at: null, client_id: null, appointment_id: 'a', completed_at: '2026-09-18T09:00:00.000Z', paid_at: '2026-09-18T09:00:00.000Z', card_amount_cents: 1, cash_amount_cents: 0, items: [] }] }],
    ['a zero quantity', { sales: [{ id: 's', sync_version: 1, deleted_at: null, client_id: null, appointment_id: null, completed_at: '2026-09-18T09:00:00.000Z', items: [{ id: 'i', position: 0, product_id: 'p', product_name: 'P', unit_price_cents: 1, quantity: 0 }] }] }],
    ['negative stock', { products: [{ id: 'p', sync_version: 1, deleted_at: null, name: 'P', price_cents: 1, stock_quantity: -1, active: true }] }],
    ['a note that is not text', { clients: [{ id: 'c', sync_version: 1, deleted_at: null, first_name: 'L', notes: 42 }] }],
    ['an unreadable birthday', { clients: [{ id: 'c', sync_version: 1, deleted_at: null, first_name: 'L', birthday: '13-40' }] }],
    ['an invalid instant', { clients: [{ id: 'c', sync_version: 1, deleted_at: null, first_name: 'L', archived_at: 'yesterday' }] }],
    ['a missing family', { sales: undefined }],
  ])('refuses %s', (_label, override) => {
    expect(() => parseRemoteBusinessSnapshot({ ...base, ...override })).toThrow(RemoteSnapshotInvalidError);
  });
});

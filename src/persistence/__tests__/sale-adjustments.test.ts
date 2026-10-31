// BeautIzzy — Sale adjustments (corrections and refunds) in SQLite and through the sync
// (docs/domain/SALES.md §15, docs/architecture/CLOUD_SYNC.md §28): schema v18 on a populated
// v17 database, the transactional store, and the SALE_ADJUSTMENT aggregate — push, deferral
// in front of an unmigrated remote, server-side ceilings across two devices, pull, restore.

import { getCashRegisterDaySummary } from '@/domain/cash-register';
import {
  prepareSaleAdjustment,
  type Sale,
  type SaleAdjustmentDraft,
} from '@/domain/sales';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { readMetadata } from '../metadata';
import { readSchemaVersion } from '../migrations';
import { migrations } from '../schema';
import { checkoutAppointment } from '../stores/appointments';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { findProduct } from '../stores/products';
import {
  loadSaleAdjustments,
  recordSaleAdjustment,
  reverseStoredSaleAdjustment,
  SaleAdjustmentConflictError,
  SaleAdjustmentDraftError,
  settleStoredSaleAdjustment,
  voidStoredSaleAdjustment,
} from '../stores/sale-adjustments';
import {
  AppointmentProductDeleteConflictError,
  completeSale,
  deleteAppointmentProduct,
  findSale,
  loadSales,
} from '../stores/sales';
import { approveInitialRestore, approveInitialUpload } from '../sync/bootstrap';
import { loadSyncOutbox, markAggregateDeleted, markAggregateUpserted } from '../sync/outbox';
import { SYNC_PULL_CURSOR_KEY } from '../sync/pull-cursor';
import { createSyncPushWorker } from '../sync/push-worker';
import { applyRemoteTombstone } from '../sync/remote-apply';
import {
  assertSnapshotReferences,
  parseRemoteBusinessSnapshot,
  RemoteSnapshotInvalidError,
} from '../sync/remote-snapshot';
import {
  isSaleAdjustmentRemoteReady,
  readSaleAdjustmentSyncStates,
  SALE_ADJUSTMENT_REMOTE_KEY,
} from '../sync/sale-adjustment-sync';
import { readAcknowledgedRemoteVersion } from '../sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '../testing/fake-sync-remote';
import {
  appointmentLea,
  clientLea,
  createTestSeed,
  productMask,
  productSerum,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const SALE_AT = new Date('2026-10-12T10:00:00.000Z');
const NOW = new Date('2026-10-14T15:00:00.000Z');
const REFUNDED_AT = new Date('2026-10-13T09:00:00.000Z');

/** Masque 2 × 50 € + Sérum 1 × 32 € = 132 €, paid 100 € card + 32 € cash. */
const directSale: Sale = {
  id: 'sale-direct',
  businessId: REMOTE_BUSINESS_ID,
  clientId: clientLea.id,
  completedAt: SALE_AT,
  items: [
    { id: 'sale-direct-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 2 },
    { id: 'sale-direct-item-1', productId: productSerum.id, productName: 'Sérum', unitPrice: 32, quantity: 1 },
  ],
  payment: { paidAt: SALE_AT, cardAmountCents: 10000, cashAmountCents: 3200 },
};

function seededDatabase(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

function sell(db: SourisDatabase, sale: Sale = directSale): void {
  const decrements = new Map<string, number>();
  for (const item of sale.items) decrements.set(item.productId, (decrements.get(item.productId) ?? 0) + item.quantity);
  completeSale(db, sale, [...decrements].map(([productId, quantity]) => ({ productId, quantity })));
}

function draft(overrides: Partial<SaleAdjustmentDraft> = {}): SaleAdjustmentDraft {
  return {
    id: 'adj-1',
    businessId: REMOTE_BUSINESS_ID,
    staffMemberId: 'staff-amelie',
    reason: 'WRONG_PRODUCT',
    lines: [{ saleItemId: 'sale-direct-item-1', quantity: 1, restock: true }],
    refundCardCents: 0,
    refundCashCents: 3200,
    settlement: 'SETTLED',
    refundedAt: REFUNDED_AT,
    ...overrides,
  };
}

/** The session's path: prepare against the in-memory state, then the store re-checks the stored rows. */
function record(db: SourisDatabase, overrides: Partial<SaleAdjustmentDraft> = {}, now = NOW) {
  const value = draft(overrides);
  const sale = findSale(db, directSale.id) ?? loadSales(db)[0]!;
  const prepared = prepareSaleAdjustment(
    { sale, adjustments: loadSaleAdjustments(db), appointmentSettled: true, productExists: () => true, now },
    value,
  );
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.issues));
  return recordSaleAdjustment(db, value, prepared.adjustment, prepared.restorations, now);
}

describe('schema v18 on a populated v17 database', () => {
  it('creates two empty tables, keeps every Sale and the sync bookkeeping, and clears the pull cursor', () => {
    const db = openTestDatabase();
    db.withTransactionSync(() => {
      for (const migration of migrations.filter((candidate) => candidate.version <= 17)) migration.up(db);
      db.execSync('PRAGMA user_version = 17');
    });
    db.runSync(
      "INSERT INTO sales (id, business_id, client_id, appointment_id, completed_at, paid_at, card_amount_cents, cash_amount_cents) VALUES ('sale-legacy', 'business-a', NULL, NULL, '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z', 2500, 0)",
    );
    db.runSync(
      "INSERT INTO sale_items (sale_id, id, position, product_id, product_name, unit_price_cents, quantity) VALUES ('sale-legacy', 'sale-legacy-item-0', 0, 'p', 'Shampooing', 2500, 1)",
    );
    db.runSync(
      "INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at, attempt_count, last_error, next_attempt_at) VALUES ('business-a', 'SALE', 'sale-legacy', 'UPSERT', 2, '2026-09-01T10:00:00.000Z', '2026-09-01T10:01:00.000Z', 1, 'NETWORK', NULL)",
    );
    db.runSync(
      "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES ('business-a', 'SERVICE_CATEGORY', 'cat-1', 3, '2026-09-01T10:00:00.000Z')",
    );
    db.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1'), ('sync_pull_cursor', '{}')");
    const salesBefore = db.getAllSync('SELECT * FROM sales');
    const itemsBefore = db.getAllSync('SELECT * FROM sale_items');
    const outboxBefore = db.getAllSync('SELECT * FROM sync_outbox');
    const stateBefore = db.getAllSync('SELECT * FROM sync_state');

    bootstrapPersistence(db, createTestSeed);

    expect(readSchemaVersion(db)).toBe(18);
    expect(db.getAllSync('SELECT * FROM sales')).toEqual(salesBefore);
    expect(db.getAllSync('SELECT * FROM sale_items')).toEqual(itemsBefore);
    expect(db.getAllSync('SELECT * FROM sync_outbox')).toEqual(outboxBefore);
    expect(db.getAllSync('SELECT * FROM sync_state')).toEqual(stateBefore);
    expect(db.getAllSync('SELECT * FROM sale_adjustments')).toEqual([]);
    expect(db.getAllSync('SELECT * FROM sale_adjustment_items')).toEqual([]);
    expect(readMetadata(db, SYNC_PULL_CURSOR_KEY)).toBeUndefined();
    expect(readMetadata(db, SALE_ADJUSTMENT_REMOTE_KEY)).toBeUndefined();
    // The legacy Sale is still read exactly as before, and the new vocabulary is accepted.
    expect(loadSnapshot(db).sales.map((sale) => sale.id)).toEqual(['sale-legacy']);
    expect(loadSnapshot(db).saleAdjustments).toEqual([]);
    db.runSync(
      "INSERT INTO sync_outbox (business_id, aggregate_type, aggregate_id, operation, revision, created_at, updated_at) VALUES ('business-a', 'SALE_ADJUSTMENT', 'adj', 'UPSERT', 1, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')",
    );
  });
});

describe('Sale adjustment store', () => {
  it('records a refund and its restock in ONE transaction, never touching the Sale, and marks both aggregates', () => {
    const db = seededDatabase();
    sell(db);
    const saleRowBefore = db.getAllSync('SELECT * FROM sales');
    const linesBefore = db.getAllSync('SELECT * FROM sale_items');
    expect(findProduct(db, productSerum.id)?.stockQuantity).toBe(0);

    const { adjustment } = record(db);

    expect(findProduct(db, productSerum.id)?.stockQuantity).toBe(1);
    expect(db.getAllSync('SELECT * FROM sales')).toEqual(saleRowBefore);
    expect(db.getAllSync('SELECT * FROM sale_items')).toEqual(linesBefore);
    expect(loadSaleAdjustments(db)).toEqual([adjustment]);
    expect(loadSnapshot(db).saleAdjustments).toEqual([adjustment]);
    expect(
      loadSyncOutbox(db, REMOTE_BUSINESS_ID)
        .filter((entry) => entry.aggregateType === 'SALE_ADJUSTMENT' || entry.aggregateId === productSerum.id)
        .map((entry) => `${entry.aggregateType}/${entry.aggregateId}`),
    ).toEqual(expect.arrayContaining([`PRODUCT/${productSerum.id}`, 'SALE_ADJUSTMENT/adj-1']));
  });

  it('refuses a duplicate submission (double tap, retried call): one record, one restock', () => {
    const db = seededDatabase();
    sell(db);
    const value = draft();
    const prepared = prepareSaleAdjustment(
      { sale: directSale, adjustments: [], appointmentSettled: true, productExists: () => true, now: NOW },
      value,
    );
    if (!prepared.ok) throw new Error('prepared');
    recordSaleAdjustment(db, value, prepared.adjustment, prepared.restorations, NOW);
    // The very same prepared record again (a second tap before the state refreshed, a retry).
    let caught: unknown;
    try {
      recordSaleAdjustment(db, value, prepared.adjustment, prepared.restorations, NOW);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SaleAdjustmentConflictError);
    expect((caught as SaleAdjustmentConflictError).reason).toBe('DUPLICATE_ADJUSTMENT');
    expect(loadSaleAdjustments(db)).toHaveLength(1);
    expect(findProduct(db, productSerum.id)?.stockQuantity).toBe(1);
  });

  it('re-checks the STORED ceilings: a stale draft cannot over-refund money or units', () => {
    const db = seededDatabase();
    sell(db);
    record(db, { lines: [], refundCardCents: 10000, refundCashCents: 3000 });
    // Prepared against a stale state that knows no refund yet: the store refuses it.
    const stale = draft({ id: 'adj-2', lines: [], refundCardCents: 300, refundCashCents: 0 });
    const prepared = prepareSaleAdjustment(
      { sale: directSale, adjustments: [], appointmentSettled: true, productExists: () => true, now: NOW },
      stale,
    );
    if (!prepared.ok) throw new Error('prepared');
    let caught: unknown;
    try {
      recordSaleAdjustment(db, stale, prepared.adjustment, prepared.restorations, NOW);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SaleAdjustmentDraftError);
    expect((caught as SaleAdjustmentDraftError).issues).toEqual([
      { kind: 'AMOUNT_EXCEEDS_REMAINING', requested: 300, remaining: 200 },
    ]);
    expect(loadSaleAdjustments(db)).toHaveLength(1);
  });

  it('a Product no longer in the catalogue aborts a restock — nothing is written', () => {
    const db = seededDatabase();
    sell(db);
    db.runSync('DELETE FROM products WHERE id = ?', [productSerum.id]);
    const value = draft();
    const prepared = prepareSaleAdjustment(
      { sale: directSale, adjustments: [], appointmentSettled: true, productExists: () => true, now: NOW },
      value,
    );
    if (!prepared.ok) throw new Error('prepared');
    expect(() => recordSaleAdjustment(db, value, prepared.adjustment, prepared.restorations, NOW)).toThrow(
      SaleAdjustmentDraftError,
    );
    expect(loadSaleAdjustments(db)).toEqual([]);
  });

  it('settles a PENDING refund once; voids a PENDING one and takes its restock back; never voids a SETTLED one', () => {
    const db = seededDatabase();
    sell(db);
    const pending = record(db, { settlement: 'PENDING', refundedAt: undefined }).adjustment;
    expect(pending.status).toBe('PENDING');
    const settled = settleStoredSaleAdjustment(db, pending.id, REFUNDED_AT, NOW);
    expect(settled).toMatchObject({ status: 'SETTLED', refundedAt: REFUNDED_AT, settledAt: NOW, recordedAt: NOW });
    expect(() => settleStoredSaleAdjustment(db, pending.id, REFUNDED_AT, NOW)).toThrow(SaleAdjustmentConflictError);
    expect(() => voidStoredSaleAdjustment(db, pending.id, NOW)).toThrow(SaleAdjustmentConflictError);

    const second = record(db, {
      id: 'adj-2',
      lines: [{ saleItemId: 'sale-direct-item-0', quantity: 1, restock: true }],
      refundCardCents: 5000,
      refundCashCents: 0,
      settlement: 'PENDING',
      refundedAt: undefined,
    }).adjustment;
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(4);
    const voided = voidStoredSaleAdjustment(db, second.id, NOW);
    expect(voided.adjustment.status).toBe('VOIDED');
    expect(findProduct(db, productMask.id)?.stockQuantity).toBe(3);
  });

  it('reverses a SETTLED refund with ONE compensating record and takes its restock back', () => {
    const db = seededDatabase();
    sell(db);
    record(db);
    const input = { id: 'rev-1', staffMemberId: 'staff-amelie', reason: 'RECORDED_IN_ERROR' as const, now: new Date('2026-10-20T09:00:00.000Z') };
    const reversal = reverseStoredSaleAdjustment(db, 'adj-1', input);
    expect(reversal.adjustment).toMatchObject({
      kind: 'REVERSAL',
      reason: 'RECORDED_IN_ERROR',
      reversesAdjustmentId: 'adj-1',
      refundCashCents: 3200,
      refundedAt: REFUNDED_AT,
    });
    expect(findProduct(db, productSerum.id)?.stockQuantity).toBe(0);
    expect(() => reverseStoredSaleAdjustment(db, 'adj-1', { ...input, id: 'rev-2' })).toThrow(SaleAdjustmentConflictError);
    expect(loadSaleAdjustments(db).map((adjustment) => adjustment.status)).toEqual(['SETTLED', 'SETTLED']);
  });

  it('a voided restock never makes stock negative: refused while the units were sold again', () => {
    const db = seededDatabase();
    sell(db);
    record(db, { settlement: 'PENDING', refundedAt: undefined });
    db.runSync('UPDATE products SET stock_quantity = 0 WHERE id = ?', [productSerum.id]);
    expect(() => voidStoredSaleAdjustment(db, 'adj-1', NOW)).toThrow(SaleAdjustmentConflictError);
    expect(loadSaleAdjustments(db)[0]?.status).toBe('PENDING');
  });

  it('a Revente is refundable only once its Appointment received its money; it is then no longer removable', () => {
    const db = seededDatabase();
    const revente: Sale = {
      id: 'sale-revente',
      businessId: REMOTE_BUSINESS_ID,
      clientId: clientLea.id,
      appointmentId: appointmentLea.id,
      completedAt: SALE_AT,
      items: [{ id: 'sale-revente-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 1 }],
    };
    sell(db, revente);
    const value = draft({
      lines: [{ saleItemId: 'sale-revente-item-0', quantity: 1, restock: false }],
      refundCardCents: 5000,
      refundCashCents: 0,
    });
    const prepare = () => {
      const prepared = prepareSaleAdjustment(
        { sale: revente, adjustments: [], appointmentSettled: true, productExists: () => true, now: NOW },
        value,
      );
      if (!prepared.ok) throw new Error('prepared');
      return prepared;
    };
    const first = prepare();
    // The stored Appointment is not settled yet: refused.
    expect(() => recordSaleAdjustment(db, value, first.adjustment, first.restorations, NOW)).toThrow(SaleAdjustmentDraftError);

    checkoutAppointment(db, appointmentLea.id, { paidAt: SALE_AT, cardAmountCents: 18500, cashAmountCents: 0 });
    // Settled: the product can no longer be removed destructively from Details.
    expect(() =>
      deleteAppointmentProduct(db, appointmentLea.id, { productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50 }),
    ).toThrow(AppointmentProductDeleteConflictError);

    const second = prepare();
    recordSaleAdjustment(db, value, second.adjustment, second.restorations, NOW);
    // The Appointment payment is untouched: 185 € on the sale day, −50 € on the refund day.
    const sources = {
      appointments: loadSnapshot(db).appointments,
      sales: loadSales(db),
      saleAdjustments: loadSaleAdjustments(db),
    };
    expect(getCashRegisterDaySummary(sources, SALE_AT).totalCents).toBe(18500);
    expect(getCashRegisterDaySummary(sources, REFUNDED_AT)).toMatchObject({
      totalCents: -5000,
      cardCents: -5000,
      checkoutCount: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

function worker(db: SourisDatabase, remote: FakeSyncRemote) {
  const instance = createSyncPushWorker({ database: db, gateway: remote, now: () => NOW });
  return () => instance.run(REMOTE_BUSINESS_ID);
}

async function openSyncedDevice(remote: FakeSyncRemote) {
  const db = seededDatabase();
  expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
  const run = worker(db, remote);
  sell(db);
  expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', failed: 0 });
  remote.clearRequests();
  return { db, run };
}

async function openRestoredDevice(remote: FakeSyncRemote) {
  const db = openTestDatabase();
  bootstrapPersistence(db, () => createTestSeed({ clients: [], services: [], products: [], appointments: [] }));
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  const run = worker(db, remote);
  expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
  expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
  expect(await run()).toMatchObject({ status: 'RESTORED' });
  remote.clearRequests();
  return { db, run };
}

const ADJ_REF = { aggregateType: 'SALE_ADJUSTMENT', aggregateId: 'adj-1' } as const;

describe('SALE_ADJUSTMENT sync', () => {
  it('pushes the record after its Sale and the restocked Product, with exact cents and instants', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);

    record(db);
    expect(await run()).toMatchObject({ status: 'PUSHED', failed: 0, conflicts: [] });

    expect(remote.requests.map((request) => request.aggregateType)).toEqual(['PRODUCT', 'SALE_ADJUSTMENT']);
    expect(remote.requests[1]?.payload).toEqual({
      sale_id: 'sale-direct',
      kind: 'REFUND',
      reverses_adjustment_id: null,
      reason: 'WRONG_PRODUCT',
      note: null,
      staff_member_id: 'staff-amelie',
      refund_card_cents: 0,
      refund_cash_cents: 3200,
      initial_status: 'SETTLED',
      status: 'SETTLED',
      refunded_at: REFUNDED_AT.toISOString(),
      settled_at: NOW.toISOString(),
      voided_at: null,
      recorded_at: NOW.toISOString(),
      items: [
        {
          id: 'adj-1-item-0',
          position: 0,
          sale_item_id: 'sale-direct-item-1',
          product_id: productSerum.id,
          product_name: 'Sérum',
          unit_price_cents: 3200,
          quantity: 1,
          restock: true,
        },
      ],
    });
    expect(readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, ADJ_REF)?.remoteVersion).toBe(1);
    expect(readSaleAdjustmentSyncStates(db).get('adj-1')).toBe('SYNCED');
  });

  it('a lost acknowledgement is replayed idempotently: one remote record, version 1', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);
    record(db);
    remote.loseNextResponse();
    await run(); // the PRODUCT push loses its answer and the run stops
    await run();
    await run();
    expect(remote.find(REMOTE_BUSINESS_ID, 'SALE_ADJUSTMENT', 'adj-1')?.syncVersion).toBe(1);
    expect(remote.list(REMOTE_BUSINESS_ID).filter((row) => row.key.startsWith('SALE_ADJUSTMENT/'))).toHaveLength(1);
  });

  it('offline: settle after a pending record coalesces into ONE pending entry of the current state', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);
    record(db, { settlement: 'PENDING', refundedAt: undefined });
    settleStoredSaleAdjustment(db, 'adj-1', REFUNDED_AT, NOW);
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).filter((entry) => entry.aggregateType === 'SALE_ADJUSTMENT')).toHaveLength(1);
    expect(readSaleAdjustmentSyncStates(db).get('adj-1')).toBe('PENDING');
    await run();
    expect((remote.find(REMOTE_BUSINESS_ID, 'SALE_ADJUSTMENT', 'adj-1')?.payload as { status: string }).status).toBe('SETTLED');
  });

  it('defers every adjustment in front of a remote that predates them: never sent, never acknowledged, then sent', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID], { saleAdjustments: false });
    const { db, run } = await openSyncedDevice(remote);
    expect(isSaleAdjustmentRemoteReady(db)).toBe(false);
    record(db);
    await run();
    expect(remote.requests.some((request) => request.aggregateType === 'SALE_ADJUSTMENT')).toBe(false);
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).find((entry) => entry.aggregateType === 'SALE_ADJUSTMENT')).toMatchObject({
      lastError: 'REMOTE_SCHEMA_PENDING',
    });
    expect(readSaleAdjustmentSyncStates(db).get('adj-1')).toBe('PENDING');

    remote.setSaleAdjustments(true);
    await run(); // the pull proves the migration; the deferral is released
    expect(isSaleAdjustmentRemoteReady(db)).toBe(true);
    await run();
    expect(remote.find(REMOTE_BUSINESS_ID, 'SALE_ADJUSTMENT', 'adj-1')).toBeDefined();
  });

  it('two devices refunding the same Sale offline: the second over-refund is REFUSED by the remote, kept and resolvable', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const first = await openSyncedDevice(remote);
    const second = await openRestoredDevice(remote);
    await first.run();
    await second.run();

    // 132 € received. Device A refunds 100 €, device B refunds 100 € — both locally valid.
    record(first.db, { lines: [], refundCardCents: 10000, refundCashCents: 0 });
    const prepared = prepareSaleAdjustment(
      {
        sale: findSale(second.db, directSale.id)!,
        adjustments: loadSaleAdjustments(second.db),
        appointmentSettled: true,
        productExists: () => true,
        now: NOW,
      },
      draft({ id: 'adj-b', lines: [], refundCardCents: 10000, refundCashCents: 0 }),
    );
    if (!prepared.ok) throw new Error('prepared');
    recordSaleAdjustment(second.db, draft({ id: 'adj-b', lines: [], refundCardCents: 10000, refundCashCents: 0 }), prepared.adjustment, prepared.restorations, NOW);

    expect(await first.run()).toMatchObject({ failed: 0 });
    const refused = await second.run();
    expect(refused).toMatchObject({
      adjustmentConflicts: [
        { aggregateType: 'SALE_ADJUSTMENT', aggregateId: 'adj-b', saleId: 'sale-direct', reason: 'CEILING' },
      ],
    });
    expect(remote.find(REMOTE_BUSINESS_ID, 'SALE_ADJUSTMENT', 'adj-b')).toBeUndefined();
    // Kept on device B, never presented as synchronized.
    expect(loadSaleAdjustments(second.db).map((adjustment) => adjustment.id)).toContain('adj-b');
    expect(readSaleAdjustmentSyncStates(second.db).get('adj-b')).toBe('REFUSED');

    // Resolution: B voids its refused (settled) record explicitly; the VOIDED record syncs as history.
    expect(voidStoredSaleAdjustment(second.db, 'adj-b', NOW).adjustment.status).toBe('VOIDED');
    await second.run();
    await second.run();
    expect((remote.find(REMOTE_BUSINESS_ID, 'SALE_ADJUSTMENT', 'adj-b')?.payload as { status: string }).status).toBe('VOIDED');
    expect(readSaleAdjustmentSyncStates(second.db).get('adj-b')).toBe('SYNCED');
    // And B received A's refund through the pull, without moving its stock.
    expect(loadSaleAdjustments(second.db).map((adjustment) => adjustment.id).sort()).toEqual(['adj-1', 'adj-b']);
  });

  it('the remote refuses a change of a settled record (immutability), even from a stale device', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);
    record(db);
    await run();
    const stored = remote.find(REMOTE_BUSINESS_ID, 'SALE_ADJUSTMENT', 'adj-1')!;
    const result = await remote.pushAggregate({
      businessId: REMOTE_BUSINESS_ID,
      aggregateType: 'SALE_ADJUSTMENT',
      aggregateId: 'adj-1',
      operation: 'UPSERT',
      expectedVersion: stored.syncVersion,
      payload: { ...(stored.payload as object), status: 'PENDING', refunded_at: null, settled_at: null } as never,
    });
    expect(result).toEqual({ status: 'ADJUSTMENT_CONFLICT', saleId: 'sale-direct', reason: 'IMMUTABLE' });
  });

  it('a fresh device restores the adjustments with the Sale, never moves stock for them, and counts the same Caisse', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);
    record(db);
    await run();
    await run();

    const restored = await openRestoredDevice(remote);
    expect(loadSaleAdjustments(restored.db)).toEqual(loadSaleAdjustments(db));
    expect(findProduct(restored.db, productSerum.id)?.stockQuantity).toBe(findProduct(db, productSerum.id)?.stockQuantity);
    expect(isSaleAdjustmentRemoteReady(restored.db)).toBe(true);
    const sources = (database: SourisDatabase) => ({
      appointments: [],
      sales: loadSales(database),
      saleAdjustments: loadSaleAdjustments(database),
    });
    expect(getCashRegisterDaySummary(sources(restored.db), REFUNDED_AT)).toEqual(
      getCashRegisterDaySummary(sources(db), REFUNDED_AT),
    );
  });

  it('a remote Sale tombstone never removes a Sale that holds an adjustment', () => {
    const db = seededDatabase();
    sell(db);
    record(db);
    expect(applyRemoteTombstone(db, { aggregateType: 'SALE', aggregateId: 'sale-direct' })).toBe('BLOCKED');
    expect(findSale(db, 'sale-direct')).toBeDefined();
  });

  it('never pushes a row stamped with another Business (isolation)', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedDevice(remote);
    record(db);
    db.runSync("UPDATE sale_adjustments SET business_id = 'another-business' WHERE id = 'adj-1'");
    await run();
    expect(remote.find(REMOTE_BUSINESS_ID, 'SALE_ADJUSTMENT', 'adj-1')).toBeUndefined();
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID).find((entry) => entry.aggregateType === 'SALE_ADJUSTMENT')).toMatchObject({
      lastError: 'LOCAL_INVALID',
    });
  });
});

describe('pulled sale adjustments are validated before any write', () => {
  const base = {
    id: 'adj-remote',
    sync_version: 1,
    deleted_at: null,
    sale_id: 'sale-direct',
    kind: 'REFUND',
    reverses_adjustment_id: null,
    reason: 'RETURN',
    note: null,
    staff_member_id: 'staff-amelie',
    refund_card_cents: 1000,
    refund_cash_cents: 0,
    initial_status: 'PENDING',
    status: 'PENDING',
    refunded_at: null,
    settled_at: null,
    voided_at: null,
    recorded_at: '2026-10-14T10:00:00.000Z',
    items: [],
  };
  const wire = (adjustments: unknown) => ({
    pulled_at: '2026-10-14T12:00:00.000Z',
    clients: [],
    services: [],
    products: [],
    appointments: [],
    sales: [],
    sale_adjustments: adjustments,
  });

  it('accepts a valid record and proves the remote stores adjustments; an older remote has no key', () => {
    expect(parseRemoteBusinessSnapshot(wire([base])).saleAdjustmentsSupported).toBe(true);
    const older = { ...wire([]) } as Record<string, unknown>;
    delete older.sale_adjustments;
    expect(parseRemoteBusinessSnapshot(older)).toMatchObject({ saleAdjustments: [], saleAdjustmentsSupported: false });
  });

  it.each([
    ['a PENDING record with a refund date', { refunded_at: '2026-10-14T10:00:00.000Z', settled_at: '2026-10-14T10:00:00.000Z' }],
    ['a SETTLED record without its dates', { status: 'SETTLED' }],
    ['a reversal without its refund', { kind: 'REVERSAL' }],
    ['fractional cents', { refund_card_cents: 10.5 }],
    ['an unknown reason', { reason: 'WHATEVER' }],
    ['a VOIDED record without voided_at', { status: 'VOIDED' }],
  ])('refuses %s', (_label, change) => {
    expect(() => parseRemoteBusinessSnapshot(wire([{ ...base, ...change }]))).toThrow(RemoteSnapshotInvalidError);
  });

  it('a complete dataset whose live record names a Sale it does not hold is refused as a whole', () => {
    expect(() => assertSnapshotReferences(parseRemoteBusinessSnapshot(wire([base])))).toThrow(RemoteSnapshotInvalidError);
  });
});

// ---------------------------------------------------------------------------
// The Production build in daily use predates adjustments
// ---------------------------------------------------------------------------

/** Every push status the Production build's parser knows (sync-gateway.ts before §28). */
const STATUSES_KNOWN_BY_THE_PRODUCTION_BUILD = ['APPLIED', 'CONFLICT', 'ABSENT', 'FINANCIAL_CONFLICT', 'ENTITLEMENT_REQUIRED'];

describe('an older build writing a Sale that holds an adjustment', () => {
  const revente: Sale = {
    id: 'sale-revente',
    businessId: REMOTE_BUSINESS_ID,
    clientId: clientLea.id,
    appointmentId: appointmentLea.id,
    completedAt: SALE_AT,
    items: [
      { id: 'sale-revente-item-0', productId: productMask.id, productName: 'Masque réparateur', unitPrice: 50, quantity: 1 },
      { id: 'sale-revente-item-1', productId: productSerum.id, productName: 'Sérum', unitPrice: 32, quantity: 1 },
    ],
  };

  async function setup() {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    // Device A (new build): the Revente, the checkout, then — later — a refund.
    const a = seededDatabase();
    expect(approveInitialUpload(a, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
    const runA = worker(a, remote);
    sell(a, revente);
    checkoutAppointment(a, appointmentLea.id, { paidAt: SALE_AT, cardAmountCents: 0, cashAmountCents: 21700 });
    expect(await runA()).toMatchObject({ failed: 0 });
    // Device B restored meanwhile: it knows the Sale, not the refund to come.
    const b = await openRestoredDevice(remote);
    const value = draft({
      lines: [{ saleItemId: 'sale-revente-item-1', quantity: 1, restock: false }],
      refundCardCents: 0,
      refundCashCents: 3200,
    });
    const prepared = prepareSaleAdjustment(
      { sale: findSale(a, revente.id)!, adjustments: [], appointmentSettled: true, productExists: () => true, now: NOW },
      value,
    );
    if (!prepared.ok) throw new Error('prepared');
    recordSaleAdjustment(a, value, prepared.adjustment, prepared.restorations, NOW);
    await runA();
    remote.clearRequests();
    return { remote, b };
  }

  /** What the Production build's store does to remove a sold product after checkout (no adjustment guard). */
  function legacyTrim(db: SourisDatabase, saleItemId: string) {
    db.runSync('DELETE FROM sale_items WHERE sale_id = ? AND id = ?', [revente.id, saleItemId]);
    markAggregateUpserted(db, 'SALE', revente.id);
  }
  function legacyRemoveSale(db: SourisDatabase) {
    db.runSync('DELETE FROM sale_items WHERE sale_id = ?', [revente.id]);
    db.runSync('DELETE FROM sales WHERE id = ?', [revente.id]);
    markAggregateDeleted(db, 'SALE', revente.id);
  }

  it('a trimmed Sale is answered CONFLICT: kept pending, never reported applied; the adjustment and the Sale stay intact', async () => {
    const { remote, b } = await setup();
    const remoteSale = JSON.stringify(remote.find(REMOTE_BUSINESS_ID, 'SALE', revente.id));
    const remoteAdjustment = JSON.stringify(remote.find(REMOTE_BUSINESS_ID, 'SALE_ADJUSTMENT', 'adj-1'));
    legacyTrim(b.db, 'sale-revente-item-1');
    // An unrelated change waits in the same outbox.
    dbUnrelated(b.db);

    const result = await b.run();

    const answers = remote.requests.map((request) => request.aggregateType);
    expect(answers).toEqual(expect.arrayContaining(['CLIENT', 'SALE']));
    expect(result).toMatchObject({
      status: 'PUSHED',
      conflicts: [expect.objectContaining({ aggregateType: 'SALE', aggregateId: revente.id })],
    });
    // Not a run-level stop: the unrelated client went, and the pull still ran.
    expect(result).not.toHaveProperty('stoppedBy');
    expect(result).toHaveProperty('pull');
    expect(remote.find(REMOTE_BUSINESS_ID, 'CLIENT', 'client-unrelated')).toBeDefined();
    // Nothing remote moved.
    expect(JSON.stringify(remote.find(REMOTE_BUSINESS_ID, 'SALE', revente.id))).toBe(remoteSale);
    expect(JSON.stringify(remote.find(REMOTE_BUSINESS_ID, 'SALE_ADJUSTMENT', 'adj-1'))).toBe(remoteAdjustment);
    // The rejected write is still pending on the device — never acknowledged.
    expect(loadSyncOutbox(b.db, REMOTE_BUSINESS_ID).find((entry) => entry.aggregateType === 'SALE')).toMatchObject({
      lastError: 'CONFLICT',
    });
  });

  it('a removed Sale (its tombstone) is answered CONFLICT too, with nothing tombstoned', async () => {
    const { remote, b } = await setup();
    legacyRemoveSale(b.db);
    const result = await b.run();
    expect(result).toMatchObject({ conflicts: [expect.objectContaining({ aggregateType: 'SALE', operation: 'DELETE' })] });
    expect(result).not.toHaveProperty('stoppedBy');
    expect(remote.find(REMOTE_BUSINESS_ID, 'SALE', revente.id)?.deleted).toBe(false);
  });

  it('every answer such a build can receive is in the vocabulary its parser has always known', async () => {
    const { remote, b } = await setup();
    legacyTrim(b.db, 'sale-revente-item-0');
    const answers: string[] = [];
    const original = remote.pushAggregate.bind(remote);
    const spy = jest.spyOn(remote, 'pushAggregate').mockImplementation(async (request) => {
      const answer = await original(request);
      answers.push(answer.status);
      return answer;
    });
    await b.run();
    spy.mockRestore();
    expect(answers.length).toBeGreaterThan(0);
    for (const status of answers) expect(STATUSES_KNOWN_BY_THE_PRODUCTION_BUILD).toContain(status);
  });

  it('an identical replay of the Sale (a lost acknowledgement) still passes: only changes are refused', async () => {
    const { remote } = await setup();
    const stored = remote.find(REMOTE_BUSINESS_ID, 'SALE', revente.id)!;
    expect(
      await remote.pushAggregate({
        businessId: REMOTE_BUSINESS_ID,
        aggregateType: 'SALE',
        aggregateId: revente.id,
        operation: 'UPSERT',
        expectedVersion: stored.syncVersion,
        payload: stored.payload,
      }),
    ).toEqual({ status: 'APPLIED', syncVersion: stored.syncVersion });
  });
});

function dbUnrelated(db: SourisDatabase) {
  db.runSync("INSERT INTO clients (id, first_name) VALUES ('client-unrelated', 'Inès')");
  markAggregateUpserted(db, 'CLIENT', 'client-unrelated');
}

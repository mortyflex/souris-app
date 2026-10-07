// BeautIzzy — Appointment deposits through the existing aggregate sync
// (docs/architecture/CLOUD_SYNC.md §21): real stores, the real worker, the
// contract-faithful in-memory remote. A deposit is its own aggregate type,
// APPOINTMENT_DEPOSIT, of the same outbox → push → pull / restore pipeline.
// VOIDED is a status carried by an UPSERT — never a tombstone.

import {
  findAppointmentDepositInvariantBreach,
  getAppointmentRemainingAmount,
  type Appointment,
  type AppointmentDeposit,
} from '@/domain/appointments';
import { getCashRegisterDaySummary } from '@/domain/cash-register';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { migrateDatabase } from '../migrations';
import { migrations } from '../schema';
import {
  insertAppointmentDeposit,
  loadAppointmentDeposits,
  voidAppointmentDeposit,
} from '../stores/appointment-deposits';
import { updateAppointment } from '../stores/appointments';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { readAggregatePayload, LocalAggregateScopeError } from '../sync/aggregate-payload';
import { approveInitialRestore, approveInitialUpload } from '../sync/bootstrap';
import { countSyncOutboxRows, loadSyncOutbox } from '../sync/outbox';
import { readSyncPullCursor, SYNC_PULL_CURSOR_KEY } from '../sync/pull-cursor';
import { createSyncPushWorker } from '../sync/push-worker';
import { applyRemoteTombstone } from '../sync/remote-apply';
import {
  SyncRemoteError,
  type RemoteAppointmentDepositPayload,
  type RemoteAppointmentPayload,
} from '../sync/remote-gateway';
import {
  assertSnapshotReferences,
  parseRemoteBusinessSnapshot,
  RemoteSnapshotInvalidError,
} from '../sync/remote-snapshot';
import { readAcknowledgedRemoteVersion } from '../sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '../testing/fake-sync-remote';
import {
  appointmentLea,
  clientLea,
  createTestSeed,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const NOW = new Date('2026-09-21T09:00:00.000Z');
const PAID_AT = new Date('2026-09-05T08:15:00.000Z');
const REF = { aggregateType: 'APPOINTMENT_DEPOSIT', aggregateId: 'deposit-card' } as const;

const cardDeposit: AppointmentDeposit = {
  id: 'deposit-card',
  businessId: REMOTE_BUSINESS_ID,
  appointmentId: appointmentLea.id,
  amountCents: 3000,
  paymentMethod: 'CARD',
  paidAt: PAID_AT,
  status: 'ACTIVE',
  createdAt: PAID_AT,
};

const cardPayload: RemoteAppointmentDepositPayload = {
  appointment_id: appointmentLea.id,
  amount_cents: 3000,
  payment_method: 'CARD',
  paid_at: '2026-09-05T08:15:00.000Z',
  status: 'ACTIVE',
  voided_at: null,
  recorded_at: '2026-09-05T08:15:00.000Z',
};

const VOIDED_AT = new Date('2026-09-06T10:00:00.000Z');

const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

function worker(db: SourisDatabase, remote: FakeSyncRemote) {
  const instance = createSyncPushWorker({ database: db, gateway: remote, now: () => NOW });
  return () => instance.run(REMOTE_BUSINESS_ID);
}

/** A device that already synchronizes its seeded data (appointmentLea: 135 €). */
async function openSyncedSource(remote: FakeSyncRemote) {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  expect(approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
  const run = worker(db, remote);
  expect(await run()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', failed: 0 });
  remote.clearRequests();
  return { db, run };
}

async function openRestoredDevice(remote: FakeSyncRemote) {
  const db = openTestDatabase();
  bootstrapPersistence(db, emptySeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  const run = worker(db, remote);
  expect(await run()).toEqual({ status: 'BLOCKED', decision: 'RESTORE_REQUIRED' });
  expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
  const restored = await run();
  expect(restored).toMatchObject({ status: 'RESTORED' });
  remote.clearRequests();
  return { db, run, restored };
}

describe('Appointment deposit push', () => {
  it('create → cloud: one APPOINTMENT_DEPOSIT push with the exact cents, method and instants', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);

    insertAppointmentDeposit(db, cardDeposit);
    expect(await run()).toMatchObject({ status: 'PUSHED', pushed: 1, failed: 0, conflicts: [] });

    expect(remote.requests).toEqual([
      {
        businessId: REMOTE_BUSINESS_ID,
        aggregateType: 'APPOINTMENT_DEPOSIT',
        aggregateId: cardDeposit.id,
        operation: 'UPSERT',
        expectedVersion: undefined,
        payload: cardPayload,
      },
    ]);
    expect(readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, REF)?.remoteVersion).toBe(1);
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('void → cloud: an UPSERT carrying VOIDED under the acknowledged version, never a tombstone', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertAppointmentDeposit(db, cardDeposit);
    await run();
    remote.clearRequests();

    voidAppointmentDeposit(db, cardDeposit.id, VOIDED_AT);
    expect(await run()).toMatchObject({ pushed: 1, failed: 0, conflicts: [] });

    expect(remote.requests[0]).toMatchObject({ operation: 'UPSERT', expectedVersion: 1 });
    expect(remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT_DEPOSIT', cardDeposit.id)).toMatchObject({
      payload: { ...cardPayload, status: 'VOIDED', voided_at: '2026-09-06T10:00:00.000Z' },
      syncVersion: 2,
      deleted: false,
    });
  });

  it('offline create + void stay pending, coalesced into ONE push of the current state', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);

    insertAppointmentDeposit(db, cardDeposit);
    voidAppointmentDeposit(db, cardDeposit.id, VOIDED_AT);
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID)).toHaveLength(1);
    expect(await run()).toMatchObject({ pushed: 1 });

    expect(remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT_DEPOSIT', cardDeposit.id)?.payload).toMatchObject({ status: 'VOIDED' });
  });

  it('several deposits of one Appointment are several aggregates', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);

    insertAppointmentDeposit(db, cardDeposit);
    insertAppointmentDeposit(db, { ...cardDeposit, id: 'deposit-cash', amountCents: 2000, paymentMethod: 'CASH' });
    expect(await run()).toMatchObject({ pushed: 2, failed: 0 });

    expect(remote.list(REMOTE_BUSINESS_ID).filter((row) => row.key.startsWith('APPOINTMENT_DEPOSIT/'))).toHaveLength(2);
  });

  it('is part of the initial upload and is pushed after its Appointment', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    insertAppointmentDeposit(db, { ...cardDeposit, businessId: 'business-test' });
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW);

    expect(await worker(db, remote)()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', failed: 0 });

    const types = remote.requests.map((request) => request.aggregateType);
    expect(types.at(-1)).toBe('APPOINTMENT_DEPOSIT');
    expect(types.indexOf('APPOINTMENT')).toBeLessThan(types.indexOf('APPOINTMENT_DEPOSIT'));
    // The binding stamped the bound Business on the deposit too.
    expect(loadAppointmentDeposits(db)[0]?.businessId).toBe(REMOTE_BUSINESS_ID);
  });

  it('a lost acknowledgement is retried idempotently: no duplicate deposit, no new revision', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertAppointmentDeposit(db, cardDeposit);

    remote.loseNextResponse();
    expect(await run()).toMatchObject({ pushed: 0 });
    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });

    const rows = remote.list(REMOTE_BUSINESS_ID).filter((row) => row.key.startsWith('APPOINTMENT_DEPOSIT/'));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.syncVersion).toBe(1);
  });

  it('a remote that refuses the deposit keeps it pending with a backoff; the other aggregates continue', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertAppointmentDeposit(db, cardDeposit);
    updateAppointment(db, { ...appointmentLea, businessId: REMOTE_BUSINESS_ID, notes: 'Mèches' });

    // What an older remote (migration not applied yet) answers: 22023.
    remote.beforePush((request) => {
      if (request.aggregateType === 'APPOINTMENT_DEPOSIT') remote.failNext(new SyncRemoteError('REJECTED', '22023'));
    });
    expect(await run()).toMatchObject({ pushed: 1, failed: 1 });
    remote.beforePush(undefined);

    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID)).toEqual([
      expect.objectContaining({ aggregateType: 'APPOINTMENT_DEPOSIT', attemptCount: 1 }),
    ]);
    expect(loadAppointmentDeposits(db)).toEqual([cardDeposit]);
  });

  it('never pushes a row stamped with another Business (isolation)', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    db.runSync(
      "INSERT INTO appointment_deposits (id, business_id, appointment_id, amount_cents, payment_method, paid_at, status, voided_at, recorded_at) VALUES ('foreign', 'another-business', ?, 1000, 'CASH', '2026-09-05T08:00:00.000Z', 'ACTIVE', NULL, '2026-09-05T08:00:00.000Z')",
      [appointmentLea.id],
    );

    expect(() =>
      readAggregatePayload(db, REMOTE_BUSINESS_ID, { aggregateType: 'APPOINTMENT_DEPOSIT', aggregateId: 'foreign' }),
    ).toThrow(LocalAggregateScopeError);
  });
});

describe('Appointment deposit pull and restore', () => {
  it('cloud pull → local: another device’s deposit and its void arrive without any echo', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    const other = await openRestoredDevice(remote);

    insertAppointmentDeposit(source.db, cardDeposit);
    await source.run();
    remote.clearRequests();
    expect(await other.run()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    expect(loadAppointmentDeposits(other.db)).toEqual([cardDeposit]);
    expect(countSyncOutboxRows(other.db)).toBe(0);
    expect(remote.requests).toEqual([]);

    voidAppointmentDeposit(source.db, cardDeposit.id, VOIDED_AT);
    await source.run();
    await other.run();
    expect(loadAppointmentDeposits(other.db)).toEqual([{ ...cardDeposit, status: 'VOIDED', voidedAt: VOIDED_AT }]);
  });

  it('fresh-device restore: history, ACTIVE totals, VOIDED state, Cash Register and remaining all match', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    insertAppointmentDeposit(source.db, cardDeposit);
    insertAppointmentDeposit(source.db, {
      ...cardDeposit,
      id: 'deposit-cash',
      amountCents: 2000,
      paymentMethod: 'CASH',
      paidAt: new Date('2026-09-06T15:00:00.000Z'),
      createdAt: new Date('2026-09-06T15:00:00.000Z'),
    });
    insertAppointmentDeposit(source.db, { ...cardDeposit, id: 'deposit-mistake', amountCents: 5000 });
    voidAppointmentDeposit(source.db, 'deposit-mistake', VOIDED_AT);
    await source.run();

    const fresh = await openRestoredDevice(remote);

    expect(fresh.restored).toMatchObject({ restored: { appointmentDeposits: 3 } });
    const { products: _restored, ...restoredSnapshot } = loadSnapshot(fresh.db);
    const { products: _source, ...sourceSnapshot } = loadSnapshot(source.db);
    expect(restoredSnapshot).toEqual(sourceSnapshot);

    const restored = loadSnapshot(fresh.db);
    const appointment = restored.appointments.find((candidate) => candidate.id === appointmentLea.id)!;
    expect(getAppointmentRemainingAmount(appointment, restored.sales, restored.appointmentDeposits)).toBe(8500);
    expect(
      getCashRegisterDaySummary(
        { appointments: restored.appointments, sales: restored.sales, deposits: restored.appointmentDeposits },
        PAID_AT,
      ),
    ).toMatchObject({ totalCents: 3000, cardCents: 3000, checkoutCount: 1 });
    expect(readAcknowledgedRemoteVersion(fresh.db, REMOTE_BUSINESS_ID, REF)?.remoteVersion).toBe(1);
    // Recorded and voided before the same run: ONE coalesced revision, VOIDED.
    expect(
      readAcknowledgedRemoteVersion(fresh.db, REMOTE_BUSINESS_ID, { ...REF, aggregateId: 'deposit-mistake' })?.remoteVersion,
    ).toBe(1);
    expect(loadAppointmentDeposits(fresh.db).find((deposit) => deposit.id === 'deposit-mistake')).toMatchObject({
      status: 'VOIDED',
      voidedAt: VOIDED_AT,
    });

    // A restored deposit can be voided on the new device, under its acknowledged version.
    voidAppointmentDeposit(fresh.db, cardDeposit.id, VOIDED_AT);
    expect(await fresh.run()).toMatchObject({ pushed: 1, conflicts: [] });
  });

  it('refuses a remote deposit the local table would refuse — before any write', () => {
    const base = { pulled_at: '2026-09-21T09:00:00.000Z', clients: [], services: [], products: [], appointments: [], sales: [] };
    const row = { id: 'd', sync_version: 1, deleted_at: null, ...cardPayload };
    const invalid = (overrides: object) => () =>
      parseRemoteBusinessSnapshot({ ...base, appointment_deposits: [{ ...row, ...overrides }] });

    expect(invalid({ amount_cents: 0 })).toThrow(RemoteSnapshotInvalidError);
    expect(invalid({ amount_cents: 12.5 })).toThrow('appointment_deposits[].amount_cents');
    expect(invalid({ payment_method: 'CHEQUE' })).toThrow('appointment_deposits[].payment_method');
    expect(invalid({ status: 'REFUNDED' })).toThrow('appointment_deposits[].status');
    expect(invalid({ status: 'VOIDED' })).toThrow('appointment_deposits[].voided_at');
    expect(invalid({ voided_at: '2026-09-06T10:00:00.000Z' })).toThrow('appointment_deposits[].voided_at');
    expect(invalid({ appointment_id: '' })).toThrow('appointment_deposits[].appointment_id');
    expect(invalid({ paid_at: 'hier' })).toThrow('appointment_deposits[].paid_at');
    // A deposit naming an Appointment the dataset does not hold is refused as a whole.
    expect(() => assertSnapshotReferences(parseRemoteBusinessSnapshot({ ...base, appointment_deposits: [row] }))).toThrow(
      'appointment_deposits[].appointment_id',
    );
  });

  it('a remote Appointment tombstone never removes an Appointment that holds a deposit', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    insertAppointmentDeposit(db, cardDeposit);

    expect(applyRemoteTombstone(db, { aggregateType: 'APPOINTMENT', aggregateId: appointmentLea.id })).toBe('BLOCKED');
    expect(applyRemoteTombstone(db, REF)).toBe('DELETED');
    expect(loadAppointmentDeposits(db)).toEqual([]);
  });
});

describe('Appointment deposits — conflicts and older builds or remotes', () => {
  it('remote newer + local dirty: CONFLICT, neither side is overwritten', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertAppointmentDeposit(db, cardDeposit);
    await run();

    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT_DEPOSIT', cardDeposit.id, {
      ...cardPayload,
      status: 'VOIDED',
      voided_at: '2026-09-07T10:00:00.000Z',
    });
    voidAppointmentDeposit(db, cardDeposit.id, VOIDED_AT);
    const result = await run();

    expect(result).toMatchObject({
      conflicts: [{ aggregateType: 'APPOINTMENT_DEPOSIT', aggregateId: cardDeposit.id, acknowledgedVersion: 1, remoteVersion: 2 }],
    });
    expect(loadAppointmentDeposits(db)[0]?.voidedAt).toEqual(VOIDED_AT);
  });

  it('an older REMOTE (no appointment_deposits key) reads as "no deposit" and deletes nothing', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertAppointmentDeposit(db, cardDeposit);
    await run();

    remote.answerNextPullWith({ pulled_at: '2026-09-21T09:30:00.000Z', clients: [], services: [], products: [], appointments: [], sales: [], calendar_blocks: [] });
    expect(await run()).toMatchObject({ pull: { status: 'PULLED', deleted: 0 } });
    expect(loadAppointmentDeposits(db)).toEqual([cardDeposit]);
  });

  it('an older BUILD pushing its Appointment never touches the deposits the cloud holds', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const newBuild = await openSyncedSource(remote);
    insertAppointmentDeposit(newBuild.db, cardDeposit);
    await newBuild.run();
    const before = remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT_DEPOSIT', cardDeposit.id);

    const oldBuild = await openRestoredDevice(remote);
    oldBuild.db.runSync('DELETE FROM appointment_deposits'); // it has no such table
    updateAppointment(oldBuild.db, { ...appointmentLea, businessId: REMOTE_BUSINESS_ID, notes: 'Balayage' });
    expect(await oldBuild.run()).toMatchObject({ pushed: 1, failed: 0 });

    expect(remote.requests.map((request) => request.aggregateType)).toEqual(['APPOINTMENT']);
    expect(remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT_DEPOSIT', cardDeposit.id)).toEqual(before);
    expect(await newBuild.run()).toMatchObject({ pull: { deleted: 0 } });
    expect(loadAppointmentDeposits(newBuild.db)).toEqual([cardDeposit]);
  });

  it('a device upgraded from schema v11 fetches the deposits its old cursor had skipped', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const newBuild = await openSyncedSource(remote);

    const upgraded = openTestDatabase();
    upgraded.withTransactionSync(() => {
      for (const migration of migrations.filter((candidate) => candidate.version <= 11)) migration.up(upgraded);
      upgraded.execSync('PRAGMA user_version = 11');
    });
    upgraded.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");

    insertAppointmentDeposit(newBuild.db, cardDeposit);
    await newBuild.run();
    remote.advanceClock(60 * 60 * 1000);
    const cursorPastTheDeposit = new Date(Date.parse('2026-09-01T00:00:00.000Z') + 2 * 60 * 60 * 1000);
    upgraded.runSync('INSERT INTO souris_metadata (key, value) VALUES (?, ?)', [
      SYNC_PULL_CURSOR_KEY,
      JSON.stringify({ businessId: REMOTE_BUSINESS_ID, pulledAt: cursorPastTheDeposit.toISOString() }),
    ]);

    migrateDatabase(upgraded);
    bindLocalDatabaseToBusiness(upgraded, remoteBusinessProfile);
    expect(readSyncPullCursor(upgraded, REMOTE_BUSINESS_ID)).toBeUndefined();
    // The older build already held the Client and the Appointment, acknowledged.
    const source = loadSnapshot(newBuild.db);
    upgraded.runSync("INSERT INTO clients (id, first_name) VALUES (?, 'Léa')", [clientLea.id]);
    upgraded.runSync(
      "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES (?, 'CLIENT', ?, 1, '2026-09-20T08:00:00.000Z')",
      [REMOTE_BUSINESS_ID, clientLea.id],
    );
    remote.clearRequests();

    const result = await worker(upgraded, remote)();

    expect(remote.pulls).toEqual([undefined]); // ONE complete read
    expect(result).toMatchObject({ pull: { status: 'PULLED', cursorAdvanced: true } });
    expect(loadAppointmentDeposits(upgraded)).toEqual(source.appointmentDeposits);
    expect(remote.requests).toEqual([]);
  });
});

describe('Appointment deposits — the financial invariant across devices', () => {
  // appointmentLea: 95 € + 40 € = 135,00 €. Lowering it to 60,00 € keeps ONE item.
  const cheaper: Appointment = {
    ...appointmentLea,
    businessId: REMOTE_BUSINESS_ID,
    items: [{ ...appointmentLea.items[0]!, price: 20 }, appointmentLea.items[1]!],
  };
  const bigDeposit: AppointmentDeposit = { ...cardDeposit, id: 'deposit-big', amountCents: 10000 };

  /** What the domain says about a device's stored state. */
  const breachOf = (db: SourisDatabase) => {
    const snapshot = loadSnapshot(db);
    const appointment = snapshot.appointments.find((candidate) => candidate.id === appointmentLea.id)!;
    return findAppointmentDepositInvariantBreach(appointment, snapshot.sales, snapshot.appointmentDeposits);
  };

  it('the appointment total is lowered first: the incompatible deposit is REFUSED by the remote, kept locally, and surfaced', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    const other = await openRestoredDevice(remote);

    // Device A, online: 135 € → 60 €. Nothing was paid ahead remotely yet.
    updateAppointment(source.db, cheaper);
    expect(await source.run()).toMatchObject({ pushed: 1, failed: 0 });

    // Device B, offline since before that edit: a 100 € deposit, locally valid.
    insertAppointmentDeposit(other.db, bigDeposit);
    const result = await other.run();

    expect(result).toMatchObject({
      status: 'PUSHED',
      pushed: 0,
      failed: 1,
      financialConflicts: [
        {
          aggregateType: 'APPOINTMENT_DEPOSIT',
          aggregateId: bigDeposit.id,
          appointmentId: appointmentLea.id,
          expectedTotalCents: 6000,
          activeDepositTotalCents: 10000,
        },
      ],
    });
    // NOTHING was written remotely, and nothing was lost locally.
    expect(remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT_DEPOSIT', bigDeposit.id)).toBeUndefined();
    expect(loadAppointmentDeposits(other.db)).toEqual([bigDeposit]);
    expect(loadSyncOutbox(other.db, REMOTE_BUSINESS_ID)).toEqual([
      expect.objectContaining({ aggregateId: bigDeposit.id, operation: 'UPSERT', lastError: 'FINANCIAL_CONFLICT' }),
    ]);
    // The pull of the same run brought the lower total: the device now SEES the conflict.
    expect(breachOf(other.db)).toEqual({
      expectedTotalCents: 6000,
      activeDepositTotalCents: 10000,
      excessCents: 4000,
    });

    // Resolution: void the deposit recorded by mistake. The push then goes through.
    voidAppointmentDeposit(other.db, bigDeposit.id, VOIDED_AT);
    expect(await other.run()).toMatchObject({ pushed: 1, failed: 0 });
    expect(remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT_DEPOSIT', bigDeposit.id)?.payload).toMatchObject({
      status: 'VOIDED',
    });
    expect(breachOf(other.db)).toBeUndefined();
    expect(breachOf(source.db)).toBeUndefined();
  });

  it('the deposit is authoritative first: the incompatible appointment reduction is REFUSED, kept locally, and surfaced', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    const other = await openRestoredDevice(remote);

    // Device B, online: a 100 € deposit on the 135 € Appointment.
    insertAppointmentDeposit(other.db, bigDeposit);
    expect(await other.run()).toMatchObject({ pushed: 1, failed: 0 });

    // Device A, offline since before it: 135 € → 60 €, locally valid (it holds no deposit).
    updateAppointment(source.db, cheaper);
    const result = await source.run();

    expect(result).toMatchObject({
      pushed: 0,
      failed: 1,
      financialConflicts: [
        {
          aggregateType: 'APPOINTMENT',
          aggregateId: appointmentLea.id,
          expectedTotalCents: 6000,
          activeDepositTotalCents: 10000,
        },
      ],
    });
    // The remote kept the 135 € Appointment; the device kept its 60 € edit.
    expect(remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)?.payload).toMatchObject({
      items: [expect.objectContaining({ price_cents: 9500 }), expect.objectContaining({ price_cents: 4000 })],
    });
    expect(loadSnapshot(source.db).appointments[0]?.items[0]?.price).toBe(20);
    expect(loadSyncOutbox(source.db, REMOTE_BUSINESS_ID)).toEqual([
      expect.objectContaining({ aggregateId: appointmentLea.id, operation: 'UPSERT', lastError: 'FINANCIAL_CONFLICT' }),
    ]);
    expect(breachOf(source.db)).toEqual({
      expectedTotalCents: 6000,
      activeDepositTotalCents: 10000,
      excessCents: 4000,
    });

    // Resolution: put the price back up (never refused, it does not lower the total).
    updateAppointment(source.db, { ...appointmentLea, businessId: REMOTE_BUSINESS_ID });
    expect(await source.run()).toMatchObject({ pushed: 1, failed: 0 });
    expect(breachOf(source.db)).toBeUndefined();
  });

  it('a tombstone that would orphan or uncover deposits is refused too', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertAppointmentDeposit(db, cardDeposit);
    await run();

    // An older build (no deposit guard) deleting the Appointment: refused remotely.
    expect(
      await remote.pushAggregate({
        businessId: REMOTE_BUSINESS_ID,
        aggregateType: 'APPOINTMENT',
        aggregateId: appointmentLea.id,
        operation: 'DELETE',
        expectedVersion: remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)?.syncVersion,
        payload: undefined,
      }),
    ).toMatchObject({ status: 'FINANCIAL_CONFLICT', appointmentId: appointmentLea.id });
    expect(remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)?.deleted).toBe(false);
  });

  it('a pull of an already-invalid remote state is applied safely and reported, never crashed or hidden', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);

    // A state no current build can produce: written straight into the remote.
    const stored = remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)!.payload as RemoteAppointmentPayload;
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id, {
      ...stored,
      items: [{ ...stored.items[0]!, price_cents: 1000 }],
    });
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT_DEPOSIT', bigDeposit.id, {
      ...cardPayload,
      amount_cents: 10000,
    });

    expect(await run()).toMatchObject({ pull: { status: 'PULLED', applied: 2, failed: 0 } });

    const snapshot = loadSnapshot(db);
    expect(snapshot.appointmentDeposits).toHaveLength(1);
    const appointment = snapshot.appointments.find((candidate) => candidate.id === appointmentLea.id)!;
    // Detected, with the excess spelled out — and the remaining amount is 0, never negative.
    expect(findAppointmentDepositInvariantBreach(appointment, snapshot.sales, snapshot.appointmentDeposits)).toEqual({
      expectedTotalCents: 1000,
      activeDepositTotalCents: 10000,
      excessCents: 9000,
    });
    expect(getAppointmentRemainingAmount(appointment, snapshot.sales, snapshot.appointmentDeposits)).toBe(0);
  });

  it('a fresh-device restore of such a state rebuilds it and detects it', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    const stored = remote.find(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id)!.payload as RemoteAppointmentPayload;
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT', appointmentLea.id, {
      ...stored,
      items: [{ ...stored.items[0]!, price_cents: 1000 }],
    });
    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'APPOINTMENT_DEPOSIT', bigDeposit.id, {
      ...cardPayload,
      amount_cents: 10000,
    });

    const fresh = await openRestoredDevice(remote);

    expect(fresh.restored).toMatchObject({ restored: { appointmentDeposits: 1 } });
    expect(breachOf(fresh.db)).toEqual({
      expectedTotalCents: 1000,
      activeDepositTotalCents: 10000,
      excessCents: 9000,
    });
    // The device stays usable: voiding the deposit resolves it and syncs.
    voidAppointmentDeposit(fresh.db, bigDeposit.id, VOIDED_AT);
    expect(await fresh.run()).toMatchObject({ pushed: 1, failed: 0 });
    expect(breachOf(fresh.db)).toBeUndefined();
    expect(breachOf(source.db)).toBeUndefined();
  });
});

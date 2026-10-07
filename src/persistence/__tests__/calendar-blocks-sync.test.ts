// BeautIzzy — Calendar Blocks through the existing aggregate sync
// (docs/architecture/CLOUD_SYNC.md §20): real stores, the real worker, the
// contract-faithful in-memory remote. No second sync engine: a block is one
// more aggregate type of the same outbox → push → pull / restore pipeline.

import type { CalendarBlock } from '@/domain/calendar-blocks';

import { bootstrapPersistence, loadSnapshot } from '../bootstrap';
import type { SourisDatabase } from '../database';
import { migrateDatabase } from '../migrations';
import { migrations } from '../schema';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import {
  deleteCalendarBlock,
  insertCalendarBlock,
  loadCalendarBlocks,
  updateCalendarBlock,
} from '../stores/calendar-blocks';
import { insertClient, updateClient } from '../stores/clients';
import { approveInitialRestore, approveInitialUpload } from '../sync/bootstrap';
import { countSyncOutboxRows, loadSyncOutbox } from '../sync/outbox';
import { readSyncPullCursor, SYNC_PULL_CURSOR_KEY } from '../sync/pull-cursor';
import { createSyncPushWorker } from '../sync/push-worker';
import type { RemoteCalendarBlockPayload } from '../sync/remote-gateway';
import { parseRemoteBusinessSnapshot, RemoteSnapshotInvalidError } from '../sync/remote-snapshot';
import { readAcknowledgedRemoteVersion } from '../sync/state';
import { createFakeSyncRemote, type FakeSyncRemote } from '../testing/fake-sync-remote';
import {
  clientLea,
  createTestSeed,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const NOW = new Date('2026-09-21T09:00:00.000Z');
const REF = { aggregateType: 'CALENDAR_BLOCK', aggregateId: 'block-pause' } as const;

const pause: CalendarBlock = {
  id: 'block-pause',
  businessId: REMOTE_BUSINESS_ID,
  staffMemberId: 'staff-amelie',
  startAt: new Date('2026-09-21T10:10:00.000Z'),
  endAt: new Date('2026-09-21T11:25:00.000Z'),
  reason: 'Pause',
};

const pausePayload: RemoteCalendarBlockPayload = {
  staff_member_id: 'staff-amelie',
  start_at: '2026-09-21T10:10:00.000Z',
  end_at: '2026-09-21T11:25:00.000Z',
  reason: 'Pause',
};

const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

function worker(db: SourisDatabase, remote: FakeSyncRemote) {
  const instance = createSyncPushWorker({ database: db, gateway: remote, now: () => NOW });
  return () => instance.run(REMOTE_BUSINESS_ID);
}

/** A device that already synchronizes its seeded data with the remote. */
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

describe('Calendar Block push', () => {
  it('create → cloud: one CALENDAR_BLOCK push with the exact interval and nothing financial', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);

    insertCalendarBlock(db, pause);
    expect(await run()).toMatchObject({ status: 'PUSHED', pushed: 1, failed: 0, conflicts: [] });

    expect(remote.requests).toEqual([
      {
        businessId: REMOTE_BUSINESS_ID,
        aggregateType: 'CALENDAR_BLOCK',
        aggregateId: pause.id,
        operation: 'UPSERT',
        expectedVersion: undefined,
        payload: pausePayload,
      },
    ]);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)).toMatchObject({
      payload: pausePayload,
      syncVersion: 1,
      deleted: false,
    });
    expect(readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, REF)?.remoteVersion).toBe(1);
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('edit → cloud: pushed under the acknowledged version', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertCalendarBlock(db, pause);
    await run();
    remote.clearRequests();

    updateCalendarBlock(db, { ...pause, endAt: new Date('2026-09-21T12:00:00.000Z'), reason: 'Formation' });
    expect(await run()).toMatchObject({ pushed: 1, failed: 0, conflicts: [] });

    expect(remote.requests[0]).toMatchObject({ operation: 'UPSERT', expectedVersion: 1 });
    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)).toMatchObject({
      payload: { ...pausePayload, end_at: '2026-09-21T12:00:00.000Z', reason: 'Formation' },
      syncVersion: 2,
    });
    expect(readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, REF)?.remoteVersion).toBe(2);
  });

  it('delete → cloud: a tombstone, never a remote hard delete', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertCalendarBlock(db, pause);
    await run();
    remote.clearRequests();

    deleteCalendarBlock(db, pause.id);
    expect(await run()).toMatchObject({ pushed: 1, failed: 0 });

    expect(remote.requests[0]).toMatchObject({ operation: 'DELETE', expectedVersion: 1, payload: undefined });
    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)).toMatchObject({
      deleted: true,
      syncVersion: 2,
    });
    expect(readAcknowledgedRemoteVersion(db, REMOTE_BUSINESS_ID, REF)?.remoteVersion).toBe(2);
  });

  it('created and deleted while offline: ABSENT, no tombstone is fabricated', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);

    insertCalendarBlock(db, pause);
    deleteCalendarBlock(db, pause.id);
    expect(await run()).toMatchObject({ failed: 0 });

    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)).toBeUndefined();
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('offline edits stay pending and leave with the next run, coalesced', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);

    insertCalendarBlock(db, pause);
    updateCalendarBlock(db, { ...pause, reason: 'Administratif' });
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID)).toHaveLength(1);
    expect(await run()).toMatchObject({ pushed: 1 });

    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)?.payload).toMatchObject({
      reason: 'Administratif',
    });
  });

  it('is part of the initial upload and is pushed after every other family', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    insertCalendarBlock(db, { ...pause, businessId: 'business-test' });
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW);

    expect(await worker(db, remote)()).toMatchObject({ bootstrap: 'INITIAL_UPLOAD', failed: 0 });

    const types = remote.requests.map((request) => request.aggregateType);
    expect(types.at(-1)).toBe('CALENDAR_BLOCK');
    expect(types.filter((type) => type === 'CALENDAR_BLOCK')).toHaveLength(1);
  });

  it('a device holding ONLY blocks counts as populated: it uploads, it is never restored over', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const db = openTestDatabase();
    bootstrapPersistence(db, emptySeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    insertCalendarBlock(db, pause);

    expect(await worker(db, remote)()).toEqual({
      status: 'BLOCKED',
      decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL',
    });
    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW)).toMatchObject({ status: 'REFUSED' });
  });
});

describe('Calendar Block pull and restore', () => {
  it('cloud pull → local: another device’s block, edit and deletion arrive without any echo', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    const other = await openRestoredDevice(remote);

    insertCalendarBlock(source.db, pause);
    await source.run();
    remote.clearRequests();
    expect(await other.run()).toMatchObject({ pull: { status: 'PULLED', applied: 1, conflicts: [] } });
    expect(loadCalendarBlocks(other.db)).toEqual([pause]);
    expect(countSyncOutboxRows(other.db)).toBe(0);
    expect(remote.requests).toEqual([]); // nothing pushed back

    updateCalendarBlock(source.db, { ...pause, reason: 'Déplacement' });
    await source.run();
    await other.run();
    expect(loadCalendarBlocks(other.db)).toEqual([{ ...pause, reason: 'Déplacement' }]);

    deleteCalendarBlock(source.db, pause.id);
    await source.run();
    expect(await other.run()).toMatchObject({ pull: { deleted: 1 } });
    expect(loadCalendarBlocks(other.db)).toEqual([]);
    expect(countSyncOutboxRows(other.db)).toBe(0);
  });

  it('fresh-device restore rebuilds the blocks, acknowledges them and skips tombstones', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const source = await openSyncedSource(remote);
    insertCalendarBlock(source.db, pause);
    insertCalendarBlock(source.db, { ...pause, id: 'block-gone', reason: 'Formation', startAt: new Date('2026-09-22T08:00:00.000Z'), endAt: new Date('2026-09-22T09:00:00.000Z') });
    await source.run();
    deleteCalendarBlock(source.db, 'block-gone');
    await source.run();

    const fresh = await openRestoredDevice(remote);

    expect(fresh.restored).toMatchObject({ restored: { calendarBlocks: 1 } });
    // Product images are device-local and never restored; everything else is identical.
    const { products: _restored, ...restoredSnapshot } = loadSnapshot(fresh.db);
    const { products: _source, ...sourceSnapshot } = loadSnapshot(source.db);
    expect(restoredSnapshot).toEqual(sourceSnapshot);
    expect(loadCalendarBlocks(fresh.db)).toEqual([pause]);
    expect(readAcknowledgedRemoteVersion(fresh.db, REMOTE_BUSINESS_ID, REF)?.remoteVersion).toBe(1);
    expect(
      readAcknowledgedRemoteVersion(fresh.db, REMOTE_BUSINESS_ID, { ...REF, aggregateId: 'block-gone' })?.remoteVersion,
    ).toBe(2);
    // The restored block is editable under its acknowledged version.
    updateCalendarBlock(fresh.db, { ...pause, reason: 'Personnel' });
    expect(await fresh.run()).toMatchObject({ pushed: 1, conflicts: [] });
  });

  it('refuses a remote block the local table would refuse — before any write', () => {
    const base = { pulled_at: '2026-09-21T09:00:00.000Z', clients: [], services: [], products: [], appointments: [], sales: [] };
    const row = { id: 'b', sync_version: 1, deleted_at: null, ...pausePayload };
    const invalid = (overrides: object) => () =>
      parseRemoteBusinessSnapshot({ ...base, calendar_blocks: [{ ...row, ...overrides }] });

    expect(invalid({ end_at: pausePayload.start_at })).toThrow(RemoteSnapshotInvalidError);
    expect(invalid({ end_at: '2026-09-21T09:00:00.000Z' })).toThrow('calendar_blocks[].end_at');
    expect(invalid({ reason: '  ' })).toThrow('calendar_blocks[].reason');
    expect(invalid({ staff_member_id: '' })).toThrow('calendar_blocks[].staff_member_id');
    expect(invalid({ start_at: 'soon' })).toThrow('calendar_blocks[].start_at');
    expect(() => parseRemoteBusinessSnapshot({ ...base, calendar_blocks: 'none' })).toThrow('calendar_blocks');
    // A tombstone carries no payload: its columns are never read.
    expect(
      parseRemoteBusinessSnapshot({ ...base, calendar_blocks: [{ id: 'b', sync_version: 3, deleted_at: '2026-09-21T09:00:00.000Z', reason: '' }] }).calendarBlocks,
    ).toEqual([{ id: 'b', syncVersion: 3, payload: undefined }]);
  });
});

describe('Calendar Block conflict / version behavior — the ordinary contract', () => {
  it('remote newer + local dirty: CONFLICT, neither side is overwritten', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertCalendarBlock(db, pause);
    await run();

    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id, { ...pausePayload, reason: 'Formation' });
    updateCalendarBlock(db, { ...pause, reason: 'Personnel' });
    const result = await run();

    expect(result).toMatchObject({
      conflicts: [{ aggregateType: 'CALENDAR_BLOCK', aggregateId: pause.id, acknowledgedVersion: 1, remoteVersion: 2 }],
    });
    expect(loadCalendarBlocks(db)[0]?.reason).toBe('Personnel');
    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)?.payload).toMatchObject({ reason: 'Formation' });
    expect(loadSyncOutbox(db, REMOTE_BUSINESS_ID)).toEqual([
      expect.objectContaining({ aggregateId: pause.id, lastError: 'CONFLICT' }),
    ]);
  });

  it('a local deletion never tombstones a revision this device has not seen', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertCalendarBlock(db, pause);
    await run();

    remote.writeFromElsewhere(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id, { ...pausePayload, reason: 'Formation' });
    deleteCalendarBlock(db, pause.id);
    await run();

    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)).toMatchObject({ deleted: false, syncVersion: 2 });
  });

  it('a lost acknowledgement is retried idempotently, without a new revision', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertCalendarBlock(db, pause);

    remote.loseNextResponse();
    expect(await run()).toMatchObject({ pushed: 0 });
    expect(await run()).toMatchObject({ pushed: 1, conflicts: [] });

    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)?.syncVersion).toBe(1);
  });
});

describe('Calendar Blocks and builds or remotes that predate them', () => {
  it('an older REMOTE (no calendar_blocks key) reads as "no block" and deletes nothing locally', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const { db, run } = await openSyncedSource(remote);
    insertCalendarBlock(db, pause);
    await run();

    remote.answerNextPullWith({ pulled_at: '2026-09-21T09:30:00.000Z', clients: [], services: [], products: [], appointments: [], sales: [] });
    expect(await run()).toMatchObject({ pull: { status: 'PULLED', deleted: 0 } });

    expect(loadCalendarBlocks(db)).toEqual([pause]);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)).toMatchObject({ deleted: false });
  });

  it('an older BUILD pushing its own aggregates never touches the blocks the cloud holds', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const newBuild = await openSyncedSource(remote);
    insertCalendarBlock(newBuild.db, pause);
    await newBuild.run();
    const before = remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id);

    // What an older build does: per-aggregate pushes of the five families it
    // knows. There is no dataset-level payload in which a missing section
    // could be read as "zero blocks" — the absence of a push IS the absence of
    // an opinion. Deleting a block takes an explicit CALENDAR_BLOCK tombstone.
    const oldBuild = await openRestoredDevice(remote);
    oldBuild.db.runSync('DELETE FROM calendar_blocks'); // it has no such table
    updateClient(oldBuild.db, { ...clientLea, phone: '0611223344' });
    insertClient(oldBuild.db, { id: 'client-new', firstName: 'Inès' });
    expect(await oldBuild.run()).toMatchObject({ pushed: 2, failed: 0 });

    expect(remote.requests.map((request) => request.aggregateType)).toEqual(['CLIENT', 'CLIENT']);
    expect(remote.find(REMOTE_BUSINESS_ID, 'CALENDAR_BLOCK', pause.id)).toEqual(before);
    expect(await newBuild.run()).toMatchObject({ pull: { deleted: 0 } });
    expect(loadCalendarBlocks(newBuild.db)).toEqual([pause]);
  });

  it('a device upgraded from an older build fetches the blocks its old cursor had skipped', async () => {
    const remote = createFakeSyncRemote([REMOTE_BUSINESS_ID]);
    const newBuild = await openSyncedSource(remote);

    // The older build: schema v10, synchronized. Its pulls ignore the unknown
    // `calendar_blocks` family and still move the cursor forward.
    const upgraded = openTestDatabase();
    upgraded.withTransactionSync(() => {
      for (const migration of migrations.filter((candidate) => candidate.version <= 10)) migration.up(upgraded);
      upgraded.execSync('PRAGMA user_version = 10');
    });
    upgraded.runSync("INSERT INTO souris_metadata (key, value) VALUES ('seed_version', '1')");

    insertCalendarBlock(newBuild.db, pause);
    await newBuild.run();
    remote.advanceClock(60 * 60 * 1000);
    const cursorPastTheBlock = new Date(Date.parse('2026-09-01T00:00:00.000Z') + 2 * 60 * 60 * 1000);
    upgraded.runSync('INSERT INTO souris_metadata (key, value) VALUES (?, ?)', [
      SYNC_PULL_CURSOR_KEY,
      JSON.stringify({ businessId: REMOTE_BUSINESS_ID, pulledAt: cursorPastTheBlock.toISOString() }),
    ]);

    // The update installs: v10 → v11, then an ordinary run.
    migrateDatabase(upgraded);
    bindLocalDatabaseToBusiness(upgraded, remoteBusinessProfile);
    expect(readSyncPullCursor(upgraded, REMOTE_BUSINESS_ID)).toBeUndefined();
    upgraded.runSync(
      "INSERT INTO sync_state (business_id, aggregate_type, aggregate_id, remote_version, last_synced_at) VALUES (?, 'CLIENT', ?, 1, '2026-09-20T08:00:00.000Z')",
      [REMOTE_BUSINESS_ID, clientLea.id],
    );
    upgraded.runSync("INSERT INTO clients (id, first_name) VALUES (?, 'Léa')", [clientLea.id]);
    remote.clearRequests();

    const result = await worker(upgraded, remote)();

    expect(remote.pulls).toEqual([undefined]); // ONE complete read
    expect(result).toMatchObject({ pull: { status: 'PULLED', cursorAdvanced: true } });
    expect(loadCalendarBlocks(upgraded)).toEqual([pause]);
    expect(remote.requests).toEqual([]);
  });
});

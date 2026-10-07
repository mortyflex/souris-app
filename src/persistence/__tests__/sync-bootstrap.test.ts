// BeautIzzy — Cloud Sync V1C: first-sync classification and initial-upload enqueue
// (docs/architecture/CLOUD_SYNC.md §11)

import { bootstrapPersistence } from '../bootstrap';
import { bindLocalDatabaseToBusiness } from '../stores/business-profile';
import { deleteClientPermanently, insertClient, updateClient } from '../stores/clients';
import {
  classifySyncBootstrap,
  isLocalDatabasePopulated,
  isPushEnabled,
  isStoredPushDecisionCurrent,
  isSyncBootstrapPending,
  readSyncBootstrapRecord,
  SYNC_BOOTSTRAP_KEY,
  writeSyncBootstrapRecord,
} from '../sync/bootstrap';
import { enqueueInitialUpload, loadSyncOutbox } from '../sync/outbox';
import { loadSyncState, writeAcknowledgedRemoteVersion } from '../sync/state';
import { writeMetadata } from '../metadata';
import {
  clientLea,
  createTestSeed,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '../testing/fixtures';
import { openTestDatabase } from '../testing/node-sqlite-database';

const NOW = new Date('2026-09-17T09:00:00.000Z');

describe('classifySyncBootstrap', () => {
  it.each([
    [{ localPopulated: false, remoteAggregateCount: 0, hasAcknowledgedState: false, initialUploadApproved: false }, 'EMPTY', true],
    [{ localPopulated: false, remoteAggregateCount: 0, hasAcknowledgedState: false, initialUploadApproved: true }, 'EMPTY', true],
    [{ localPopulated: true, remoteAggregateCount: 0, hasAcknowledgedState: false, initialUploadApproved: false }, 'INITIAL_UPLOAD_REQUIRES_APPROVAL', false],
    [{ localPopulated: true, remoteAggregateCount: 0, hasAcknowledgedState: false, initialUploadApproved: true }, 'INITIAL_UPLOAD', true],
    [{ localPopulated: false, remoteAggregateCount: 3, hasAcknowledgedState: false, initialUploadApproved: true }, 'RESTORE_REQUIRED', false],
    [{ localPopulated: true, remoteAggregateCount: 1, hasAcknowledgedState: false, initialUploadApproved: false }, 'RECONCILIATION_REQUIRED', false],
    [{ localPopulated: true, remoteAggregateCount: 1, hasAcknowledgedState: false, initialUploadApproved: true }, 'RECONCILIATION_REQUIRED', false],
    [{ localPopulated: true, remoteAggregateCount: 9, hasAcknowledgedState: true, initialUploadApproved: false }, 'ALREADY_SYNCED', true],
    [{ localPopulated: false, remoteAggregateCount: 9, hasAcknowledgedState: true, initialUploadApproved: false }, 'ALREADY_SYNCED', true],
  ] as const)('%j → %s', (facts, decision, pushes) => {
    expect(classifySyncBootstrap(facts)).toBe(decision);
    expect(isPushEnabled(decision)).toBe(pushes);
  });

  it('refuses a remote count that is not a non-negative integer instead of guessing "empty"', () => {
    for (const remoteAggregateCount of [-1, 0.5, Number.NaN]) {
      expect(() =>
        classifySyncBootstrap({
          localPopulated: true,
          remoteAggregateCount,
          hasAcknowledgedState: false,
          initialUploadApproved: true,
        }),
      ).toThrow(RangeError);
    }
  });
});

describe('local population', () => {
  it('the seed marker, the binding and the sync bookkeeping do not count as data', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, () => createTestSeed({ clients: [], services: [], products: [], appointments: [] }));
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    expect(isLocalDatabasePopulated(db)).toBe(false);

    const populated = openTestDatabase();
    bootstrapPersistence(populated, () => createTestSeed({ services: [], products: [], appointments: [] }));
    expect(isLocalDatabasePopulated(populated)).toBe(true);
  });
});

describe('stored decision', () => {
  it('round-trips per Business and ignores an unreadable or foreign record', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)).toBeUndefined();

    writeSyncBootstrapRecord(db, { businessId: REMOTE_BUSINESS_ID, decision: 'INITIAL_UPLOAD', decidedAt: NOW });
    expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)).toEqual({
      businessId: REMOTE_BUSINESS_ID,
      decision: 'INITIAL_UPLOAD',
      decidedAt: NOW,
    });
    expect(readSyncBootstrapRecord(db, 'another-business')).toBeUndefined();

    for (const value of ['not json', '[]', '{"businessId":"' + REMOTE_BUSINESS_ID + '","decision":"LOCAL_WINS","decidedAt":"x"}']) {
      writeMetadata(db, SYNC_BOOTSTRAP_KEY, value);
      expect(readSyncBootstrapRecord(db, REMOTE_BUSINESS_ID)).toBeUndefined();
    }
  });
});

describe('isStoredPushDecisionCurrent — what a STORED decision still licenses', () => {
  const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

  it('EMPTY holds only while there is nothing to push: the first aggregate OR outbox entry makes it stale', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, emptySeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    expect(isStoredPushDecisionCurrent(db, REMOTE_BUSINESS_ID, 'EMPTY')).toBe(true);

    insertClient(db, clientLea);
    expect(isStoredPushDecisionCurrent(db, REMOTE_BUSINESS_ID, 'EMPTY')).toBe(false);

    // Tables empty again, but a pending entry remains: still stale — re-classified, never assumed.
    deleteClientPermanently(db, clientLea.id);
    expect(isLocalDatabasePopulated(db)).toBe(false);
    expect(isStoredPushDecisionCurrent(db, REMOTE_BUSINESS_ID, 'EMPTY')).toBe(false);
  });

  it('ALREADY_SYNCED needs real acknowledged state for THIS Business; INITIAL_UPLOAD is the durable approved licence; STOP states never are', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    expect(isStoredPushDecisionCurrent(db, REMOTE_BUSINESS_ID, 'ALREADY_SYNCED')).toBe(false);

    writeAcknowledgedRemoteVersion(db, {
      businessId: 'another-business',
      aggregateType: 'CLIENT',
      aggregateId: clientLea.id,
      remoteVersion: 1,
      lastSyncedAt: NOW,
    });
    expect(isStoredPushDecisionCurrent(db, REMOTE_BUSINESS_ID, 'ALREADY_SYNCED')).toBe(false);

    writeAcknowledgedRemoteVersion(db, {
      businessId: REMOTE_BUSINESS_ID,
      aggregateType: 'CLIENT',
      aggregateId: clientLea.id,
      remoteVersion: 1,
      lastSyncedAt: NOW,
    });
    expect(isStoredPushDecisionCurrent(db, REMOTE_BUSINESS_ID, 'ALREADY_SYNCED')).toBe(true);
    expect(isStoredPushDecisionCurrent(db, REMOTE_BUSINESS_ID, 'INITIAL_UPLOAD')).toBe(true);
    for (const stop of ['INITIAL_UPLOAD_REQUIRES_APPROVAL', 'RESTORE_REQUIRED', 'RECONCILIATION_REQUIRED'] as const) {
      expect(isStoredPushDecisionCurrent(db, REMOTE_BUSINESS_ID, stop)).toBe(false);
    }
  });
});

describe('isSyncBootstrapPending — what the periodic check may settle on its own (V1D.1)', () => {
  const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });
  const store = (db: ReturnType<typeof openTestDatabase>, decision: Parameters<typeof writeSyncBootstrapRecord>[1]['decision']) =>
    writeSyncBootstrapRecord(db, { businessId: REMOTE_BUSINESS_ID, decision, decidedAt: NOW });

  it('a Business that was never classified is pending', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, emptySeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    expect(isSyncBootstrapPending(db, REMOTE_BUSINESS_ID)).toBe(true);
  });

  it('EMPTY is settled while nothing exists locally, and pending from the first aggregate on', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, emptySeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    store(db, 'EMPTY');
    expect(isSyncBootstrapPending(db, REMOTE_BUSINESS_ID)).toBe(false);

    insertClient(db, clientLea);
    expect(isSyncBootstrapPending(db, REMOTE_BUSINESS_ID)).toBe(true);
  });

  it('the one-sided STOPs are pending (the automatic first sync did not complete); a reconciliation never is', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);

    store(db, 'INITIAL_UPLOAD_REQUIRES_APPROVAL');
    expect(isSyncBootstrapPending(db, REMOTE_BUSINESS_ID)).toBe(true);
    store(db, 'RESTORE_REQUIRED');
    expect(isSyncBootstrapPending(db, REMOTE_BUSINESS_ID)).toBe(true);

    store(db, 'RECONCILIATION_REQUIRED');
    expect(isSyncBootstrapPending(db, REMOTE_BUSINESS_ID)).toBe(false);
  });

  it('a synchronizing Business is settled: INITIAL_UPLOAD always, ALREADY_SYNCED while acknowledged state exists', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);

    store(db, 'INITIAL_UPLOAD');
    expect(isSyncBootstrapPending(db, REMOTE_BUSINESS_ID)).toBe(false);

    store(db, 'ALREADY_SYNCED');
    expect(isSyncBootstrapPending(db, REMOTE_BUSINESS_ID)).toBe(true); // nothing acknowledged: classify again
    writeAcknowledgedRemoteVersion(db, {
      businessId: REMOTE_BUSINESS_ID,
      aggregateType: 'CLIENT',
      aggregateId: clientLea.id,
      remoteVersion: 1,
      lastSyncedAt: NOW,
    });
    expect(isSyncBootstrapPending(db, REMOTE_BUSINESS_ID)).toBe(false);
  });
});

describe('enqueueInitialUpload', () => {
  it('queues every aggregate of the bound Business once, keeps existing entries, skips acknowledged ones and foreign rows, writes no sync_state', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    updateClient(db, { ...clientLea, firstName: 'Léa-Rose' });
    writeAcknowledgedRemoteVersion(db, {
      businessId: REMOTE_BUSINESS_ID,
      aggregateType: 'PRODUCT',
      aggregateId: 'product-serum',
      remoteVersion: 4,
      lastSyncedAt: NOW,
    });
    db.runSync('UPDATE services SET business_id = ? WHERE id = ?', ['fixture-business', 'service-cut']);

    expect(enqueueInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toBe(3);
    expect(enqueueInitialUpload(db, REMOTE_BUSINESS_ID, NOW)).toBe(0);

    expect(
      loadSyncOutbox(db, REMOTE_BUSINESS_ID).map((entry) => [entry.aggregateType, entry.aggregateId, entry.operation, entry.revision]),
    ).toEqual([
      ['CLIENT', 'client-lea', 'UPSERT', 2],
      ['SERVICE', 'service-color', 'UPSERT', 1],
      ['PRODUCT', 'product-mask', 'UPSERT', 1],
      ['APPOINTMENT', 'appointment-lea', 'UPSERT', 1],
    ]);
    expect(loadSyncState(db, REMOTE_BUSINESS_ID)).toHaveLength(1);
  });
});

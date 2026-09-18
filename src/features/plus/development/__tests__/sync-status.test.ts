import { bootstrapPersistence } from '@/persistence/bootstrap';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import { updateClient } from '@/persistence/stores/clients';
import {
  approveInitialRestore,
  approveInitialUpload,
  writeSyncBootstrapRecord,
  type SyncBootstrapDecision,
} from '@/persistence/sync/bootstrap';
import { writeSyncPullCursor } from '@/persistence/sync/pull-cursor';
import { findSyncOutboxEntry, recordSyncOutboxFailure } from '@/persistence/sync/outbox';
import type { SyncRunResult } from '@/persistence/sync/push-worker';
import {
  clientLea,
  createTestSeed,
  REMOTE_BUSINESS_ID,
  remoteBusinessProfile,
} from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import {
  canApproveInitialRestore,
  canApproveInitialUpload,
  formatSyncRunResult,
  readDevelopmentSyncStatus,
  readLastSyncResult,
  rememberLastSyncResult,
  type DevelopmentSyncStatus,
} from '../sync-status';

const NOW = new Date('2026-09-17T09:00:00.000Z');

function openBoundDatabase() {
  const db = openTestDatabase();
  bootstrapPersistence(db, createTestSeed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

describe('readDevelopmentSyncStatus', () => {
  it('reports nothing for an unbound database', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const status = readDevelopmentSyncStatus(db);
    expect(status).toEqual({
      business: undefined,
      decision: undefined,
      decisionStale: false,
      approvalPending: false,
      restoreApprovalPending: false,
      pullCursor: undefined,
      pendingOutboxCount: 0,
      failedOutboxCount: 0,
      acknowledgedCount: 0,
    });
    expect(canApproveInitialUpload(status)).toBe(false);
    expect(canApproveInitialRestore(status)).toBe(false);
  });

  it('reads the BOUND Business, the stored state, the pending approval and the outbox counts', () => {
    const db = openBoundDatabase();
    expect(readDevelopmentSyncStatus(db)).toMatchObject({
      business: { id: REMOTE_BUSINESS_ID, name: 'Maison Léa' },
      decision: undefined,
      pendingOutboxCount: 0,
    });

    writeSyncBootstrapRecord(db, { businessId: REMOTE_BUSINESS_ID, decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL', decidedAt: NOW });
    updateClient(db, { ...clientLea, firstName: 'Léa-Marie' });
    const entry = findSyncOutboxEntry(db, REMOTE_BUSINESS_ID, { aggregateType: 'CLIENT', aggregateId: clientLea.id });
    recordSyncOutboxFailure(db, entry!.id, 'NETWORK', undefined);

    const blocked = readDevelopmentSyncStatus(db);
    expect(blocked).toMatchObject({
      decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL',
      approvalPending: false,
      pendingOutboxCount: 1,
      failedOutboxCount: 1,
      acknowledgedCount: 0,
    });
    expect(canApproveInitialUpload(blocked)).toBe(true);

    approveInitialUpload(db, REMOTE_BUSINESS_ID, NOW);
    const approved = readDevelopmentSyncStatus(db);
    expect(approved.approvalPending).toBe(true);
    // Already approved: the action goes off again until the next run consumed it.
    expect(canApproveInitialUpload(approved)).toBe(false);
  });
});

describe('stale stored decision', () => {
  it('flags a stored EMPTY as stale once local data exists — and still offers no approval until a run re-classified', () => {
    const db = openBoundDatabase();
    writeSyncBootstrapRecord(db, { businessId: REMOTE_BUSINESS_ID, decision: 'EMPTY', decidedAt: NOW });
    const status = readDevelopmentSyncStatus(db);
    expect(status).toMatchObject({ decision: 'EMPTY', decisionStale: true });
    expect(canApproveInitialUpload(status)).toBe(false);
  });
});

describe('canApproveInitialUpload', () => {
  const base: DevelopmentSyncStatus = {
    business: { id: REMOTE_BUSINESS_ID, name: 'Maison Léa' },
    decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL',
    decisionStale: false,
    approvalPending: false,
    restoreApprovalPending: false,
    pullCursor: undefined,
    pendingOutboxCount: 0,
    failedOutboxCount: 0,
    acknowledgedCount: 0,
  };

  it('is on only for INITIAL_UPLOAD_REQUIRES_APPROVAL on a bound Business', () => {
    expect(canApproveInitialUpload(base)).toBe(true);
    expect(canApproveInitialUpload({ ...base, business: undefined })).toBe(false);
  });

  it.each<SyncBootstrapDecision | undefined>([
    undefined,
    'EMPTY',
    'INITIAL_UPLOAD',
    'ALREADY_SYNCED',
    'RESTORE_REQUIRED',
    'RECONCILIATION_REQUIRED',
  ])('is off for %s', (decision) => {
    expect(canApproveInitialUpload({ ...base, decision })).toBe(false);
  });
});

describe('restore state (Cloud Sync V1D)', () => {
  const emptySeed = () => createTestSeed({ clients: [], services: [], products: [], appointments: [] });

  function openEmptyBoundDatabase() {
    const db = openTestDatabase();
    bootstrapPersistence(db, emptySeed);
    bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
    return db;
  }

  it('offers the restore approval only for a stored RESTORE_REQUIRED, and reports the pending approval and the pull cursor', () => {
    const db = openEmptyBoundDatabase();
    expect(canApproveInitialRestore(readDevelopmentSyncStatus(db))).toBe(false); // not classified yet

    writeSyncBootstrapRecord(db, { businessId: REMOTE_BUSINESS_ID, decision: 'RESTORE_REQUIRED', decidedAt: NOW });
    const required = readDevelopmentSyncStatus(db);
    expect(required).toMatchObject({ decision: 'RESTORE_REQUIRED', restoreApprovalPending: false, pullCursor: undefined });
    expect(canApproveInitialRestore(required)).toBe(true);
    expect(canApproveInitialUpload(required)).toBe(false);

    expect(approveInitialRestore(db, REMOTE_BUSINESS_ID, NOW).status).toBe('APPROVED');
    const approved = readDevelopmentSyncStatus(db);
    expect(approved.restoreApprovalPending).toBe(true);
    expect(canApproveInitialRestore(approved)).toBe(false); // never twice

    writeSyncPullCursor(db, REMOTE_BUSINESS_ID, NOW);
    expect(readDevelopmentSyncStatus(db).pullCursor).toEqual(NOW);
  });

  it.each<SyncBootstrapDecision | undefined>([
    undefined,
    'EMPTY',
    'INITIAL_UPLOAD_REQUIRES_APPROVAL',
    'INITIAL_UPLOAD',
    'ALREADY_SYNCED',
    'RECONCILIATION_REQUIRED',
  ])('the restore approval is off for %s', (decision) => {
    const status: DevelopmentSyncStatus = {
      business: { id: REMOTE_BUSINESS_ID, name: 'Maison Léa' },
      decision,
      decisionStale: false,
      approvalPending: false,
      restoreApprovalPending: false,
      pullCursor: undefined,
      pendingOutboxCount: 0,
      failedOutboxCount: 0,
      acknowledgedCount: 0,
    };
    expect(canApproveInitialRestore(status)).toBe(false);
  });

  it('keeps the last result line across the remount a restore causes', () => {
    rememberLastSyncResult('RESTORED · clients 1');
    expect(readLastSyncResult()).toBe('RESTORED · clients 1');
  });
});

describe('formatSyncRunResult', () => {
  it('prints state codes and counts only — never an aggregate id', () => {
    const results: readonly (readonly [SyncRunResult, string])[] = [
      [{ status: 'SKIPPED', reason: 'ALREADY_RUNNING' }, 'SKIPPED · ALREADY_RUNNING'],
      [{ status: 'BLOCKED', decision: 'INITIAL_UPLOAD_REQUIRES_APPROVAL' }, 'BLOCKED · INITIAL_UPLOAD_REQUIRES_APPROVAL'],
      [{ status: 'FAILED', reason: 'NETWORK' }, 'FAILED · NETWORK'],
      [
        {
          status: 'PUSHED',
          bootstrap: 'INITIAL_UPLOAD',
          initialUploadEnqueued: 6,
          pushed: 4,
          failed: 1,
          conflicts: [{ aggregateType: 'CLIENT', aggregateId: 'client-lea', operation: 'UPSERT', acknowledgedVersion: 1, remoteVersion: 2 }],
          stoppedBy: 'NETWORK',
        },
        'PUSHED · INITIAL_UPLOAD · enqueued 6 · pushed 4 · failed 1 · conflicts 1 · stopped by NETWORK',
      ],
      [{ status: 'FAILED', reason: 'INVALID_REMOTE_DATA' }, 'FAILED · INVALID_REMOTE_DATA'],
      [
        { status: 'RESTORED', restored: { clients: 120, services: 14, products: 9, appointments: 3, sales: 2, tombstones: 1 } },
        'RESTORED · clients 120 · services 14 · products 9 · appointments 3 · sales 2 · tombstones 1',
      ],
      [
        {
          status: 'PUSHED',
          bootstrap: 'ALREADY_SYNCED',
          initialUploadEnqueued: 0,
          pushed: 1,
          failed: 0,
          conflicts: [],
          pull: {
            status: 'PULLED',
            fetched: 4,
            applied: 1,
            deleted: 1,
            skipped: 1,
            failed: 0,
            conflicts: [{ aggregateType: 'CLIENT', aggregateId: 'client-lea', operation: 'UPSERT', acknowledgedVersion: 1, remoteVersion: 2 }],
            cursorAdvanced: true,
          },
        },
        'PUSHED · ALREADY_SYNCED · enqueued 0 · pushed 1 · failed 0 · conflicts 0 · pull fetched 4 · applied 1 · deleted 1 · skipped 1 · pull failed 0 · pull conflicts 1 · cursor advanced',
      ],
      [
        { status: 'PUSHED', bootstrap: 'ALREADY_SYNCED', initialUploadEnqueued: 0, pushed: 0, failed: 0, conflicts: [], pull: { status: 'FAILED', reason: 'UNKNOWN' } },
        'PUSHED · ALREADY_SYNCED · enqueued 0 · pushed 0 · failed 0 · conflicts 0 · pull FAILED UNKNOWN',
      ],
    ];
    for (const [result, line] of results) {
      expect(formatSyncRunResult(result)).toBe(line);
      expect(formatSyncRunResult(result)).not.toContain('client-lea');
    }
  });
});

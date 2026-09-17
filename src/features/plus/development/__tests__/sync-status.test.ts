import { bootstrapPersistence } from '@/persistence/bootstrap';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import { updateClient } from '@/persistence/stores/clients';
import {
  approveInitialUpload,
  writeSyncBootstrapRecord,
  type SyncBootstrapDecision,
} from '@/persistence/sync/bootstrap';
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
  canApproveInitialUpload,
  formatSyncRunResult,
  readDevelopmentSyncStatus,
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
      pendingOutboxCount: 0,
      failedOutboxCount: 0,
      acknowledgedCount: 0,
    });
    expect(canApproveInitialUpload(status)).toBe(false);
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
    ];
    for (const [result, line] of results) {
      expect(formatSyncRunResult(result)).toBe(line);
      expect(formatSyncRunResult(result)).not.toContain('client-lea');
    }
  });
});

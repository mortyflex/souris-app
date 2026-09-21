// Souris — development sync control: what it shows (Cloud Sync V1C–V1D.1, __DEV__ only)
//
// Plain reads of the local sync bookkeeping for the supervised validation of
// the automatic first sync (initial upload / new-device restore), the push
// and the pull. Everything here is identifiers, counts and
// state codes: no Client, Appointment or Sale value is ever read, shown or
// logged.

import type { SourisDatabase } from '@/persistence/database';
import { readBusinessProfile } from '@/persistence/stores/business-profile';
import {
  isStoredPushDecisionCurrent,
  readInitialRestoreApproval,
  readInitialUploadApproval,
  readSyncBootstrapRecord,
  type SyncBootstrapDecision,
} from '@/persistence/sync/bootstrap';
import { loadSyncOutbox } from '@/persistence/sync/outbox';
import { readSyncPullCursor } from '@/persistence/sync/pull-cursor';
import type { SyncPullSummary, SyncRunResult } from '@/persistence/sync/push-worker';
import { loadSyncState } from '@/persistence/sync/state';

export interface DevelopmentSyncStatus {
  /** The Business this DEVICE is bound to (`business_profile`), never a constant. */
  readonly business: { readonly id: string; readonly name: string } | undefined;
  /** The stored first-sync decision; undefined until a run classified both sides. */
  readonly decision: SyncBootstrapDecision | undefined;
  /**
   * The stored decision no longer licenses anything (typically EMPTY after the
   * first local aggregate): the next run classifies again. Display only — the
   * worker decides on its own.
   */
  readonly decisionStale: boolean;
  /** The runner approved the initial upload and the run that consumes it has not completed yet. */
  readonly approvalPending: boolean;
  /** The runner approved the restore; the approval stays until a restore actually commits (retry-safe). */
  readonly restoreApprovalPending: boolean;
  /** Server time of the last fully applied remote read; undefined until a restore or a first pull. */
  readonly pullCursor: Date | undefined;
  readonly pendingOutboxCount: number;
  /** Pending entries whose last attempt failed (conflicts included). */
  readonly failedOutboxCount: number;
  readonly acknowledgedCount: number;
}

export function readDevelopmentSyncStatus(db: SourisDatabase): DevelopmentSyncStatus {
  const profile = readBusinessProfile(db);
  if (!profile) {
    return {
      business: undefined,
      decision: undefined,
      decisionStale: false,
      approvalPending: false,
      restoreApprovalPending: false,
      pullCursor: undefined,
      pendingOutboxCount: 0,
      failedOutboxCount: 0,
      acknowledgedCount: 0,
    };
  }
  const outbox = loadSyncOutbox(db, profile.id);
  const decision = readSyncBootstrapRecord(db, profile.id)?.decision;
  return {
    business: { id: profile.id, name: profile.name },
    decision,
    decisionStale:
      (decision === 'EMPTY' || decision === 'ALREADY_SYNCED') &&
      !isStoredPushDecisionCurrent(db, profile.id, decision),
    approvalPending: readInitialUploadApproval(db, profile.id) !== undefined,
    restoreApprovalPending: readInitialRestoreApproval(db, profile.id) !== undefined,
    pullCursor: readSyncPullCursor(db, profile.id),
    pendingOutboxCount: outbox.length,
    failedOutboxCount: outbox.filter((entry) => entry.lastError !== undefined).length,
    acknowledgedCount: loadSyncState(db, profile.id).length,
  };
}

function formatPull(pull: SyncPullSummary | undefined): readonly string[] {
  if (!pull) return [];
  if (pull.status === 'FAILED') return [`pull FAILED ${pull.reason}`];
  return [
    `pull fetched ${pull.fetched}`,
    `applied ${pull.applied}`,
    `deleted ${pull.deleted}`,
    `skipped ${pull.skipped}`,
    `pull failed ${pull.failed}`,
    `pull conflicts ${pull.conflicts.length}`,
    `cursor ${pull.cursorAdvanced ? 'advanced' : 'held'}`,
  ];
}

/** One line for manual testing: state codes and counts only, never an aggregate id or value. */
export function formatSyncRunResult(result: SyncRunResult): string {
  switch (result.status) {
    case 'SKIPPED':
      return `SKIPPED · ${result.reason}`;
    case 'BLOCKED':
      return `BLOCKED · ${result.decision}`;
    case 'FAILED':
      return `FAILED · ${result.reason}`;
    case 'RESTORED':
      return [
        'RESTORED',
        `clients ${result.restored.clients}`,
        `services ${result.restored.services}`,
        `products ${result.restored.products}`,
        `appointments ${result.restored.appointments}`,
        `sales ${result.restored.sales}`,
        `calendar blocks ${result.restored.calendarBlocks}`,
        `tombstones ${result.restored.tombstones}`,
      ].join(' · ');
    case 'PUSHED':
      return [
        `PUSHED · ${result.bootstrap}`,
        `enqueued ${result.initialUploadEnqueued}`,
        `pushed ${result.pushed}`,
        `failed ${result.failed}`,
        `conflicts ${result.conflicts.length}`,
        ...(result.stoppedBy ? [`stopped by ${result.stoppedBy}`] : []),
        ...formatPull(result.pull),
      ].join(' · ');
  }
}

// A run that restored or pulled data remounts the whole tree under the
// persistence boundary — this sheet included — so its component state is
// gone by the time the tester reopens it. The last result line is therefore
// kept here, in this `__DEV__`-only module, for the lifetime of the process.
let lastResultLine: string | undefined;

export function rememberLastSyncResult(line: string | undefined): void {
  lastResultLine = line;
}

export function readLastSyncResult(): string | undefined {
  return lastResultLine;
}

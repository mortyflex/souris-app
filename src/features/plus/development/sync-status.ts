// Souris — development sync control: what it shows (Cloud Sync V1C, __DEV__ only)
//
// Plain reads of the local sync bookkeeping for the supervised validation of
// the initial-upload approval. Everything here is identifiers, counts and
// state codes: no Client, Appointment or Sale value is ever read, shown or
// logged.

import type { SourisDatabase } from '@/persistence/database';
import { readBusinessProfile } from '@/persistence/stores/business-profile';
import {
  isStoredPushDecisionCurrent,
  readInitialUploadApproval,
  readSyncBootstrapRecord,
  type SyncBootstrapDecision,
} from '@/persistence/sync/bootstrap';
import { loadSyncOutbox } from '@/persistence/sync/outbox';
import type { SyncRunResult } from '@/persistence/sync/push-worker';
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
  /** An approval was given and waits for the next run to consume it. */
  readonly approvalPending: boolean;
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
    pendingOutboxCount: outbox.length,
    failedOutboxCount: outbox.filter((entry) => entry.lastError !== undefined).length,
    acknowledgedCount: loadSyncState(db, profile.id).length,
  };
}

/**
 * The approval action is offered ONLY for a bound Business whose stored
 * state is exactly INITIAL_UPLOAD_REQUIRES_APPROVAL and that has no approval
 * waiting already. Every other state — unclassified included — keeps it off.
 */
export function canApproveInitialUpload(status: DevelopmentSyncStatus): boolean {
  return (
    status.business !== undefined &&
    status.decision === 'INITIAL_UPLOAD_REQUIRES_APPROVAL' &&
    !status.approvalPending
  );
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
    case 'PUSHED':
      return [
        `PUSHED · ${result.bootstrap}`,
        `enqueued ${result.initialUploadEnqueued}`,
        `pushed ${result.pushed}`,
        `failed ${result.failed}`,
        `conflicts ${result.conflicts.length}`,
        ...(result.stoppedBy ? [`stopped by ${result.stoppedBy}`] : []),
      ].join(' · ');
  }
}

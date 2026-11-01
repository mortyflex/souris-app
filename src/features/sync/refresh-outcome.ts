// BeautIzzy — what a manual refresh (pull-to-refresh) may say of its run
//
// The gesture runs the cloud sync runner's own orchestration (CLOUD_SYNC.md
// §29) and ends with ONE of four outcomes, read from the run result alone:
//
//   SYNCED       the remote was reached and the exchange went through: what
//                was pending went up, what changed elsewhere came down. The
//                screen already shows it (snapshot re-read, sync revision);
//                nothing else is said — a refusal or a conflict is shown by
//                the record it concerns, never by the gesture.
//   OFFLINE      the remote could not be reached (NETWORK): nothing was lost,
//                nothing was applied, the local data stays as it is.
//   FAILED       the remote answered badly (a server failure, invalid remote
//                data, a local failure): same — never worded as synchronized.
//   UNAVAILABLE  no exchange is possible on this device right now: no live
//                session (the offline fallback, signed out), no gateway, a
//                first sync that waits for a reconciliation, a device that is
//                not bound. Nothing happened.
//
// Every outcome but SYNCED has ONE line of copy, the same for the capsule the
// screen shows (SyncRefreshFeedback) and for the screen reader. Pure: no React,
// no persistence call.

import type { SyncRunResult } from '@/persistence/sync/push-worker';

export type SyncRefreshOutcome = 'SYNCED' | 'OFFLINE' | 'FAILED' | 'UNAVAILABLE';

export function describeSyncRefreshOutcome(result: SyncRunResult | undefined): SyncRefreshOutcome {
  if (result === undefined) return 'UNAVAILABLE';
  switch (result.status) {
    case 'SKIPPED':
    case 'BLOCKED':
      return 'UNAVAILABLE';
    case 'FAILED':
      return result.reason === 'NETWORK' ? 'OFFLINE' : 'FAILED';
    case 'RESTORED':
      return 'SYNCED';
    case 'PUSHED':
      // The push pass stopped on a run-level failure, or the pull could not read the remote.
      if (result.stoppedBy === 'NETWORK') return 'OFFLINE';
      if (result.pull?.status === 'FAILED') return result.pull.reason === 'NETWORK' ? 'OFFLINE' : 'FAILED';
      return result.stoppedBy === undefined ? 'SYNCED' : 'FAILED';
  }
}

export const SYNC_REFRESH_OFFLINE_COPY = 'Actualisation impossible. Vérifiez votre connexion.';
export const SYNC_REFRESH_FAILED_COPY = 'Actualisation impossible. Réessayez.';
export const SYNC_REFRESH_UNAVAILABLE_COPY = 'Actualisation impossible pour le moment.';

/** The one line said of a refresh that could not synchronize; nothing on success (the data speaks). */
export function describeSyncRefreshFeedback(outcome: SyncRefreshOutcome): string | undefined {
  switch (outcome) {
    case 'SYNCED':
      return undefined;
    case 'OFFLINE':
      return SYNC_REFRESH_OFFLINE_COPY;
    case 'FAILED':
      return SYNC_REFRESH_FAILED_COPY;
    case 'UNAVAILABLE':
      return SYNC_REFRESH_UNAVAILABLE_COPY;
  }
}

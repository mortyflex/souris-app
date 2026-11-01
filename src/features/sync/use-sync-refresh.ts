// BeautIzzy — the ONE pull-to-refresh behaviour of the product screens
//
// A pull runs a REAL synchronization — the cloud sync runner's own
// orchestration, against the configured remote — and the native indicator
// lasts exactly as long as it does. It never re-reads an unchanged SQLite
// snapshot and pretends: what the run brought is already on the screen when
// the indicator retracts (an applied pull re-reads the snapshot in place, a
// settled or refused entry advances the sync revision).
//
//   pull while idle          one run (joined by every other screen's pull)
//   pull while a run is     joins it: one request, the indicator lasts until
//   in flight               that run ends — ten quick pulls make one request
//   pull while this screen  ignored: the indicator is already up
//   is already refreshing
//   no run possible          nothing to run (offline session, signed out, no
//                            gateway): the indicator retracts at once and the
//                            gesture says so — never a success
//   no runner at all         the Playground demo, a tree without a runner:
//                            nothing synchronizes here by design, so the
//                            indicator retracts and NOTHING is said — an
//                            « actualisation impossible » would be misleading
//   the remote failed        same: local data stays, nothing is lost, the next
//                            tick or pull tries again
//
// What "says so" is: one warning haptic, one screen-reader announcement, and
// ONE line in the shared capsule (SyncRefreshFeedback) for a moment — the
// same line for the three of them (refresh-outcome.ts). Success shows
// nothing: the data speaks. Local-first is untouched: the run is the ordinary
// one — pending writes are pushed first, then what changed elsewhere is
// pulled under the conservative contract (CLOUD_SYNC.md §9). No screen state
// is reset.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useCloudSyncControl } from '@/providers/CloudSyncControl';
import { haptics } from '@/shared/lib/haptics';

import { publishSyncRefreshFeedback } from './refresh-feedback';
import {
  describeSyncRefreshFeedback,
  describeSyncRefreshOutcome,
  type SyncRefreshOutcome,
} from './refresh-outcome';

export interface SyncRefresh {
  /** The native indicator is shown while true: from the pull to the end of the run it joined. */
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  /** The last outcome of a pull of this screen, for surfaces that want to show it. */
  readonly lastOutcome: SyncRefreshOutcome | undefined;
}

function report(outcome: SyncRefreshOutcome): void {
  const text = describeSyncRefreshFeedback(outcome);
  if (text === undefined) return;
  haptics.warning();
  AccessibilityInfo.announceForAccessibility(text);
  publishSyncRefreshFeedback(text);
}

export function useSyncRefresh(): SyncRefresh {
  const { runner, refreshNow } = useCloudSyncControl();
  const [refreshing, setRefreshing] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<SyncRefreshOutcome | undefined>(undefined);
  // Guards and lifetime outside the render closure: a pull during a pull is one pull.
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    void (async () => {
      let outcome: SyncRefreshOutcome;
      try {
        outcome = describeSyncRefreshOutcome(refreshNow ? await refreshNow() : undefined);
      } catch {
        // The runner never rejects; a defensive floor so the indicator always retracts.
        outcome = 'FAILED';
      }
      inFlight.current = false;
      if (!mounted.current) return;
      setRefreshing(false);
      setLastOutcome(outcome);
      if (runner) report(outcome);
    })();
  }, [runner, refreshNow]);

  return { refreshing, onRefresh, lastOutcome };
}

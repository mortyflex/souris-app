// Souris — cloud sync runner (Cloud Sync V1C push, V1D restore + pull)
//
// The ONLY place that decides WHEN the sync worker runs. It renders nothing
// of its own (children pass through), owns no state the UI reads, and never
// blocks a screen: a run is
// fire-and-forget, the worker never rejects, and SQLite stays the source of
// truth whether the run succeeds, fails, or never happens (offline).
//
// A run is allowed only while ALL of these hold:
//
//   Supabase is configured          (a sync gateway exists)
//   the Auth session is LIVE        (not the offline fallback: no valid token)
//   the Business session is ready   (the device is bound to that Business)
//
// Safe foreground / session points — no background task:
//
//   the conditions become true      (launch, sign-in, Business setup, reconnect)
//   the app returns to foreground   (AppState → active)
//   a slow foreground tick          ONLY when a local check finds an eligible
//                                   pending entry; an idle or blocked device
//                                   makes no request at all
//
// A run is not an upload licence: the worker itself refuses to enqueue or push
// a device's pre-existing data until `approveInitialUpload` was called for
// this exact Business (CLOUD_SYNC.md §11.1). This component never calls it.
// Nor is it a restore licence: an empty device is rebuilt from its Business
// only after `approveInitialRestore` (§11.2), which this component never
// calls either.
//
// A run that WROTE operational rows on behalf of the remote — an approved
// restore, a pull that applied or removed an aggregate — is followed by
// `reloadSnapshot()`: the feature providers hydrate once, so they are
// remounted on the fresh SQLite state. A push-only run (every run of a
// single-device Business once restored) never remounts anything.
//
// The worker is single-flight, so overlapping triggers collapse into one run.
//
// `useCloudSyncControl().runNow` hands that SAME worker to an explicit caller
// — the production restore prompt (features/sync/restore) and the development
// sync control on Plus (`__DEV__`). It is one more trigger of the same run
// under the same conditions (undefined while a run is not allowed), not a
// second worker and not a new behavior. `restoreRequired` is the ONE piece of
// sync state a product screen reads: whether the last classification of the
// bound Business was RESTORE_REQUIRED (local empty, remote populated) — read
// from the stored decision at mount, then from each run's result. It only
// makes the restore prompt appear; the prompt still asks, and the worker still
// refuses anything but an explicitly approved restore.

import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/session/AuthProvider';
import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import { readSyncBootstrapRecord } from '@/persistence/sync/bootstrap';
import {
  createSyncPushWorker,
  didSyncRunChangeLocalData,
  hasEligiblePushWork,
  type SyncRunResult,
} from '@/persistence/sync/push-worker';
import type { SourisDatabase } from '@/persistence/database';
import type { SyncRemoteGateway } from '@/persistence/sync/remote-gateway';
import { usePersistence } from '@/providers/PersistenceProvider';

/** Foreground tick between two local "is anything pending?" checks. */
export const SYNC_FOREGROUND_TICK_MS = 2 * 60_000;

export interface CloudSyncControl {
  /** Runs the runner's own single-flight worker now; undefined while a run is not allowed. */
  readonly runNow: (() => Promise<SyncRunResult>) | undefined;
  /**
   * The bound Business was last classified RESTORE_REQUIRED: this device is
   * empty and its Business holds data (CLOUD_SYNC.md §11.2). Nothing is
   * restored until the user explicitly approves it.
   */
  readonly restoreRequired: boolean;
}

const CloudSyncControlContext = createContext<CloudSyncControl>({ runNow: undefined, restoreRequired: false });

/** Outside a runner (tests, unconfigured Supabase) `runNow` is simply undefined. */
export function useCloudSyncControl(): CloudSyncControl {
  return useContext(CloudSyncControlContext);
}

interface CloudSyncRunnerProps {
  /** Undefined when Supabase is not configured: sync never runs. */
  readonly gateway: SyncRemoteGateway | undefined;
}

function isRestoreRequiredStored(database: SourisDatabase, businessId: string | undefined): boolean {
  if (businessId === undefined) return false;
  try {
    return readSyncBootstrapRecord(database, businessId)?.decision === 'RESTORE_REQUIRED';
  } catch {
    return false;
  }
}

export function CloudSyncRunner({ gateway, children }: PropsWithChildren<CloudSyncRunnerProps>) {
  const { database, reloadSnapshot } = usePersistence();
  const { state: auth } = useAuth();
  const { state: business } = useBusinessSession();

  const live = auth.status === 'authenticated' && auth.session === 'live';
  const businessId = live && business.status === 'ready' ? business.business.id : undefined;

  const worker = useMemo(
    () => (gateway ? createSyncPushWorker({ database, gateway }) : undefined),
    [database, gateway],
  );

  // Known before the first run of this mount from the stored decision (a
  // relaunch, or the remount that follows a restore), then kept by each run.
  const [restoreRequired, setRestoreRequired] = useState(() => isRestoreRequiredStored(database, businessId));

  /** One run of the single-flight worker, then the UI re-hydration it may require. */
  const runOnce = useMemo(() => {
    if (!worker || businessId === undefined) return undefined;
    return async (): Promise<SyncRunResult> => {
      const result = await worker.run(businessId);
      // Only a classification decides it: a failed run (a restore attempt
      // included) leaves the stored decision — and the prompt — as they were.
      if (result.status === 'BLOCKED') setRestoreRequired(result.decision === 'RESTORE_REQUIRED');
      else if (result.status === 'PUSHED' || result.status === 'RESTORED') setRestoreRequired(false);
      if (didSyncRunChangeLocalData(result)) reloadSnapshot();
      return result;
    };
  }, [worker, businessId, reloadSnapshot]);

  useEffect(() => {
    if (!runOnce || businessId === undefined) return;

    const run = () => void runOnce();
    run();

    // The session resolves while the app is in use; the listener keeps it current.
    let foreground = true;
    const subscription = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      if (foreground) run();
    });
    const tick = setInterval(() => {
      if (!foreground) return;
      try {
        if (hasEligiblePushWork(database, businessId, new Date())) run();
      } catch {
        // The database was closed by a reset; the next mount starts over.
      }
    }, SYNC_FOREGROUND_TICK_MS);

    return () => {
      subscription.remove();
      clearInterval(tick);
    };
  }, [runOnce, database, businessId]);

  const control = useMemo<CloudSyncControl>(
    () => ({ runNow: runOnce, restoreRequired: businessId !== undefined && restoreRequired }),
    [runOnce, businessId, restoreRequired],
  );

  return (
    <CloudSyncControlContext.Provider value={control}>{children}</CloudSyncControlContext.Provider>
  );
}

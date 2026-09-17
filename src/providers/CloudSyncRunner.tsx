// Souris — cloud sync runner (Cloud Sync V1C)
//
// The ONLY place that decides WHEN the push worker runs. It renders nothing
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
//
// The worker is single-flight, so overlapping triggers collapse into one run.
//
// `useCloudSyncControl().runNow` hands that SAME worker to an explicit caller
// — today only the development sync control on Plus (`__DEV__`). It is one
// more trigger of the same run under the same conditions (undefined while a
// run is not allowed), not a second worker and not a new behavior.

import { createContext, useContext, useEffect, useMemo, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/session/AuthProvider';
import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import {
  createSyncPushWorker,
  hasEligiblePushWork,
  type SyncRunResult,
} from '@/persistence/sync/push-worker';
import type { SyncRemoteGateway } from '@/persistence/sync/remote-gateway';
import { usePersistence } from '@/providers/PersistenceProvider';

/** Foreground tick between two local "is anything pending?" checks. */
export const SYNC_FOREGROUND_TICK_MS = 2 * 60_000;

export interface CloudSyncControl {
  /** Runs the runner's own single-flight worker now; undefined while a run is not allowed. */
  readonly runNow: (() => Promise<SyncRunResult>) | undefined;
}

const CloudSyncControlContext = createContext<CloudSyncControl>({ runNow: undefined });

/** Outside a runner (tests, unconfigured Supabase) `runNow` is simply undefined. */
export function useCloudSyncControl(): CloudSyncControl {
  return useContext(CloudSyncControlContext);
}

interface CloudSyncRunnerProps {
  /** Undefined when Supabase is not configured: sync never runs. */
  readonly gateway: SyncRemoteGateway | undefined;
}

export function CloudSyncRunner({ gateway, children }: PropsWithChildren<CloudSyncRunnerProps>) {
  const { database } = usePersistence();
  const { state: auth } = useAuth();
  const { state: business } = useBusinessSession();

  const live = auth.status === 'authenticated' && auth.session === 'live';
  const businessId = live && business.status === 'ready' ? business.business.id : undefined;

  const worker = useMemo(
    () => (gateway ? createSyncPushWorker({ database, gateway }) : undefined),
    [database, gateway],
  );

  useEffect(() => {
    if (!worker || businessId === undefined) return;

    const run = () => void worker.run(businessId);
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
  }, [worker, database, businessId]);

  const control = useMemo<CloudSyncControl>(
    () => ({
      runNow: worker && businessId !== undefined ? () => worker.run(businessId) : undefined,
    }),
    [worker, businessId],
  );

  return (
    <CloudSyncControlContext.Provider value={control}>{children}</CloudSyncControlContext.Provider>
  );
}

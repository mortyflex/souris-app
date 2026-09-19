// Souris — cloud sync runner (Cloud Sync V1C push, V1D restore + pull, V1D.1 seamless bootstrap)
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
//   a slow foreground tick          ONLY when the first-sync gate is still closed,
//                                   or a local check finds a run due
//                                   (`isSyncRunDue`): an eligible pending
//                                   entry, or a first sync that is not settled
//                                   yet — typically the first aggregate created
//                                   after an EMPTY classification. An idle
//                                   device, or one that needs a reconciliation,
//                                   makes no request at all
//
// The first sync is SEAMLESS (V1D.1, CLOUD_SYNC.md §17): the user never sees,
// approves or triggers it. The worker still refuses to upload a device's
// pre-existing data, or to rebuild an empty device, without the approval of
// this exact Business (`approveInitialUpload` / `approveInitialRestore`) —
// this component is what gives it, under the run conditions above and nowhere
// else:
//
//   BLOCKED / INITIAL_UPLOAD_REQUIRES_APPROVAL   approve, run the same worker again
//   BLOCKED / RESTORE_REQUIRED                   approve, run the same worker again
//   BLOCKED / RECONCILIATION_REQUIRED            left blocked — both sides hold
//                                                data, and nothing here ever
//                                                picks local-wins or remote-wins
//
// That orchestration is bounded: ONE approval and ONE re-run per trigger,
// whatever the second run answers. A restore that fails leaves SQLite
// unchanged and its approval pending, so the next trigger simply retries it.
//
// A run that WROTE operational rows on behalf of the remote — a restore, a
// pull that applied or removed an aggregate — is followed by
// `reloadSnapshot()`: the feature providers hydrate once, so they are
// remounted on the fresh SQLite state. A push-only run (every run of a
// single-device Business once restored) never remounts anything.
//
// The worker is single-flight and so is the orchestration around it, so
// overlapping triggers collapse into one run.
//
// FIRST-SYNC GATE (§17.3). An EMPTY device must not become operational before
// a run established what its remote Business holds: a first record created
// while a restore is still pending would make both sides populated, which
// nothing resolves automatically. `useCloudSyncControl().firstSync` tells the
// root navigator — its only reader — what to show:
//
//   ready        the app. ALWAYS for a device that holds data (offline-first is
//                untouched, RECONCILIATION_REQUIRED included), for a device
//                that ALREADY synchronizes with this Business — `sync_state`
//                holds a server-acknowledged revision, the one durable local
//                proof: such a device may be empty because its deletions were
//                synchronized, and nothing it creates can diverge — and when
//                Supabase is not configured. For any other EMPTY device (a
//                stored EMPTY or an unacknowledged INITIAL_UPLOAD prove
//                nothing): only once a run of
//                THIS session got past the first-sync decision — the remote
//                was counted empty just now, or the restore committed. A
//                decision stored by an earlier session never opens it: the
//                Business may have been populated from another device since
//   resolving    the first attempt is in flight → a quiet waiting state
//   unavailable  it failed, or no run is possible (offline session) → a plain
//                "Réessayer" state; launch / foreground / tick keep retrying
//
// Once open, the gate stays open for the rest of the session.
//
// `useCloudSyncControl().runNow` hands the SAME orchestration to that retry
// and to the development sync control on Plus (`__DEV__`). It is one more
// trigger under the same conditions (undefined while a run is not allowed),
// not a second worker and not a new behavior. No product screen reads any
// sync state.

import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/session/AuthProvider';
import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import type { SourisDatabase } from '@/persistence/database';
import {
  approveInitialRestore,
  approveInitialUpload,
  isLocalDatabasePopulated,
} from '@/persistence/sync/bootstrap';
import {
  createSyncPushWorker,
  didSyncRunChangeLocalData,
  isSyncRunDue,
  type SyncRunResult,
} from '@/persistence/sync/push-worker';
import type { SyncRemoteGateway } from '@/persistence/sync/remote-gateway';
import { hasAcknowledgedRemoteState } from '@/persistence/sync/state';
import { usePersistence } from '@/providers/PersistenceProvider';

/** Foreground tick between two local "is a run due?" checks. */
export const SYNC_FOREGROUND_TICK_MS = 2 * 60_000;

/** What the root navigator shows for the bound Business (the first-sync gate, see the header). */
export interface FirstSyncGate {
  readonly status: 'ready' | 'resolving' | 'unavailable';
  /** An attempt is in flight while `unavailable` is shown (a retry, automatic or not). */
  readonly retrying: boolean;
}

export interface CloudSyncControl {
  /** Runs the runner's own single-flight orchestration now; undefined while a run is not allowed. */
  readonly runNow: (() => Promise<SyncRunResult>) | undefined;
  readonly firstSync: FirstSyncGate;
}

const OPEN_GATE: FirstSyncGate = { status: 'ready', retrying: false };

const CloudSyncControlContext = createContext<CloudSyncControl>({ runNow: undefined, firstSync: OPEN_GATE });

/** Outside a runner (tests) `runNow` is simply undefined and the gate is open. */
export function useCloudSyncControl(): CloudSyncControl {
  return useContext(CloudSyncControlContext);
}

interface CloudSyncRunnerProps {
  /** Undefined when Supabase is not configured: sync never runs. */
  readonly gateway: SyncRemoteGateway | undefined;
}

/**
 * The automatic answer to a first-sync STOP, for THIS Business only: true when
 * an approval was recorded and the worker should run again. Both approvals
 * re-check the binding and the local state themselves and may refuse;
 * RECONCILIATION_REQUIRED has no automatic answer at all.
 */
function approveSeamlessBootstrap(database: SourisDatabase, businessId: string, result: SyncRunResult): boolean {
  if (result.status !== 'BLOCKED') return false;
  try {
    switch (result.decision) {
      case 'INITIAL_UPLOAD_REQUIRES_APPROVAL':
        return approveInitialUpload(database, businessId).status === 'APPROVED';
      case 'RESTORE_REQUIRED':
        return approveInitialRestore(database, businessId).status === 'APPROVED';
      case 'RECONCILIATION_REQUIRED':
        return false;
    }
  } catch {
    // The database was closed by a reset; the next mount starts over.
    return false;
  }
}

/** The first-sync gate of one Business, for THIS session (component state: never persisted). */
interface GateState {
  readonly businessId: string | undefined;
  readonly open: boolean;
  /** An attempt ended without opening it. */
  readonly attemptEnded: boolean;
}

/**
 * Operational without asking the remote: the device holds data, or it already
 * synchronizes with this Business (a server-acknowledged revision exists).
 */
function opensWithoutRun(database: SourisDatabase, businessId: string): boolean {
  try {
    return isLocalDatabasePopulated(database) || hasAcknowledgedRemoteState(database, businessId);
  } catch {
    // The database was closed by a reset; the next mount starts over.
    return false;
  }
}

/** At mount (or when the Business becomes ready): what opens the gate before any run. */
function initialGate(database: SourisDatabase, businessId: string | undefined): GateState {
  return { businessId, open: businessId === undefined || opensWithoutRun(database, businessId), attemptEnded: false };
}

/** A run that got past the first-sync decision: the remote was just counted empty, the device synchronizes, or it was restored. */
function didResolveFirstSync(result: SyncRunResult): boolean {
  return result.status === 'PUSHED' || result.status === 'RESTORED';
}

export function CloudSyncRunner({ gateway, children }: PropsWithChildren<CloudSyncRunnerProps>) {
  const { database, reloadSnapshot } = usePersistence();
  const { state: auth } = useAuth();
  const { state: business } = useBusinessSession();

  const live = auth.status === 'authenticated' && auth.session === 'live';
  const boundBusinessId = business.status === 'ready' ? business.business.id : undefined;
  const businessId = live ? boundBusinessId : undefined;

  // The gate follows the BOUND Business, live session or not: an empty device
  // on the offline fallback must not become operational either. Without a
  // gateway nothing ever synchronizes, so there is nothing to wait for.
  const gatedBusinessId = gateway ? boundBusinessId : undefined;
  const [gate, setGate] = useState(() => initialGate(database, gatedBusinessId));
  // The Business became ready (or changed) while mounted: decide its gate before rendering anything for it.
  if (gate.businessId !== gatedBusinessId) setGate(initialGate(database, gatedBusinessId));
  const [running, setRunning] = useState(false);
  const gateOpen = gate.businessId === gatedBusinessId ? gate.open : false;
  // Read by the tick: a closed gate is always worth a retry, even when nothing else is due
  // (an empty device with a stored EMPTY has no pending work, yet it is waiting for this check).
  const gateOpenNow = useRef(gateOpen);
  useEffect(() => {
    gateOpenNow.current = gateOpen;
  }, [gateOpen]);

  const worker = useMemo(
    () => (gateway ? createSyncPushWorker({ database, gateway }) : undefined),
    [database, gateway],
  );

  // The Business a run is allowed for RIGHT NOW. A run awaits the network, and
  // the session may end meanwhile: nothing is approved for a Business whose
  // run conditions no longer hold.
  const allowedBusinessId = useRef<string | undefined>(undefined);
  /** The orchestration below is single-flight, like the worker it drives. */
  const orchestrating = useRef(false);

  /** One bounded orchestration of the single-flight worker, then the UI re-hydration it may require. */
  const runOnce = useMemo(() => {
    if (!worker || businessId === undefined) return undefined;
    return async (): Promise<SyncRunResult> => {
      if (orchestrating.current) return { status: 'SKIPPED', reason: 'ALREADY_RUNNING' };
      orchestrating.current = true;
      setRunning(true);
      try {
        let result = await worker.run(businessId);
        // ONE approval, ONE re-run — never a loop: whatever the second run
        // answers is the result, and the next trigger starts over.
        if (
          allowedBusinessId.current === businessId &&
          approveSeamlessBootstrap(database, businessId, result)
        ) {
          result = await worker.run(businessId);
        }
        const opens = didResolveFirstSync(result) || opensWithoutRun(database, businessId);
        setGate((previous) =>
          previous.businessId === businessId
            ? { businessId, open: previous.open || opens, attemptEnded: true }
            : previous,
        );
        if (didSyncRunChangeLocalData(result)) reloadSnapshot();
        return result;
      } finally {
        orchestrating.current = false;
        setRunning(false);
      }
    };
  }, [worker, database, businessId, reloadSnapshot]);

  useEffect(() => {
    if (!runOnce || businessId === undefined) return;

    allowedBusinessId.current = businessId;
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
        if (!gateOpenNow.current || isSyncRunDue(database, businessId, new Date())) run();
      } catch {
        // The database was closed by a reset; the next mount starts over.
      }
    }, SYNC_FOREGROUND_TICK_MS);

    return () => {
      allowedBusinessId.current = undefined;
      subscription.remove();
      clearInterval(tick);
    };
  }, [runOnce, database, businessId]);

  // No run is possible (offline session): nothing is "in flight", the gate cannot open by itself.
  const gateStatus: FirstSyncGate['status'] = gateOpen
    ? 'ready'
    : gate.attemptEnded || !worker || businessId === undefined
      ? 'unavailable'
      : 'resolving';
  const control = useMemo<CloudSyncControl>(
    () => ({ runNow: runOnce, firstSync: { status: gateStatus, retrying: gateStatus === 'unavailable' && running } }),
    [runOnce, gateStatus, running],
  );

  return (
    <CloudSyncControlContext.Provider value={control}>{children}</CloudSyncControlContext.Provider>
  );
}

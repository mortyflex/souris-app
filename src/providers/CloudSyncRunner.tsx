// BeautIzzy — cloud sync runner (Cloud Sync V1C push, V1D restore + pull, V1D.1 seamless bootstrap)
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
//   the foreground tick (2 min)     when the first-sync gate is still closed,
//                                   when a local check finds a run due
//                                   (`isSyncRunDue`: an eligible pending entry,
//                                   or a first sync not settled yet), OR when
//                                   the device already synchronizes
//                                   (`isForegroundSyncTickDue`): an idle open
//                                   device then makes ONE incremental pull
//                                   (nothing to push) and receives what other
//                                   devices changed within one tick. A device
//                                   that needs a reconciliation makes no
//                                   request. Never in the background, never a
//                                   second timer, never overlapping runs
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
// `reloadSnapshot()`, which re-reads SQLite IN PLACE: the session providers
// adopt the fresh persisted state and nothing is remounted — navigation,
// open sheets and drafts stay as they are. A run that changed nothing
// (every idle tick without remote changes) calls nothing and re-renders
// nothing below this component.
//
// The worker is single-flight and so is the orchestration around it, so
// overlapping triggers collapse into one run.
//
// FIRST-SYNC GATE (§17.3). An EMPTY device must not become operational before
// a run established what its remote Business holds: a first record created
// while a restore is still pending would make both sides populated, which
// nothing resolves automatically. the control's `firstSync` (CloudSyncControl.tsx) tells the
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
// the control's `runNow` hands the SAME orchestration to that retry
// and to the development sync control on Plus (`__DEV__`). It is one more
// trigger under the same conditions (undefined while a run is not allowed),
// not a second worker and not a new behavior.
//
// MANUAL REFRESH (pull-to-refresh, CLOUD_SYNC.md §29). `refreshNow` is the
// same orchestration again, for the gesture of a product screen: it JOINS a
// run already in flight (a tick, a foreground return, another screen's pull)
// instead of answering ALREADY_RUNNING, so the native indicator lasts for the
// real exchange and ten quick pulls make ONE request. Undefined under the
// same conditions as `runNow` (no gateway, offline session, signed out): the
// gesture then has nothing to run and says so (features/sync).
//
// SYNC REVISION. The sync bookkeeping — the outbox and the acknowledged
// revisions — is what the UI reads to say where a record stands with the
// remote (« Pas encore synchronisé », « Synchronisé », « Refusé par le
// serveur »). A push-only run rewrites it without touching one operational
// row, so `reloadSnapshot()` is not involved and nothing would re-render:
// the label of a refund just sent stayed stale until the user left the
// screen. The runner provides `CloudSyncRevision` — the counter that advances
// after every run that changed that bookkeeping
// (`didSyncRunChangeSyncBookkeeping`); the session providers that read it
// re-read SQLite on that change and nowhere else. An idle run that exchanged
// nothing advances nothing and re-renders nothing. It is its own context and
// its own module, apart from the control: the root navigator and the Plus
// control never re-render for it, and a session provider never depends on
// this runner.
//
// PLUS BACK (BeautIzzy Plus Phase 6.5C, step 3). When the server refuses the
// Business's writes for lack of a Plus entitlement, the worker puts the push
// pass on HOLD (persistence/sync/entitlement-hold.ts) and keeps pulling. The
// moment the access session turns from read-only to full — a verified
// entitlement, a purchase, a restore — this runner clears the hold of the
// bound Business and runs ONCE more, under the same conditions as every
// trigger: the held writes are sent again, in order, through the same
// single-flight worker. It assumes nothing about the server: a refusal then
// records a fresh hold. With enforcement disabled the access session never
// turns, so nothing here ever fires; without an access provider above
// (tests of the runner alone) the same.

import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { useOptionalBusinessAccess } from '@/features/access/session/BusinessAccessProvider';
import { useAuth } from '@/features/auth/session/AuthProvider';
import { useBusinessSession } from '@/features/business/session/BusinessSessionProvider';
import type { SourisDatabase } from '@/persistence/database';
import {
  approveInitialRestore,
  approveInitialUpload,
  isLocalDatabasePopulated,
} from '@/persistence/sync/bootstrap';
import { liftSyncEntitlementHold } from '@/persistence/sync/entitlement-hold';
import {
  createSyncPushWorker,
  didSyncRunChangeLocalData,
  didSyncRunChangeSyncBookkeeping,
  isForegroundSyncTickDue,
  type SyncRunResult,
} from '@/persistence/sync/push-worker';
import type { SyncRemoteGateway } from '@/persistence/sync/remote-gateway';
import { hasAcknowledgedRemoteState } from '@/persistence/sync/state';
import {
  CloudSyncControlProvider,
  type CloudSyncControl,
  type FirstSyncGate,
} from '@/providers/CloudSyncControl';
import { CloudSyncRevisionProvider } from '@/providers/CloudSyncRevision';
import { usePersistence } from '@/providers/PersistenceProvider';

import { createSyncOrchestration, createSyncOrchestrationLock } from './cloud-sync-orchestration';

/** Foreground tick between two local "is a run due?" checks. */
export const SYNC_FOREGROUND_TICK_MS = 2 * 60_000;

/** The control contract and its hook live in CloudSyncControl.tsx; re-exported for the readers that name the runner. */
export { useCloudSyncControl, type CloudSyncControl, type FirstSyncGate } from '@/providers/CloudSyncControl';

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
  const [revision, setRevision] = useState(0);
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
  /** The orchestration below is single-flight, like the worker it drives; the lock lives as long as the runner. */
  const [lock] = useState(createSyncOrchestrationLock);

  /**
   * One bounded orchestration of the single-flight worker, then the UI
   * re-hydration it may require. `runOnce` for the automatic triggers,
   * `refreshNow` for the pull gesture (cloud-sync-orchestration.ts).
   */
  const orchestration = useMemo(() => {
    if (!worker || businessId === undefined) return undefined;
    return createSyncOrchestration(lock, async (): Promise<SyncRunResult> => {
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
        if (didSyncRunChangeSyncBookkeeping(result)) setRevision((current) => current + 1);
        return result;
      } finally {
        setRunning(false);
      }
    });
  }, [worker, database, businessId, reloadSnapshot, lock]);
  const runOnce = orchestration?.runOnce;
  const refreshNow = orchestration?.refreshNow;

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
        if (!gateOpenNow.current || isForegroundSyncTickDue(database, businessId, new Date())) run();
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

  // Plus back: the access session turned from read-only to full. The hold of
  // the bound Business is lifted and ONE run follows, under the same
  // conditions as every trigger. Only the transition fires it — never a
  // render, never a session that was full all along (enforcement disabled).
  const access = useOptionalBusinessAccess();
  const canMutate = access?.canMutate;
  const previousCanMutate = useRef(canMutate);
  useEffect(() => {
    const regained = previousCanMutate.current === false && canMutate === true;
    previousCanMutate.current = canMutate;
    if (!regained || !runOnce || businessId === undefined) return;
    try {
      liftSyncEntitlementHold(database, businessId);
    } catch {
      // The database was closed by a reset; the next mount starts over.
      return;
    }
    void runOnce();
  }, [canMutate, runOnce, database, businessId]);

  // No run is possible (offline session): nothing is "in flight", the gate cannot open by itself.
  const gateStatus: FirstSyncGate['status'] = gateOpen
    ? 'ready'
    : gate.attemptEnded || !worker || businessId === undefined
      ? 'unavailable'
      : 'resolving';
  // `running` matters to readers only while the gate is unavailable: an idle
  // periodic run of an open app must not hand the tree a new context value.
  const retrying = gateStatus === 'unavailable' && running;
  const control = useMemo<CloudSyncControl>(
    () => ({ runner: true, runNow: runOnce, refreshNow, firstSync: { status: gateStatus, retrying } }),
    [runOnce, refreshNow, gateStatus, retrying],
  );

  return (
    <CloudSyncControlProvider value={control}>
      <CloudSyncRevisionProvider value={revision}>{children}</CloudSyncRevisionProvider>
    </CloudSyncControlProvider>
  );
}

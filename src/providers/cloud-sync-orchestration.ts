// BeautIzzy — single-flight orchestration of the sync worker (plain TypeScript)
//
// The cloud sync runner decides WHEN a run happens; this module decides what
// happens when two triggers meet:
//
//   runOnce     the automatic triggers (launch, foreground, tick, Plus back,
//               the development control): a run already in flight answers
//               SKIPPED / ALREADY_RUNNING at once — never a second request
//   refreshNow  the manual refresh of a product screen (pull-to-refresh,
//               CLOUD_SYNC.md §29): JOINS the run in flight and resolves with
//               its result, or starts one — ten quick pulls make one request,
//               and the native indicator lasts for the real exchange
//
// The lock outlives the orchestration: the runner recreates the orchestration
// whenever its run conditions change (session, Business, gateway) and keeps
// ONE lock for its whole life, so a run started under the previous conditions
// is still "in flight" for the next ones. No React here: the runner owns the
// state updates and hands this module the run to perform.

import type { SyncRunResult } from '@/persistence/sync/push-worker';

export interface SyncOrchestrationLock {
  running: boolean;
  inFlight: Promise<SyncRunResult> | undefined;
}

export function createSyncOrchestrationLock(): SyncOrchestrationLock {
  return { running: false, inFlight: undefined };
}

export interface SyncOrchestration {
  /** One run, unless one is in flight (SKIPPED / ALREADY_RUNNING). Never rejects when `run` never does. */
  readonly runOnce: () => Promise<SyncRunResult>;
  /** The run in flight, or a new one. */
  readonly refreshNow: () => Promise<SyncRunResult>;
}

export function createSyncOrchestration(
  lock: SyncOrchestrationLock,
  run: () => Promise<SyncRunResult>,
): SyncOrchestration {
  const runOnce = async (): Promise<SyncRunResult> => {
    if (lock.running) return { status: 'SKIPPED', reason: 'ALREADY_RUNNING' };
    lock.running = true;
    const attempt = (async () => {
      try {
        return await run();
      } finally {
        lock.running = false;
        lock.inFlight = undefined;
      }
    })();
    lock.inFlight = attempt;
    return attempt;
  };
  const refreshNow = (): Promise<SyncRunResult> => lock.inFlight ?? runOnce();
  return { runOnce, refreshNow };
}

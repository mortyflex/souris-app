// BeautIzzy — the cloud sync control (what the UI may ask of the cloud sync runner)
//
// The runner (CloudSyncRunner.tsx) provides it; four readers exist:
//
//   the root navigator        `firstSync` — the first-sync gate of an empty device
//                             (and `runNow` for its « Réessayer »)
//   the pull-to-refresh       `refreshNow` — a run on demand, joining the one in
//   (features/sync)           flight (CLOUD_SYNC.md §29)
//   the account conflict      `whenIdle` — before handing the device over to
//                             another account, the run still in flight for the
//                             released account is awaited (AUTH.md §6)
//   the development control   `runNow`, under __DEV__ only
//
// Its own module, apart from the runner, so a product screen that offers the
// gesture depends on this contract alone — never on the runner, its worker or
// its gateway: the Playground demo and the tests mount screens without any
// runner (`runner: false`), and the gesture then has nothing to run and
// nothing to say — a demo has no remote, so it cannot fail to reach one.

import { createContext, useContext } from 'react';

import type { SyncRunResult } from '@/persistence/sync/push-worker';

/** What the root navigator shows for the bound Business (the first-sync gate, CloudSyncRunner.tsx). */
export interface FirstSyncGate {
  readonly status: 'ready' | 'resolving' | 'unavailable';
  /** An attempt is in flight while `unavailable` is shown (a retry, automatic or not). */
  readonly retrying: boolean;
}

export interface CloudSyncControl {
  /**
   * A cloud sync runner is mounted above: this device MAY synchronize. False
   * where nothing ever synchronizes (the Playground demo, tests without a
   * runner) — the pull gesture then stays silent instead of reporting an
   * unavailability that would be misleading.
   */
  readonly runner: boolean;
  /** Runs the runner's own single-flight orchestration now; undefined while a run is not allowed. */
  readonly runNow: (() => Promise<SyncRunResult>) | undefined;
  /**
   * The manual refresh of a product screen (pull-to-refresh): the same
   * orchestration, joining a run already in flight instead of skipping.
   * Resolves with the result of the run it joined or started. Undefined
   * exactly when `runNow` is.
   */
  readonly refreshNow: (() => Promise<SyncRunResult>) | undefined;
  readonly firstSync: FirstSyncGate;
  /**
   * Resolves once no run of the worker is in flight any more — at once when
   * none is. A run started under a session that has since ended still
   * finishes (and writes its bookkeeping) on its own; whoever is about to
   * release the local database waits for it here, so nothing of the released
   * account lands after the release. Never rejects.
   */
  readonly whenIdle: () => Promise<void>;
}

export const OPEN_FIRST_SYNC_GATE: FirstSyncGate = { status: 'ready', retrying: false };

const CloudSyncControlContext = createContext<CloudSyncControl>({
  runner: false,
  runNow: undefined,
  refreshNow: undefined,
  firstSync: OPEN_FIRST_SYNC_GATE,
  whenIdle: () => Promise.resolve(),
});

/** Provided by the cloud sync runner only. */
export const CloudSyncControlProvider = CloudSyncControlContext.Provider;

/** Outside a runner (tests, the Playground demo) nothing can run and the gate is open. */
export function useCloudSyncControl(): CloudSyncControl {
  return useContext(CloudSyncControlContext);
}

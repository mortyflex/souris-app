// BeautIzzy — the sync revision (Reactive synchronization, CLOUD_SYNC.md §29)
//
// The local sync bookkeeping — `sync_outbox` and `sync_state` — is what the UI
// reads to say where a record stands with the remote (« Pas encore
// synchronisé », « Synchronisé », « Refusé par le serveur »). A push-only run
// rewrites it without touching one operational row, so the snapshot re-read
// of the persistence provider is not involved and nothing would re-render:
// the status of a refund just sent stayed stale until the user left the screen.
//
// This context is the counter that advances after every run that changed
// that bookkeeping (`didSyncRunChangeSyncBookkeeping`). The cloud sync runner
// provides it; a session provider that reads the bookkeeping for the UI
// subscribes to it and re-reads SQLite on that change — and nowhere else. An
// idle run that exchanged nothing advances nothing and re-renders nothing.
//
// Its own module, apart from the runner, so a session provider depends on the
// counter alone — never on the runner, its worker or its gateway: the
// Playground demo and the tests mount the providers without any runner, and
// the counter then simply stays 0.

import { createContext, useContext } from 'react';

const CloudSyncRevisionContext = createContext(0);

/** Provided by the cloud sync runner; the value is its run counter (see the header). */
export const CloudSyncRevisionProvider = CloudSyncRevisionContext.Provider;

/**
 * Advances after every sync run that changed the local sync bookkeeping (an
 * entry sent, refused, acknowledged, applied). Outside a runner it stays 0.
 */
export function useCloudSyncRevision(): number {
  return useContext(CloudSyncRevisionContext);
}

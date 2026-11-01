// BeautIzzy — the channel between a failed manual refresh and the capsule that says it
//
// `useSyncRefresh` (one per pullable screen) publishes the line of a refresh
// that could not synchronize; `SyncRefreshFeedback` (ONE host, mounted once
// above the app's screens) shows it for a moment. A plain subscription — no
// provider, no store, no queue: the last line replaces the previous one, so
// several pulls that joined one run never stack messages. Nothing is kept
// once the host unsubscribes.

export type SyncRefreshFeedbackListener = (text: string) => void;

const listeners = new Set<SyncRefreshFeedbackListener>();

export function publishSyncRefreshFeedback(text: string): void {
  for (const listener of listeners) listener(text);
}

export function subscribeSyncRefreshFeedback(listener: SyncRefreshFeedbackListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// BeautIzzy — where a just-finished onboarding lands
//
// The client import lives inside the Business-bound `(app)` group, which
// does not exist yet while the onboarding is on screen: « Importer ma
// clientèle » enters the Business and leaves this one-shot request behind;
// Accueil, the first screen of the group, consumes it on mount and pushes the
// existing import flow over itself. Cancelling the import therefore lands on
// Accueil, with the onboarding already complete.
//
// Memory only, on purpose: a request that did not survive the session (the
// app was closed in between) must never reopen the import on a later launch.

export type FirstArrival = 'client-import';

let pending: FirstArrival | undefined;

export function requestFirstArrival(arrival: FirstArrival): void {
  pending = arrival;
}

/** Returns the pending request once, then forgets it. */
export function consumeFirstArrival(): FirstArrival | undefined {
  const arrival = pending;
  pending = undefined;
  return arrival;
}

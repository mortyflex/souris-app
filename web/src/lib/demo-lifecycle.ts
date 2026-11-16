/**
 * The lifecycle of a product demonstration on the landing page — pure rules,
 * no DOM, so they can be tested on their own (`DemoScene` applies them).
 *
 *   final  the meaningful END state: what the server renders, what reduced
 *          motion and a reader without JavaScript see, and where every
 *          demonstration rests once played
 *   ready  set back to its start, waiting OFF screen to be seen
 *   play   running its sequence once
 *
 * A demonstration plays when it is well inside the view, then holds its final
 * state. It plays again when the reader deliberately asks (« Revoir »), or
 * when they come back to it after having really left it — far away, for a
 * while — never because of a small scroll around its edge. One that leaves
 * the view while playing jumps to its final state: nothing runs off screen
 * and nothing stays half-hidden.
 */

export type DemoPhase = "final" | "ready" | "play";

export interface DemoState {
  readonly phase: DemoPhase;
  /** It has played (or was already in view at load): its end state was seen. */
  readonly seen: boolean;
  /** When it went far out of view, if it is away now. */
  readonly awaySince: number | undefined;
}

export type DemoEvent =
  /** The first report of the observers, at mount. */
  | { readonly type: "mount"; readonly inView: boolean }
  /** Well inside the view (the play zone). */
  | { readonly type: "enter" }
  /** Far out of the view (beyond the away margin). */
  | { readonly type: "away"; readonly at: number }
  /** Coming back within the away margin, still off screen. */
  | { readonly type: "approach"; readonly at: number }
  /** « Revoir ». */
  | { readonly type: "replay" }
  /** The sequence ended. */
  | { readonly type: "finished" };

/** The play zone: a demonstration starts once 20 % into the view. */
export const DEMO_PLAY_MARGIN = "0px 0px -20% 0px";
/** « Really left »: 50 % of a viewport beyond either edge. */
export const DEMO_AWAY_MARGIN = "50% 0px 50% 0px";
/** And for at least this long — a quick flick past it never replays it. */
export const DEMO_MIN_AWAY_MS = 1500;

export const DEMO_INITIAL: DemoState = { phase: "final", seen: false, awaySince: undefined };

export function demoTransition(state: DemoState, event: DemoEvent): DemoState {
  switch (event.type) {
    case "mount":
      // Already in view at load: never hide what the reader is looking at.
      return event.inView ? { ...state, phase: "final", seen: true } : { ...state, phase: "ready" };
    case "enter":
      return state.phase === "ready" ? { ...state, phase: "play", seen: true, awaySince: undefined } : state;
    case "away":
      // Leaving while playing: finish at once, nothing runs off screen.
      return { ...state, phase: state.phase === "play" ? "final" : state.phase, awaySince: state.seen ? event.at : undefined };
    case "approach": {
      const longEnough = state.awaySince !== undefined && event.at - state.awaySince >= DEMO_MIN_AWAY_MS;
      if (state.phase === "final" && state.seen && longEnough) return { ...state, phase: "ready", awaySince: undefined };
      return { ...state, awaySince: undefined };
    }
    case "replay":
      return { ...state, phase: "play", seen: true, awaySince: undefined };
    case "finished":
      return state.phase === "play" ? { ...state, phase: "final" } : state;
  }
}

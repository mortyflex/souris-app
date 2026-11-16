/**
 * The state of a guided tour of screens (`FeatureTour`) — pure rules, no DOM.
 *
 * Three modes (the approved autoplay matrix):
 *   loop    the hero: plays while visible, rests 2 s between cycles, holds 8 s
 *           after a manual choice, « Pause » / « Reprendre »
 *   once    the online-booking journey: plays ONE pass, ends on the last step,
 *           then offers « Revoir »; choosing a step stops it for good
 *   manual  Clientèle: tabs only, nothing moves by itself
 * Reduced motion turns every tour into `manual`.
 *
 * Phases:
 *   manual    the reader chooses; no timer
 *   playing   the selected step's progress line runs; at its end, the next
 *   resting   (loop) after the last step: a short rest, then the first again
 *   held      (loop) the reader chose a step: progression waits, then resumes
 *   paused    (loop) the reader pressed « Pause »
 *   done      (once) the pass is over — or the reader took over
 *
 * The timers themselves are CSS animations (src/styles/marketing.css «
 * Tours »), so being off screen or paused freezes them exactly where they are;
 * their ends come back here as events.
 */

export type TourMode = "loop" | "once" | "manual";
export type TourPhase = "manual" | "playing" | "resting" | "held" | "paused" | "done";

export interface TourState {
  readonly mode: TourMode;
  readonly phase: TourPhase;
  readonly active: number;
  readonly count: number;
  /** What « Reprendre » returns to: a rest is resumed, anything else plays. */
  readonly resumeTo: "playing" | "resting";
  /** (once) the pass has ended at least once: « Revoir » is offered from then on. */
  readonly ended: boolean;
}

export type TourEvent =
  /** The selected step's progress line is full. */
  | { readonly type: "step-end" }
  /** The rest between two cycles is over. */
  | { readonly type: "rest-end" }
  /** The hold after a manual choice is over. */
  | { readonly type: "hold-end" }
  /** The reader chose a step (click, arrows, Home, End). */
  | { readonly type: "select"; readonly index: number }
  /** « Pause » / « Reprendre » (loop). */
  | { readonly type: "toggle" }
  /** « Revoir » (once): the whole pass again, from the first step. */
  | { readonly type: "replay" }
  /** Reduced motion: no autoplay at all. */
  | { readonly type: "disable-autoplay" };

/** The rhythm of the hero (the decision matrix): 4.6 s a step, 2 s between cycles, 8 s after a choice. */
export const TOUR_TIMING = { stepMs: 4600, restMs: 2000, holdMs: 8000 } as const;

export function initialTourState(count: number, mode: TourMode): TourState {
  return { mode, phase: mode === "manual" ? "manual" : "playing", active: 0, count, resumeTo: "playing", ended: false };
}

export function tourTransition(state: TourState, event: TourEvent): TourState {
  switch (event.type) {
    case "step-end":
      if (state.phase !== "playing") return state;
      if (state.active < state.count - 1) return { ...state, active: state.active + 1 };
      return state.mode === "once" ? { ...state, phase: "done", ended: true } : { ...state, phase: "resting" };
    case "rest-end":
      return state.phase === "resting" ? { ...state, phase: "playing", active: 0 } : state;
    case "hold-end":
      return state.phase === "held" ? { ...state, phase: "playing" } : state;
    case "select": {
      const active = Math.min(Math.max(event.index, 0), state.count - 1);
      if (state.phase === "manual") return { ...state, active };
      // One pass: the reader took over — it stops, and « Revoir » is offered.
      if (state.mode === "once") return { ...state, active, phase: "done", ended: true };
      // Loop: an explicit pause stays a pause; otherwise the choice holds the tour for a while.
      if (state.phase === "paused") return { ...state, active, resumeTo: "playing" };
      return { ...state, active, phase: "held" };
    }
    case "toggle":
      if (state.mode !== "loop" || state.phase === "manual") return state;
      if (state.phase === "paused") return { ...state, phase: state.resumeTo, resumeTo: "playing" };
      return { ...state, phase: "paused", resumeTo: state.phase === "resting" ? "resting" : "playing" };
    case "replay":
      return state.mode === "once" && state.phase !== "manual" ? { ...state, phase: "playing", active: 0 } : state;
    case "disable-autoplay":
      return { ...state, phase: "manual" };
  }
}

export type TourControl =
  | { readonly action: "pause"; readonly label: "Pause"; readonly icon: "pause" }
  | { readonly action: "resume"; readonly label: "Reprendre"; readonly icon: "play" }
  | { readonly action: "replay"; readonly label: "Revoir"; readonly icon: "replay" };

/**
 * What the control offers — its words and icon always describe the action it
 * performs. `null`: no control at all (manual tabs, reduced motion, a first
 * pass still playing).
 */
export function tourControl(state: TourState): TourControl | null {
  if (state.phase === "manual" || state.mode === "manual") return null;
  if (state.mode === "once") return state.ended ? { action: "replay", label: "Revoir", icon: "replay" } : null;
  return state.phase === "paused" ? { action: "resume", label: "Reprendre", icon: "play" } : { action: "pause", label: "Pause", icon: "pause" };
}

/** The sentence a screen reader hears when the reader changes the playback. */
export function tourAnnouncement(state: TourState): string {
  if (state.mode === "once") return state.phase === "playing" ? "Le parcours reprend depuis la première étape." : "";
  if (state.phase === "paused") return "Défilement automatique en pause.";
  if (state.phase === "playing" || state.phase === "resting") return "Défilement automatique repris.";
  return "";
}

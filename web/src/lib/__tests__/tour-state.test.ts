import { describe, expect, it } from "vitest";

import { initialTourState, tourAnnouncement, tourControl, tourTransition, type TourEvent, type TourState } from "../tour-state";

const run = (state: TourState, events: readonly TourEvent[]) => events.reduce(tourTransition, state);
const hero = () => initialTourState(5, "loop");

describe("the hero tour (autoplay, loop)", () => {
  it("plays one module after the other, rests after the last, then starts again", () => {
    let state = hero();
    expect(state).toMatchObject({ phase: "playing", active: 0 });
    state = run(state, [{ type: "step-end" }, { type: "step-end" }, { type: "step-end" }, { type: "step-end" }]);
    expect(state).toMatchObject({ phase: "playing", active: 4 });
    state = tourTransition(state, { type: "step-end" });
    expect(state).toMatchObject({ phase: "resting", active: 4 });
    state = tourTransition(state, { type: "rest-end" });
    expect(state).toMatchObject({ phase: "playing", active: 0 });
  });

  it("« Pause » freezes the module where it is; « Reprendre » plays it again from there", () => {
    const paused = run(hero(), [{ type: "step-end" }, { type: "toggle" }]);
    expect(paused).toMatchObject({ phase: "paused", active: 1 });
    expect(run(paused, [{ type: "step-end" }, { type: "rest-end" }, { type: "hold-end" }])).toBe(paused);
    expect(tourTransition(paused, { type: "toggle" })).toMatchObject({ phase: "playing", active: 1 });
  });

  it("a pause during the rest resumes the rest, not a new module", () => {
    const resting = run(hero(), [{ type: "step-end" }, { type: "step-end" }, { type: "step-end" }, { type: "step-end" }, { type: "step-end" }]);
    const paused = tourTransition(resting, { type: "toggle" });
    expect(paused).toMatchObject({ phase: "paused", active: 4, resumeTo: "resting" });
    expect(tourTransition(paused, { type: "toggle" })).toMatchObject({ phase: "resting", active: 4 });
  });

  it("choosing a module shows it at once and holds the tour, then it resumes by itself", () => {
    const held = tourTransition(hero(), { type: "select", index: 3 });
    expect(held).toMatchObject({ phase: "held", active: 3 });
    expect(tourTransition(held, { type: "step-end" })).toBe(held);
    expect(tourTransition(held, { type: "hold-end" })).toMatchObject({ phase: "playing", active: 3 });
  });

  it("choosing a module while explicitly paused stays paused", () => {
    const paused = tourTransition(hero(), { type: "toggle" });
    const chosen = tourTransition(paused, { type: "select", index: 2 });
    expect(chosen).toMatchObject({ phase: "paused", active: 2 });
    expect(tourTransition(chosen, { type: "hold-end" })).toBe(chosen);
  });

  it("the control always names the action it performs, with the matching icon", () => {
    expect(tourControl(hero())).toEqual({ action: "pause", label: "Pause", icon: "pause" });
    expect(tourControl(tourTransition(hero(), { type: "select", index: 1 }))).toEqual({ action: "pause", label: "Pause", icon: "pause" });
    expect(tourControl(tourTransition(hero(), { type: "toggle" }))).toEqual({ action: "resume", label: "Reprendre", icon: "play" });
    expect(tourAnnouncement(tourTransition(hero(), { type: "toggle" }))).toBe("Défilement automatique en pause.");
  });

  it("reduced motion: nothing advances and no control is offered", () => {
    const manual = tourTransition(hero(), { type: "disable-autoplay" });
    expect(manual.phase).toBe("manual");
    expect(tourControl(manual)).toBeNull();
    expect(run(manual, [{ type: "step-end" }, { type: "rest-end" }, { type: "hold-end" }, { type: "toggle" }])).toBe(manual);
  });
});

describe("a manual tour (Clientèle)", () => {
  it("never moves by itself and has no control", () => {
    const state = initialTourState(4, "manual");
    expect(tourControl(state)).toBeNull();
    expect(run(state, [{ type: "step-end" }, { type: "rest-end" }, { type: "hold-end" }, { type: "toggle" }])).toBe(state);
    expect(tourTransition(state, { type: "select", index: 2 })).toMatchObject({ phase: "manual", active: 2 });
  });
});

describe("a one-pass tour (the online-booking journey)", () => {
  const booking = () => initialTourState(4, "once");

  it("plays every step once, ends on the last one, and only then offers « Revoir »", () => {
    let state = booking();
    expect(state.phase).toBe("playing");
    expect(tourControl(state)).toBeNull(); // nothing to press during the first pass
    state = run(state, [{ type: "step-end" }, { type: "step-end" }, { type: "step-end" }]);
    expect(state).toMatchObject({ phase: "playing", active: 3 });
    state = tourTransition(state, { type: "step-end" });
    expect(state).toMatchObject({ phase: "done", active: 3, ended: true });
    expect(tourControl(state)).toEqual({ action: "replay", label: "Revoir", icon: "replay" });
    // It never loops by itself.
    expect(run(state, [{ type: "step-end" }, { type: "rest-end" }, { type: "hold-end" }, { type: "toggle" }])).toBe(state);
  });

  it("« Revoir » restarts the whole pass from the first step", () => {
    const done = run(booking(), [{ type: "step-end" }, { type: "step-end" }, { type: "step-end" }, { type: "step-end" }]);
    const again = tourTransition(done, { type: "replay" });
    expect(again).toMatchObject({ phase: "playing", active: 0 });
    expect(tourControl(again)).toEqual({ action: "replay", label: "Revoir", icon: "replay" }); // stays available
    expect(tourAnnouncement(again)).toBe("Le parcours reprend depuis la première étape.");
  });

  it("choosing a step stops the pass for good — no timer restarts by itself", () => {
    const chosen = tourTransition(tourTransition(booking(), { type: "step-end" }), { type: "select", index: 2 });
    expect(chosen).toMatchObject({ phase: "done", active: 2, ended: true });
    expect(run(chosen, [{ type: "step-end" }, { type: "hold-end" }, { type: "rest-end" }])).toBe(chosen);
    expect(tourTransition(chosen, { type: "select", index: 0 })).toMatchObject({ phase: "done", active: 0 });
  });

  it("reduced motion: manual tabs, no « Revoir »", () => {
    const manual = tourTransition(booking(), { type: "disable-autoplay" });
    expect(tourControl(manual)).toBeNull();
    expect(tourTransition(manual, { type: "replay" })).toBe(manual);
  });
});

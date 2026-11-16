import { describe, expect, it } from "vitest";

import { DEMO_INITIAL, DEMO_MIN_AWAY_MS, demoTransition, type DemoEvent, type DemoState } from "../demo-lifecycle";

const run = (events: readonly DemoEvent[], from: DemoState = DEMO_INITIAL) => events.reduce(demoTransition, from);

describe("the lifecycle of a landing-page demonstration", () => {
  it("already in view at load: stays in its final state — nothing the reader sees is ever hidden", () => {
    const state = run([{ type: "mount", inView: true }]);
    expect(state.phase).toBe("final");
    expect(state.seen).toBe(true);
    expect(run([{ type: "mount", inView: true }, { type: "enter" }]).phase).toBe("final");
  });

  it("below the fold: waits at its first frame, plays once seen, then holds its final state", () => {
    expect(run([{ type: "mount", inView: false }]).phase).toBe("ready");
    expect(run([{ type: "mount", inView: false }, { type: "enter" }]).phase).toBe("play");
    const done = run([{ type: "mount", inView: false }, { type: "enter" }, { type: "finished" }]);
    expect(done.phase).toBe("final");
    expect(run([{ type: "enter" }], done).phase).toBe("final");
  });

  it("leaving the view while playing finishes it at once: nothing runs off screen, nothing stays half-hidden", () => {
    const state = run([{ type: "mount", inView: false }, { type: "enter" }, { type: "away", at: 1000 }]);
    expect(state.phase).toBe("final");
  });

  it("replays when the reader comes back after really leaving it — far, and for long enough", () => {
    const played = run([{ type: "mount", inView: false }, { type: "enter" }, { type: "finished" }, { type: "away", at: 1000 }]);
    const back = run([{ type: "approach", at: 1000 + DEMO_MIN_AWAY_MS }], played);
    expect(back.phase).toBe("ready");
    expect(run([{ type: "enter" }], back).phase).toBe("play");
  });

  it("never restarts after a quick flick past it", () => {
    const played = run([{ type: "mount", inView: false }, { type: "enter" }, { type: "finished" }, { type: "away", at: 1000 }]);
    const back = run([{ type: "approach", at: 1000 + DEMO_MIN_AWAY_MS - 1 }], played);
    expect(back.phase).toBe("final");
    expect(run([{ type: "enter" }], back).phase).toBe("final");
  });

  it("a demonstration never seen is not « away »: it simply waits for its first play", () => {
    const state = run([{ type: "mount", inView: false }, { type: "away", at: 1000 }, { type: "approach", at: 9000 }]);
    expect(state.phase).toBe("ready");
    expect(state.awaySince).toBeUndefined();
  });

  it("« Revoir » plays it again from any state, and the end of a stale run changes nothing", () => {
    for (const from of [run([{ type: "mount", inView: true }]), run([{ type: "mount", inView: false }])]) {
      expect(demoTransition(from, { type: "replay" }).phase).toBe("play");
    }
    const final = run([{ type: "mount", inView: true }]);
    expect(demoTransition(final, { type: "finished" })).toBe(final);
  });
});

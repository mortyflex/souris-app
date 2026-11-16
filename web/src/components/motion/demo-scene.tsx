"use client";

import { useEffect, useRef, type ReactNode } from "react";

import {
  DEMO_AWAY_MARGIN,
  DEMO_INITIAL,
  DEMO_PLAY_MARGIN,
  demoTransition,
  type DemoEvent,
  type DemoState,
} from "@/lib/demo-lifecycle";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** The events a scene sends to the parts that animate by script (`DemoNumber`). */
export const DEMO_EVENT = { ready: "bz-demo:ready", play: "bz-demo:play", final: "bz-demo:final" } as const;

/**
 * A product demonstration (src/lib/demo-lifecycle.ts): its parts choose their
 * motion with the `da-*` classes of src/styles/marketing.css and their moment
 * with `--d`. The server renders the final state; the scene only sets
 * `data-demo` on itself (`ready` → `play`), so its children are never
 * re-rendered by React. « Revoir » replays it; it never moves the focus.
 */
export function DemoScene({
  label,
  children,
  className,
  replayClassName,
  tone = "light",
}: {
  /** What the demonstration shows, for « Revoir la démonstration : … ». */
  label: string;
  children: ReactNode;
  className?: string;
  /** Where « Revoir » sits (absolute, inside the scene). */
  replayClassName?: string;
  tone?: "light" | "dark";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const scene = ref.current;
    const replay = replayRef.current;
    if (scene === null || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    if (replay !== null) replay.hidden = false;

    let state: DemoState = DEMO_INITIAL;
    let run = 0;

    const start = () => {
      const mine = ++run;
      delete scene.dataset.demo;
      void scene.offsetWidth; // restart every CSS animation from its first frame
      scene.dataset.demo = "play";
      scene.dispatchEvent(new Event(DEMO_EVENT.play));
      const finite = scene
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity);
      void Promise.allSettled(finite.map((animation) => animation.finished)).then(() => {
        if (mine === run) send({ type: "finished" });
      });
    };

    const send = (event: DemoEvent) => {
      const previous = state;
      state = demoTransition(state, event);
      if (state.phase === "play" && (previous.phase !== "play" || event.type === "replay")) start();
      else if (state.phase === "ready" && previous.phase !== "ready") {
        run += 1;
        scene.dataset.demo = "ready";
        scene.dispatchEvent(new Event(DEMO_EVENT.ready));
      } else if (state.phase === "final" && previous.phase !== "final") {
        run += 1;
        scene.dataset.demo = "final";
        scene.dispatchEvent(new Event(DEMO_EVENT.final));
      }
    };

    let mounted = false;
    const play = new IntersectionObserver(
      ([entry]) => {
        if (!mounted) {
          mounted = true;
          send({ type: "mount", inView: entry.isIntersecting });
          return;
        }
        if (entry.isIntersecting) send({ type: "enter" });
      },
      { rootMargin: DEMO_PLAY_MARGIN },
    );
    let awayReported = false;
    const away = new IntersectionObserver(
      ([entry]) => {
        if (!awayReported) {
          awayReported = true;
          if (entry.isIntersecting) return;
        }
        send(entry.isIntersecting ? { type: "approach", at: performance.now() } : { type: "away", at: performance.now() });
      },
      { rootMargin: DEMO_AWAY_MARGIN },
    );
    play.observe(scene);
    away.observe(scene);

    const onReplay = () => send({ type: "replay" });
    replay?.addEventListener("click", onReplay);
    return () => {
      run += 1;
      play.disconnect();
      away.disconnect();
      replay?.removeEventListener("click", onReplay);
    };
  }, []);

  return (
    <div ref={ref} data-demo-scene="" className={cn("relative", className)}>
      {children}
      <button
        ref={replayRef}
        type="button"
        hidden
        className={cn(
          "demo-replay type-meta absolute z-20 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 font-semibold transition-[background-color,opacity,transform] duration-[var(--bz-duration-state)] ease-bz-out active:scale-95",
          tone === "dark"
            ? "bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20"
            : "bg-background/90 text-lavender-700 shadow-card ring-1 ring-lavender-200 hover:bg-lavender-50",
          replayClassName ?? "right-3 top-3",
        )}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="demo-replay-glyph size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {/* Lucide « rotate-ccw » (ISC) */}
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        Revoir<span className="sr-only"> la démonstration : {label}</span>
      </button>
    </div>
  );
}

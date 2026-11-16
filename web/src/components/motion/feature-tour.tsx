"use client";

import { useEffect, useId, useReducer, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";

import { prefersReducedMotion } from "@/lib/motion";
import { initialTourState, TOUR_TIMING, tourAnnouncement, tourControl, tourTransition, type TourMode } from "@/lib/tour-state";
import { cn } from "@/lib/utils";

export interface TourStep {
  readonly id: string;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly panel: ReactNode;
}

const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * A guided tour of real screens: tabs and panels in sync (src/lib/tour-state.ts).
 *
 * - `loop` (the hero): one module at a time, a progress line under it, a 2 s
 *   rest between cycles, an 8 s hold after the reader chooses a module, and
 *   ONE control whose words and icon always name its action (« Pause » /
 *   « Reprendre »).
 * - `once` (the online-booking journey): one pass when it is well into the
 *   view, ending on the last step; choosing a step stops it; « Revoir » (in a
 *   reserved row) plays the pass again from the first step.
 * - `manual` (Clientèle): tabs only — nothing moves by itself, no control.
 * - The timers are CSS animations, frozen off screen and while paused; their
 *   ends drive the state machine.
 * - Every cell has two rows: the icon and label, then a dedicated track for
 *   the progress line — the line can never touch the text. The label's line
 *   box holds its descenders (« g » of Agenda).
 * - Reduced motion: no autoplay, no control; the tabs still work.
 * - Without JavaScript: the first panel; the control keeps its place but stays
 *   invisible (never a dead button).
 */
export function FeatureTour({
  steps,
  label,
  mode = "manual",
  stepMs = TOUR_TIMING.stepMs,
  className,
  panelsClassName,
  tabsClassName,
  tabsPosition = "after",
  variant = "rail",
  speed = "calm",
}: {
  steps: readonly TourStep[];
  /** The tab list's name (« Les modules de BeautIzzy »). */
  label: string;
  /** « loop » (the hero), « once » (one pass, then « Revoir »), « manual » (tabs only). */
  mode?: TourMode;
  /** How long each step stays, in ms. */
  stepMs?: number;
  className?: string;
  panelsClassName?: string;
  tabsClassName?: string;
  tabsPosition?: "before" | "after";
  /** « rail »: cells with a progress track; « segmented »: a sliding thumb. */
  variant?: "rail" | "segmented";
  /** « calm »: 350–500 ms between modules (the hero); « quick »: 150–220 ms (manual tabs). */
  speed?: "calm" | "quick";
}) {
  const [state, dispatch] = useReducer(tourTransition, undefined, () => initialTourState(steps.length, mode));
  const [announcement, setAnnouncement] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const active = state.active;
  const control = tourControl(state);

  // Autoplay only with motion; the timers run only while the tour is on screen.
  useEffect(() => {
    const root = rootRef.current;
    if (mode === "manual" || root === null) return;
    if (prefersReducedMotion()) {
      dispatch({ type: "disable-autoplay" });
      return;
    }
    root.dataset.scripted = "true"; // reveals the control (CSS): a script now drives it
    if (typeof IntersectionObserver === "undefined") {
      root.dataset.offscreen = "false";
      return;
    }
    // « On screen » = well into the view, so a pass never starts unseen at the bottom edge.
    const visibility = new IntersectionObserver(
      ([entry]) => {
        root.dataset.offscreen = entry.isIntersecting ? "false" : "true";
      },
      { threshold: 0.3 },
    );
    visibility.observe(root);
    const onTimer = (event: AnimationEvent) => {
      const target = event.target as HTMLElement;
      if (event.animationName === "tour-fill") dispatch({ type: "step-end" });
      else if (target.classList.contains("tour-rest")) dispatch({ type: "rest-end" });
      else if (target.classList.contains("tour-hold")) dispatch({ type: "hold-end" });
    };
    root.addEventListener("animationend", onTimer);
    return () => {
      visibility.disconnect();
      root.removeEventListener("animationend", onTimer);
    };
  }, [mode]);

  const choose = (index: number, focus: boolean) => {
    dispatch({ type: "select", index });
    if (focus) tabRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = steps.length - 1;
    const keys: Record<string, number> = {
      ArrowRight: active === last ? 0 : active + 1,
      ArrowLeft: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(next, true);
  };

  // A keyboard reader arriving on the tabs holds the tour, as a choice would.
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (state.phase === "playing" && event.target instanceof HTMLElement && event.target.matches(":focus-visible")) {
      dispatch({ type: "select", index: active });
    }
  };

  const act = (event: { type: "toggle" } | { type: "replay" }) => {
    const next = tourTransition(state, event);
    dispatch(event);
    setAnnouncement(tourAnnouncement(next));
  };
  const toggle = () => act({ type: "toggle" });

  const tabButtons = steps.map((step, index) => {
    const selected = index === active;
    return (
      <button
        key={step.id}
        ref={(element) => {
          tabRefs.current[index] = element;
        }}
        type="button"
        role="tab"
        id={`${baseId}-tab-${step.id}`}
        aria-selected={selected}
        aria-controls={`${baseId}-panel-${step.id}`}
        tabIndex={selected ? 0 : -1}
        data-done={index < active ? "true" : "false"}
        onClick={() => choose(index, false)}
        className={cn(
          "relative font-semibold transition-[color,background-color,box-shadow] duration-[var(--bz-duration-state)] ease-bz-out",
          FOCUS_RING,
          variant === "segmented"
            ? cn("z-10 inline-flex min-h-11 items-center justify-center rounded-full px-2 text-[0.875rem] leading-5 sm:px-3", selected ? "text-lavender-700" : "text-foreground/65 hover:text-foreground")
            : cn(
                "tour-cell flex min-w-0 flex-col items-stretch justify-center gap-[7px] rounded-2xl px-1 text-[0.75rem]",
                "h-[60px] @min-[42rem]:h-12 @min-[42rem]:rounded-full @min-[42rem]:px-2 @min-[42rem]:text-[0.875rem]",
                selected ? "bg-background text-lavender-700 shadow-card ring-1 ring-lavender-200" : "bg-background/55 text-foreground/70 ring-1 ring-border hover:bg-background hover:text-foreground",
              ),
        )}
      >
        {variant === "segmented" ? (
          step.label
        ) : (
          <>
            <span className="flex min-w-0 flex-col items-center gap-1 @min-[42rem]:flex-row @min-[42rem]:justify-center @min-[42rem]:gap-1.5">
              {step.icon ? <span className="grid size-4 shrink-0 place-items-center [&>svg]:size-4">{step.icon}</span> : null}
              <span className="max-w-full truncate leading-4 @min-[42rem]:leading-5">{step.label}</span>
            </span>
            <span aria-hidden="true" className="tour-track mx-3 block h-[2px] overflow-hidden rounded-full">
              <span className="tour-fill block h-full w-full rounded-full" />
            </span>
          </>
        )}
      </button>
    );
  });

  const playbackControl = (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "tour-cell tour-control flex min-w-[4.75rem] flex-col items-stretch justify-center gap-[7px] rounded-2xl px-1 text-[0.75rem] font-semibold text-lavender-700 transition-[color,background-color] duration-[var(--bz-duration-state)]",
        "h-[60px] @min-[42rem]:h-12 @min-[42rem]:w-[7rem] @min-[42rem]:rounded-full @min-[42rem]:px-2 @min-[42rem]:text-[0.875rem]",
        "bg-background/55 ring-1 ring-border hover:bg-background motion-reduce:hidden",
        FOCUS_RING,
      )}
    >
      <span className="flex flex-col items-center gap-1 @min-[42rem]:flex-row @min-[42rem]:justify-center @min-[42rem]:gap-1.5">
        {control?.icon === "play" ? <PlayGlyph /> : <PauseGlyph />}
        <span className="leading-4 @min-[42rem]:leading-5">{control?.label ?? "Pause"}</span>
        <span className="sr-only">{control?.action === "resume" ? " le défilement automatique" : " du défilement automatique"}</span>
      </span>
      {/* The same two rows as a tab: icon and label align across the whole rail. */}
      <span aria-hidden="true" className="mx-3 block h-[2px]" />
    </button>
  );

  const rail =
    variant === "segmented" ? (
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="relative grid rounded-full bg-lavender-50 p-1 ring-1 ring-lavender-100" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        <span aria-hidden="true" className="segment-thumb absolute bottom-1 left-1 top-1 rounded-full bg-background shadow-card ring-1 ring-lavender-200" style={{ "--i": active, "--n": steps.length } as CSSProperties} />
        {tabButtons}
      </div>
    ) : mode === "loop" ? (
      // Tabs and the control share ONE grid: wide → one row, the control in its own
      // column; narrow → rows of equal cells, the control the last cell.
      <div className="rail-loop grid gap-1.5" style={{ "--n": steps.length, "--narrow": Math.ceil((steps.length + 1) / 2) } as CSSProperties}>
        <div role="tablist" aria-label={label} onKeyDown={onKeyDown} onFocus={onFocus} className="rail-tabs grid">
          {tabButtons}
        </div>
        <div className="rail-control grid">{playbackControl}</div>
      </div>
    ) : (
      // Manual rail: one row when there is room, else two rows of equal cells.
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="rail-manual grid gap-1.5" style={{ "--n": steps.length, "--half": Math.ceil(steps.length / 2) } as CSSProperties}>
        {tabButtons}
      </div>
    );

  return (
    <div
      ref={rootRef}
      data-tour={state.phase}
      data-resume={state.resumeTo}
      data-speed={speed}
      data-mode={mode}
      data-offscreen={mode === "manual" ? undefined : "true"}
      className={cn("flex flex-col gap-5", className)}
      style={{ "--tour-step": `${stepMs}ms`, "--tour-rest": `${TOUR_TIMING.restMs}ms`, "--tour-hold": `${TOUR_TIMING.holdMs}ms` } as CSSProperties}
    >
      {tabsPosition === "before" ? <div className={cn("@container", tabsClassName)}>{rail}</div> : null}
      <div className={cn("relative grid", panelsClassName)}>
        {steps.map((step, index) => {
          const selected = index === active;
          return (
            <div
              key={step.id}
              id={`${baseId}-panel-${step.id}`}
              role="tabpanel"
              aria-labelledby={`${baseId}-tab-${step.id}`}
              data-tour-panel=""
              data-active={selected ? "true" : "false"}
              data-pos={selected ? "active" : index < active ? "before" : "after"}
              aria-hidden={selected ? undefined : true}
              inert={!selected}
              className="col-start-1 row-start-1"
            >
              {step.panel}
            </div>
          );
        })}
      </div>
      {tabsPosition === "after" ? <div className={cn("@container", tabsClassName)}>{rail}</div> : null}
      {mode === "once" ? (
        // « Revoir »: its row is reserved from the start (no layout shift); it appears once the pass has ended.
        <div className="flex min-h-11 justify-end">
          {control?.action === "replay" ? (
            <button
              type="button"
              onClick={() => act({ type: "replay" })}
              className={cn(
                "type-meta inline-flex min-h-11 items-center gap-1.5 rounded-full bg-background px-3.5 font-semibold text-lavender-700 ring-1 ring-lavender-200 transition-colors duration-[var(--bz-duration-state)] hover:bg-lavender-50 motion-reduce:hidden",
                FOCUS_RING,
              )}
            >
              <ReplayGlyph />
              Revoir<span className="sr-only"> le parcours : {label}</span>
            </button>
          ) : null}
        </div>
      ) : null}
      {mode !== "manual" ? (
        <>
          <span aria-hidden="true" className="tour-rest sr-only" />
          <span aria-hidden="true" className="tour-hold sr-only" />
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </>
      ) : null}
    </div>
  );
}

/** Lucide « rotate-ccw » (ISC), as on every « Revoir » of the page. */
function ReplayGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 self-center" fill="currentColor">
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0 self-center" fill="currentColor">
      <path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6Z" />
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { dayOfMonth, formatLongDate, formatMonthShort, formatMonthYear, formatWeekdayShort } from "@/features/availability/availability";
import { prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { revealDelta, rovingTarget, stripEdges, type StripEdges } from "./date-strip-rules";

const STRIP_ID = "booking-date-strip";

/** « Lundi 16 novembre » */
function capitalized(text: string): string {
  return text.length === 0 ? text : `${text[0].toLocaleUpperCase("fr-FR")}${text.slice(1)}`;
}

/**
 * The dates of the bookable window, as a horizontal strip of two-line chips.
 *
 *   - native scrolling: a swipe on a phone, a trackpad or Shift + wheel on a
 *     computer — no wheel is ever intercepted;
 *   - « ‹ › » in the heading row for a mouse (`any-pointer: fine` only), out of
 *     the Tab order (keyboard users reach the dates themselves), disabled at
 *     the edges, absent when every date fits;
 *   - ONE Tab stop: ←/→/Home/End move the focus, Enter or Space chooses — the
 *     focus never chooses (each choice reads the server's availability);
 *   - the chosen date is brought into view by scrolling the STRIP only, never
 *     the page; edge fades appear only where more dates hide.
 */
export function DateStrip({
  dates,
  selected,
  onChoose,
}: {
  dates: readonly string[];
  selected?: string;
  onChoose: (date: string) => void;
}) {
  const stripRef = useRef<HTMLUListElement>(null);
  const firstRevealRef = useRef(true);
  const [edges, setEdges] = useState<StripEdges>({ atStart: true, atEnd: false, overflows: false });
  const [month, setMonth] = useState(() => formatMonthYear(selected ?? dates[0] ?? ""));
  const [focusDate, setFocusDate] = useState<string | undefined>(undefined);
  const tabStop = focusDate ?? selected ?? dates[0];

  // ---- Edges and the month shown, from the strip's own scroll position.
  useEffect(() => {
    const strip = stripRef.current;
    if (strip === null) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setEdges(stripEdges(strip));
      const left = strip.getBoundingClientRect().left + 24;
      const chips = strip.querySelectorAll<HTMLButtonElement>("[data-date]");
      const first = Array.from(chips).find((chip) => chip.getBoundingClientRect().right > left) ?? chips[0];
      if (first?.dataset.date) setMonth(formatMonthYear(first.dataset.date));
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    strip.addEventListener("scroll", schedule, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    observer?.observe(strip);
    schedule();
    return () => {
      strip.removeEventListener("scroll", schedule);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [dates]);

  // ---- The chosen date stays in view: the strip scrolls, the page never does.
  useEffect(() => {
    const strip = stripRef.current;
    if (strip === null || selected === undefined) return;
    const chip = strip.querySelector<HTMLElement>(`[data-date="${selected}"]`);
    if (chip === null) return;
    const padding = parseFloat(getComputedStyle(strip).scrollPaddingInlineStart) || 0;
    const delta = revealDelta(strip.getBoundingClientRect(), chip.getBoundingClientRect(), padding);
    const instant = firstRevealRef.current || prefersReducedMotion();
    firstRevealRef.current = false;
    if (delta !== 0) strip.scrollBy({ left: delta, behavior: instant ? "instant" : "smooth" });
  }, [selected]);

  const page = (direction: -1 | 1) => {
    const strip = stripRef.current;
    if (strip === null) return;
    strip.scrollBy({ left: direction * (strip.clientWidth - 72), behavior: prefersReducedMotion() ? "instant" : "smooth" });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const chips = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-date]"));
    const index = chips.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const target = rovingTarget(event.key, index, chips.length);
    if (target === undefined) return;
    event.preventDefault();
    const chip = chips[target];
    setFocusDate(chip.dataset.date);
    chip.focus({ preventScroll: true });
    const strip = event.currentTarget;
    const padding = parseFloat(getComputedStyle(strip).scrollPaddingInlineStart) || 0;
    const delta = revealDelta(strip.getBoundingClientRect(), chip.getBoundingClientRect(), padding);
    if (delta !== 0) strip.scrollBy({ left: delta, behavior: prefersReducedMotion() ? "instant" : "smooth" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-6 items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <h3 id="booking-dates" className="type-label">
            Date
          </h3>
          <span aria-hidden="true" className="type-meta capitalize text-foreground/60">
            {month}
          </span>
        </div>
        <div
          role="group"
          aria-label="Faire défiler les dates"
          className={cn("-my-2 gap-2", edges.overflows ? "hidden any-pointer-fine:flex" : "hidden")}
        >
          <IconButton size="sm" label="Dates précédentes" aria-controls={STRIP_ID} tabIndex={-1} disabled={edges.atStart} onClick={() => page(-1)}>
            <ChevronLeftIcon size={18} />
          </IconButton>
          <IconButton size="sm" label="Dates suivantes" aria-controls={STRIP_ID} tabIndex={-1} disabled={edges.atEnd} onClick={() => page(1)}>
            <ChevronRightIcon size={18} />
          </IconButton>
        </div>
      </div>
      <ul
        ref={stripRef}
        id={STRIP_ID}
        aria-labelledby="booking-dates"
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusDate(undefined);
        }}
        style={{
          ["--fade-start" as string]: edges.atStart ? "0px" : "28px",
          ["--fade-end" as string]: edges.atEnd || !edges.overflows ? "0px" : "28px",
        }}
        className="-mx-5 flex snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain px-5 pb-2.5 pt-1 [mask-image:linear-gradient(90deg,transparent_0,#000_var(--fade-start),#000_calc(100%-var(--fade-end)),transparent_100%)] [scroll-padding-inline:48px] [scrollbar-color:var(--bz-lavender-200)_transparent] [scrollbar-width:thin] motion-safe:scroll-smooth sm:-mx-1 sm:px-1 sm:[scroll-padding-inline:32px]"
      >
        {dates.map((date, index) => {
          const chosen = date === selected;
          const monthStart = index > 0 && dayOfMonth(date) === 1;
          return [
            monthStart ? (
              <li key={`month-${date}`} aria-hidden="true" className="flex shrink-0 items-center px-0.5">
                <span className="type-caption rotate-180 uppercase tracking-[0.12em] text-lavender-700 [writing-mode:vertical-rl]">
                  {formatMonthShort(date).replace(".", "")}
                </span>
              </li>
            ) : null,
            <li key={date} className="shrink-0 snap-start">
              <button
                type="button"
                id={`booking-date-${date}`}
                data-date={date}
                aria-pressed={chosen}
                aria-label={capitalized(formatLongDate(date))}
                tabIndex={date === tabStop ? 0 : -1}
                onClick={() => onChoose(date)}
                className={cn(
                  "flex h-[68px] w-14 flex-col items-center justify-center gap-0.5 rounded-[1.1rem] border transition-[background-color,border-color,color,box-shadow] duration-[var(--bz-duration-state)] sm:h-[74px] sm:w-16",
                  chosen
                    ? "border-accent bg-accent text-white shadow-raised"
                    : "border-border bg-background hover:border-lavender-200 hover:bg-lavender-25",
                )}
              >
                <span aria-hidden="true" className={cn("type-meta", chosen ? "text-white/80" : "text-foreground/60")}>
                  {formatWeekdayShort(date)}
                </span>
                <span aria-hidden="true" className="text-[1.25rem] font-semibold leading-tight tabular-nums">
                  {dayOfMonth(date)}
                </span>
              </button>
            </li>,
          ];
        })}
      </ul>
    </div>
  );
}

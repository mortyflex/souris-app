/**
 * The pure rules of the date strip and the time grid (no React, no DOM), so
 * they are tested without a browser.
 */

import type { AvailableSlot } from "@/features/availability/availability";

export interface StripEdges {
  /** The strip is scrolled to its start: nothing hides on the left. */
  readonly atStart: boolean;
  /** Nothing hides on the right. */
  readonly atEnd: boolean;
  /** Some dates do not fit: the arrows are offered. */
  readonly overflows: boolean;
}

/** Where a horizontally scrolled strip stands. One pixel of tolerance for fractional layouts (zoom, DPR). */
export function stripEdges({ scrollLeft, clientWidth, scrollWidth }: { scrollLeft: number; clientWidth: number; scrollWidth: number }): StripEdges {
  const max = scrollWidth - clientWidth;
  return { atStart: scrollLeft <= 1, atEnd: scrollLeft >= max - 1, overflows: max > 1 };
}

/** Where the keyboard focus goes in a row of `count` chips — undefined for any other key. Never wraps. */
export function rovingTarget(key: string, index: number, count: number): number | undefined {
  if (count === 0) return undefined;
  switch (key) {
    case "ArrowRight":
      return Math.min(count - 1, index + 1);
    case "ArrowLeft":
      return Math.max(0, index - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
}

/** The horizontal scroll that brings a chip into the strip's view (0 when already visible), within the strip's own padding. */
export function revealDelta(
  strip: { left: number; right: number },
  chip: { left: number; right: number },
  padding: number,
): number {
  if (chip.left < strip.left + padding) return chip.left - strip.left - padding;
  if (chip.right > strip.right - padding) return chip.right - strip.right + padding;
  return 0;
}

export type DayPeriod = "Matin" | "Après-midi" | "Soir";

/**
 * The times of a day, grouped as the customer reads a day. The grouping reads
 * the server's own label (« 14:30 », in the professional's time zone) — it
 * never computes a time.
 */
export function groupSlotsByPeriod(slots: readonly AvailableSlot[]): { period: DayPeriod; slots: AvailableSlot[] }[] {
  const groups: Record<DayPeriod, AvailableSlot[]> = { Matin: [], "Après-midi": [], Soir: [] };
  for (const slot of slots) {
    const hour = Number(slot.localTime.slice(0, 2));
    groups[hour < 12 ? "Matin" : hour < 18 ? "Après-midi" : "Soir"].push(slot);
  }
  return (["Matin", "Après-midi", "Soir"] as const).filter((period) => groups[period].length > 0).map((period) => ({ period, slots: groups[period] }));
}

/** How many placeholders the times skeleton draws: the last day's count for this service, kept within a sane range. */
export function skeletonCount(lastCount: number | undefined): number {
  if (lastCount === undefined || lastCount <= 0) return 12;
  return Math.min(30, Math.max(6, lastCount));
}

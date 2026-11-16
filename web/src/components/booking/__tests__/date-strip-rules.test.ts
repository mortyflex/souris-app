import { describe, expect, it } from "vitest";

import { dayOfMonth, formatMonthShort, formatMonthYear, formatWeekdayShort } from "@/features/availability/availability";

import { groupSlotsByPeriod, revealDelta, rovingTarget, skeletonCount, stripEdges } from "../date-strip-rules";

const slot = (localTime: string) => ({ startsAt: "2026-11-17T08:00:00Z", endsAt: "2026-11-17T09:00:00Z", localTime });

describe("the date strip", () => {
  it("knows its edges, with one pixel of tolerance", () => {
    expect(stripEdges({ scrollLeft: 0, clientWidth: 700, scrollWidth: 2000 })).toEqual({ atStart: true, atEnd: false, overflows: true });
    expect(stripEdges({ scrollLeft: 640, clientWidth: 700, scrollWidth: 2000 })).toEqual({ atStart: false, atEnd: false, overflows: true });
    expect(stripEdges({ scrollLeft: 1299.6, clientWidth: 700, scrollWidth: 2000 })).toEqual({ atStart: false, atEnd: true, overflows: true });
    // Everything fits: no arrow at all.
    expect(stripEdges({ scrollLeft: 0, clientWidth: 700, scrollWidth: 700.5 })).toEqual({ atStart: true, atEnd: true, overflows: false });
  });

  it("moves the keyboard focus with the arrows, Home and End — never wrapping, never on other keys", () => {
    expect(rovingTarget("ArrowRight", 3, 30)).toBe(4);
    expect(rovingTarget("ArrowRight", 29, 30)).toBe(29);
    expect(rovingTarget("ArrowLeft", 0, 30)).toBe(0);
    expect(rovingTarget("Home", 12, 30)).toBe(0);
    expect(rovingTarget("End", 12, 30)).toBe(29);
    expect(rovingTarget("Enter", 12, 30)).toBeUndefined();
    expect(rovingTarget("ArrowRight", 0, 0)).toBeUndefined();
  });

  it("scrolls only as much as needed to show a chip clear of the edge fade", () => {
    const strip = { left: 100, right: 800 };
    expect(revealDelta(strip, { left: 300, right: 360 }, 48)).toBe(0);
    expect(revealDelta(strip, { left: 780, right: 840 }, 48)).toBe(88);
    expect(revealDelta(strip, { left: 90, right: 150 }, 48)).toBe(-58);
  });

  it("writes the two lines of a chip and the month markers in French", () => {
    expect(formatWeekdayShort("2026-11-17")).toBe("mar.");
    expect(dayOfMonth("2026-11-17")).toBe(17);
    expect(formatMonthShort("2026-12-01")).toBe("déc.");
    expect(formatMonthYear("2026-12-01")).toBe("décembre 2026");
  });
});

describe("the time grid", () => {
  it("groups the server's times by part of the day, keeping their order and dropping empty parts", () => {
    const groups = groupSlotsByPeriod([slot("09:15"), slot("11:45"), slot("12:00"), slot("17:45"), slot("18:00")]);
    expect(groups.map((group) => [group.period, group.slots.map((s) => s.localTime)])).toEqual([
      ["Matin", ["09:15", "11:45"]],
      ["Après-midi", ["12:00", "17:45"]],
      ["Soir", ["18:00"]],
    ]);
    expect(groupSlotsByPeriod([slot("14:00")]).map((group) => group.period)).toEqual(["Après-midi"]);
    expect(groupSlotsByPeriod([])).toEqual([]);
  });

  it("sizes the skeleton from the last day seen, within bounds", () => {
    expect(skeletonCount(undefined)).toBe(12);
    expect(skeletonCount(0)).toBe(12);
    expect(skeletonCount(3)).toBe(6);
    expect(skeletonCount(17)).toBe(17);
    expect(skeletonCount(80)).toBe(30);
  });
});

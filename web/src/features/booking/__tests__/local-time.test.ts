import { afterEach, describe, expect, it } from "vitest";

import { formatTimeInZone, formatTimeRange } from "../local-time";

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe("times in the PROFESSIONAL's time zone", () => {
  it.each([
    ["2026-11-16T13:45:00Z", "Europe/Paris", "14:45"], // winter: UTC+1
    ["2026-07-01T12:00:00Z", "Europe/Paris", "14:00"], // summer: UTC+2
    ["2026-11-16T13:45:00Z", "Europe/London", "13:45"],
    ["2026-11-16T13:45:00Z", "America/Martinique", "09:45"],
    ["2026-11-16T23:30:00Z", "Indian/Reunion", "03:30"],
  ])("formats %s in %s as %s", (instant, timeZone, expected) => {
    expect(formatTimeInZone(instant, timeZone)).toBe(expected);
  });

  it("does not depend on the time zone of the browser or the server", () => {
    const results: (string | undefined)[] = [];
    for (const zone of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      results.push(formatTimeInZone("2026-11-16T13:45:00Z", "Europe/Paris"));
    }
    expect(results).toEqual(["14:45", "14:45", "14:45", "14:45"]);
    // The trap it avoids: the runtime's own clock reads another hour.
    process.env.TZ = "Asia/Tokyo";
    expect(new Date("2026-11-16T13:45:00Z").getHours()).toBe(22);
  });

  it("shows the server's start label with the end formatted in the same zone", () => {
    expect(formatTimeRange("14:00", "2026-11-16T13:45:00Z", "Europe/Paris")).toBe("14:00 – 14:45");
  });

  it("falls back to the start alone when the end cannot be formatted", () => {
    expect(formatTimeInZone("not an instant", "Europe/Paris")).toBeUndefined();
    expect(formatTimeInZone("2026-11-16T13:45:00Z", "Mars/Olympus_Mons")).toBeUndefined();
    expect(formatTimeRange("14:00", "2026-11-16T13:45:00Z", "Mars/Olympus_Mons")).toBe("14:00");
  });
});

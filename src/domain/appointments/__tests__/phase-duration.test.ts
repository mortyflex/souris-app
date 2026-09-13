import {
  PHASE_DURATION_STEP_MINUTES,
  isValidPhaseDurationMinutes,
  stepPhaseDurationMinutes,
} from "../index";

describe("phase duration stepping", () => {
  it("steps by five minutes in both directions", () => {
    expect(PHASE_DURATION_STEP_MINUTES).toBe(5);
    expect(stepPhaseDurationMinutes(40, 1)).toBe(45);
    expect(stepPhaseDurationMinutes(40, -1)).toBe(35);
  });

  it("reaches zero and never goes negative (10 → 5 → 0 → 0)", () => {
    const first = stepPhaseDurationMinutes(10, -1);
    const second = stepPhaseDurationMinutes(first, -1);
    const third = stepPhaseDurationMinutes(second, -1);
    expect([first, second, third]).toEqual([5, 0, 0]);
  });

  it("climbs back from zero (0 → 5 → 10)", () => {
    const first = stepPhaseDurationMinutes(0, 1);
    expect(first).toBe(5);
    expect(stepPhaseDurationMinutes(first, 1)).toBe(10);
  });

  it("steps a legacy non-multiple value relative to itself without snapping (7 → 12 / 2 / 0)", () => {
    expect(stepPhaseDurationMinutes(7, 1)).toBe(12);
    const down = stepPhaseDurationMinutes(7, -1);
    expect(down).toBe(2);
    expect(stepPhaseDurationMinutes(down, -1)).toBe(0);
  });

  it("respects an explicit positive minimum", () => {
    expect(stepPhaseDurationMinutes(5, -1, 5)).toBe(5);
    expect(stepPhaseDurationMinutes(7, -1, 5)).toBe(5);
  });

  it("accepts zero as a valid duration and rejects negatives and fractions", () => {
    expect(isValidPhaseDurationMinutes(0)).toBe(true);
    expect(isValidPhaseDurationMinutes(7)).toBe(true);
    expect(isValidPhaseDurationMinutes(-5)).toBe(false);
    expect(isValidPhaseDurationMinutes(2.5)).toBe(false);
    expect(() => stepPhaseDurationMinutes(-5, 1)).toThrow(RangeError);
  });
});

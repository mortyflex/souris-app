// Souris — Appointment phase duration stepping
//
// Source: docs/domain/APPOINTMENTS.md §14
//
// Appointment timing is adjusted in fixed 5-minute steps from the CURRENT
// snapshot value. Zero is a valid duration (a processing phase the
// professional skips today); a duration can never be negative. Existing
// values that are not multiples of five are never normalized on their own:
// 7 → 12 / 2 / 0.

export const PHASE_DURATION_STEP_MINUTES = 5;

export type PhaseDurationStepDirection = 1 | -1;

/** A phase duration is a non-negative integer number of minutes. */
export function isValidPhaseDurationMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 0;
}

/**
 * Steps a duration by ±5 minutes, clamped at `minimumMinutes` (0 by default).
 * The step is relative to the current value: no snapping, no rounding.
 */
export function stepPhaseDurationMinutes(
  currentMinutes: number,
  direction: PhaseDurationStepDirection,
  minimumMinutes = 0,
): number {
  if (!isValidPhaseDurationMinutes(currentMinutes)) {
    throw new RangeError(
      `stepPhaseDurationMinutes: ${currentMinutes} is not a valid phase duration`,
    );
  }
  return Math.max(minimumMinutes, currentMinutes + direction * PHASE_DURATION_STEP_MINUTES);
}

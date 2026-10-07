// BeautIzzy — SMS fidélisation stepper rules
//
// The UI ranges of the lifecycle SMS numeric knobs — deliberately NARROWER
// than the server CHECKs (percent 1–100, validity 1–365, inactivity 1–730),
// which stay the final validation layer. Pure and framework-free.
//
// Steps move along the grid `min + k × step`, never wrap and never leave
// [min, max]. A stored value off that grid (the server accepts any integer
// in its own range) snaps to the next grid value in the pressed direction;
// a stored value outside the UI range comes back into it in one step.

export interface LifecycleSettingRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export type LifecycleSettingStepDirection = 1 | -1;

/** Birthday and win-back discount: 5 % to 50 %, by 5. */
export const LIFECYCLE_DISCOUNT_PERCENT_RANGE: LifecycleSettingRange = { min: 5, max: 50, step: 5 };

/** Birthday and win-back offer validity: 1 to 30 days, by 1. */
export const LIFECYCLE_VALIDITY_DAYS_RANGE: LifecycleSettingRange = { min: 1, max: 30, step: 1 };

/** Win-back inactivity threshold: 30 to 365 days, by 15. */
export const WINBACK_AFTER_DAYS_RANGE: LifecycleSettingRange = { min: 30, max: 365, step: 15 };

export function canStepLifecycleSetting(
  value: number,
  range: LifecycleSettingRange,
  direction: LifecycleSettingStepDirection,
): boolean {
  return direction === 1 ? value < range.max : value > range.min;
}

/** The next value in `direction`, or `value` itself when a bound refuses the step. */
export function stepLifecycleSetting(
  value: number,
  range: LifecycleSettingRange,
  direction: LifecycleSettingStepDirection,
): number {
  if (!canStepLifecycleSetting(value, range, direction)) return value;
  const { min, max, step } = range;
  if (direction === 1) {
    if (value < min) return min;
    return Math.min(max, min + (Math.floor((value - min) / step) + 1) * step);
  }
  if (value > max) return max;
  return Math.max(min, min + (Math.ceil((value - min) / step) - 1) * step);
}

// BeautIzzy — SMS fidélisation stepper rules

import {
  canStepLifecycleSetting,
  LIFECYCLE_DISCOUNT_PERCENT_RANGE,
  LIFECYCLE_VALIDITY_DAYS_RANGE,
  stepLifecycleSetting,
  WINBACK_AFTER_DAYS_RANGE,
} from '../lifecycle-setting-steps';

describe('lifecycle setting ranges', () => {
  it('discount: 5 % to 50 % by 5, never wrapping', () => {
    expect(stepLifecycleSetting(15, LIFECYCLE_DISCOUNT_PERCENT_RANGE, 1)).toBe(20);
    expect(stepLifecycleSetting(20, LIFECYCLE_DISCOUNT_PERCENT_RANGE, -1)).toBe(15);
    expect(stepLifecycleSetting(5, LIFECYCLE_DISCOUNT_PERCENT_RANGE, -1)).toBe(5);
    expect(stepLifecycleSetting(50, LIFECYCLE_DISCOUNT_PERCENT_RANGE, 1)).toBe(50);
    expect(canStepLifecycleSetting(5, LIFECYCLE_DISCOUNT_PERCENT_RANGE, -1)).toBe(false);
    expect(canStepLifecycleSetting(50, LIFECYCLE_DISCOUNT_PERCENT_RANGE, 1)).toBe(false);
  });

  it('validity: 1 to 30 days by 1', () => {
    expect(stepLifecycleSetting(7, LIFECYCLE_VALIDITY_DAYS_RANGE, 1)).toBe(8);
    expect(stepLifecycleSetting(8, LIFECYCLE_VALIDITY_DAYS_RANGE, -1)).toBe(7);
    expect(stepLifecycleSetting(1, LIFECYCLE_VALIDITY_DAYS_RANGE, -1)).toBe(1);
    expect(stepLifecycleSetting(30, LIFECYCLE_VALIDITY_DAYS_RANGE, 1)).toBe(30);
  });

  it('win-back inactivity: 30 to 365 days by 15, the last step capped at 365', () => {
    expect(stepLifecycleSetting(60, WINBACK_AFTER_DAYS_RANGE, 1)).toBe(75);
    expect(stepLifecycleSetting(75, WINBACK_AFTER_DAYS_RANGE, -1)).toBe(60);
    expect(stepLifecycleSetting(30, WINBACK_AFTER_DAYS_RANGE, -1)).toBe(30);
    expect(stepLifecycleSetting(360, WINBACK_AFTER_DAYS_RANGE, 1)).toBe(365);
    expect(stepLifecycleSetting(365, WINBACK_AFTER_DAYS_RANGE, -1)).toBe(360);
    expect(canStepLifecycleSetting(365, WINBACK_AFTER_DAYS_RANGE, 1)).toBe(false);
  });

  it('a stored value off the grid snaps to the next grid value in the pressed direction', () => {
    expect(stepLifecycleSetting(7, LIFECYCLE_DISCOUNT_PERCENT_RANGE, 1)).toBe(10);
    expect(stepLifecycleSetting(7, LIFECYCLE_DISCOUNT_PERCENT_RANGE, -1)).toBe(5);
    expect(stepLifecycleSetting(100, WINBACK_AFTER_DAYS_RANGE, 1)).toBe(105);
    expect(stepLifecycleSetting(100, WINBACK_AFTER_DAYS_RANGE, -1)).toBe(90);
  });

  it('a stored value outside the UI range comes back into it, never further out', () => {
    expect(stepLifecycleSetting(3, LIFECYCLE_DISCOUNT_PERCENT_RANGE, 1)).toBe(5);
    expect(canStepLifecycleSetting(3, LIFECYCLE_DISCOUNT_PERCENT_RANGE, -1)).toBe(false);
    expect(stepLifecycleSetting(80, LIFECYCLE_DISCOUNT_PERCENT_RANGE, -1)).toBe(50);
    expect(canStepLifecycleSetting(80, LIFECYCLE_DISCOUNT_PERCENT_RANGE, 1)).toBe(false);
    expect(stepLifecycleSetting(10, WINBACK_AFTER_DAYS_RANGE, 1)).toBe(30);
    expect(stepLifecycleSetting(500, WINBACK_AFTER_DAYS_RANGE, -1)).toBe(365);
  });
});

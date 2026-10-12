import {
  canGoBack,
  getOnboardingProgress,
  isPostCreationStep,
  nextOnboardingStep,
  ONBOARDING_STEPS,
  previousOnboardingStep,
} from '../onboarding-steps';

describe('onboarding steps', () => {
  it('runs the five setup steps in the product order, starting at the activity — Welcome is not a setup step', () => {
    expect(ONBOARDING_STEPS).toEqual(['activity', 'details', 'reminders', 'services', 'complete']);
    expect(ONBOARDING_STEPS).not.toContain('welcome');
    expect(nextOnboardingStep('activity')).toBe('details');
    expect(nextOnboardingStep('reminders')).toBe('services');
    expect(nextOnboardingStep('complete')).toBe('complete');
    expect(previousOnboardingStep('activity')).toBeUndefined();
    expect(previousOnboardingStep('details')).toBe('activity');
  });

  it('offers back only between the pre-creation steps, never from the first one, never while submitting', () => {
    const before = { businessCreated: false, submitting: false };
    expect(canGoBack('activity', before)).toBe(false);
    expect(canGoBack('details', before)).toBe(true);
    expect(canGoBack('reminders', before)).toBe(true);
    expect(canGoBack('services', before)).toBe(false);
    expect(canGoBack('complete', before)).toBe(false);
    expect(canGoBack('details', { businessCreated: false, submitting: true })).toBe(false);
  });

  it('never offers back once the Business exists: the creation can no longer be edited or repeated', () => {
    const created = { businessCreated: true, submitting: false };
    for (const step of ONBOARDING_STEPS) {
      expect(canGoBack(step, created)).toBe(false);
    }
    expect(isPostCreationStep('reminders')).toBe(false);
    expect(isPostCreationStep('services')).toBe(true);
    expect(isPostCreationStep('complete')).toBe(true);
  });

  it('shows progress on every step, over the five setup steps', () => {
    expect(getOnboardingProgress('activity')).toEqual({ current: 1, total: 5 });
    expect(getOnboardingProgress('details')).toEqual({ current: 2, total: 5 });
    expect(getOnboardingProgress('services')).toEqual({ current: 4, total: 5 });
    expect(getOnboardingProgress('complete')).toEqual({ current: 5, total: 5 });
  });
});

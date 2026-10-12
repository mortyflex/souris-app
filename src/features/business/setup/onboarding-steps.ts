// BeautIzzy — the business setup step machine (pure)
//
// Five steps, one route, entered right after authentication: Welcome
// belongs to the first-entry experience (the auth group) and is never
// repeated here. The ONE rule that matters for data safety lives here: once
// the Business exists (it is created at the reminders decision, before the
// starter services), no step before that point can be reached again — the
// details can no longer change, and a back action could otherwise re-submit
// a creation. Going back is therefore allowed only between the pre-creation
// steps, and never from the first one (the account screens are not a step).
//
// Progress is shown on every step, as a quiet bar over the five steps.

import type { OnboardingProgress } from '@/shared/ui/OnboardingStepLayout';

export type { OnboardingProgress };

export const ONBOARDING_STEPS = ['activity', 'details', 'reminders', 'services', 'complete'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The first step that may only run with an existing Business. */
export const FIRST_POST_CREATION_STEP: OnboardingStep = 'services';

export function nextOnboardingStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)]!;
}

export function previousOnboardingStep(step: OnboardingStep): OnboardingStep | undefined {
  const index = ONBOARDING_STEPS.indexOf(step);
  return index > 0 ? ONBOARDING_STEPS[index - 1] : undefined;
}

export function isPostCreationStep(step: OnboardingStep): boolean {
  return ONBOARDING_STEPS.indexOf(step) >= ONBOARDING_STEPS.indexOf(FIRST_POST_CREATION_STEP);
}

/**
 * Whether a back action is offered on `step`. Never from the first step
 * (nothing before it inside setup), never once the Business exists (the
 * previous steps would edit a creation that already happened), never while
 * a submission runs.
 */
export function canGoBack(step: OnboardingStep, context: { readonly businessCreated: boolean; readonly submitting: boolean }): boolean {
  if (context.submitting || context.businessCreated) return false;
  if (isPostCreationStep(step)) return false;
  return previousOnboardingStep(step) !== undefined;
}

/** The 1-based position of `step` among the five setup steps. */
export function getOnboardingProgress(step: OnboardingStep): OnboardingProgress {
  return { current: ONBOARDING_STEPS.indexOf(step) + 1, total: ONBOARDING_STEPS.length };
}

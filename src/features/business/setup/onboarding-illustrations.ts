// BeautIzzy — the approved business setup illustrations
//
// One transparent PNG master per step (assets/illustrations/onboarding),
// drawn as supplied: `contain`, sized at render time, never cropped,
// recoloured or re-encoded. Every master is square (1254 × 1254). The
// account-screen accent (welcome) and the Product Discovery masters (clients,
// products, and starter-services shared with step 4) belong to the first-launch
// screens (features/auth); the paywall one (growth) is deliberately NOT referenced
// anywhere in the first run.

import type { OnboardingStep } from './onboarding-steps';

export const onboardingIllustrations: Record<OnboardingStep, number> = {
  activity: require('../../../../assets/illustrations/onboarding/activity.png'),
  details: require('../../../../assets/illustrations/onboarding/business-details.png'),
  reminders: require('../../../../assets/illustrations/onboarding/reminders.png'),
  services: require('../../../../assets/illustrations/onboarding/starter-services.png'),
  complete: require('../../../../assets/illustrations/onboarding/setup-complete.png'),
};

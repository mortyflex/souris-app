// BeautIzzy — onboarding preview of one profession (development ONLY)
//
// `/playground/<activityType>`: the REAL onboarding flow bound to in-memory
// actions, preselected on that profession. Same release boundary and same
// guard as the Playground landing; an identifier that is not a profession of
// `PROFESSIONS` returns to the landing.

import { Redirect, useLocalSearchParams } from 'expo-router';

import { isBusinessActivityType, isProfessionId } from '@/domain/business';
import { isPlaygroundAvailable } from '@/features/playground/availability';

const PlaygroundOnboardingPreviewScreen = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/playground/PlaygroundOnboardingPreviewScreen') as typeof import('@/features/playground/PlaygroundOnboardingPreviewScreen'))
      .PlaygroundOnboardingPreviewScreen
  : undefined;

export default function PlaygroundOnboardingPreviewRoute() {
  const { activityType } = useLocalSearchParams<{ activityType: string }>();
  if (PlaygroundOnboardingPreviewScreen === undefined || !isPlaygroundAvailable()) return <Redirect href="/" />;
  if (!isBusinessActivityType(activityType) || !isProfessionId(activityType)) return <Redirect href="/playground" />;
  return <PlaygroundOnboardingPreviewScreen activityType={activityType} />;
}

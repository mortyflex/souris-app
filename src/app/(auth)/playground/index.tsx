// BeautIzzy — Playground développeur (development ONLY)
//
// The screen module is required inside a `__DEV__` branch — never imported
// statically — so Metro drops it from release bundles. The route itself
// enforces THE availability rule (features/playground/availability.ts) on top
// of the (auth) layout's guard: outside a Staging development build, a direct
// navigation or a deep link lands on the signed-out entry, nothing else.

import { Redirect } from 'expo-router';

import { isPlaygroundAvailable } from '@/features/playground/availability';

const PlaygroundScreen = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/playground/PlaygroundScreen') as typeof import('@/features/playground/PlaygroundScreen'))
      .PlaygroundScreen
  : undefined;

export default function PlaygroundRoute() {
  if (PlaygroundScreen === undefined || !isPlaygroundAvailable()) return <Redirect href="/" />;
  return <PlaygroundScreen />;
}

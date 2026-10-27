// BeautIzzy — the « Démo » tab of the Playground demo (development ONLY)
//
// Required inside a `__DEV__` branch so Metro drops the module from release
// bundles; the group's layout already refuses to render outside a demo.

import { Redirect } from 'expo-router';

const PlaygroundDemoHubScreen = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/playground/demo/PlaygroundDemoHubScreen') as typeof import('@/features/playground/demo/PlaygroundDemoHubScreen'))
      .PlaygroundDemoHubScreen
  : undefined;

export default function PlaygroundDemoHubRoute() {
  if (PlaygroundDemoHubScreen === undefined) return <Redirect href="/" />;
  return <PlaygroundDemoHubScreen />;
}

// BeautIzzy — product sale inside the Playground demo (development ONLY)
//
// The product route Appointment Details pushes (« Vendre un produit »). Sales
// belong to Step B2 of the Playground: the demo says so instead of opening a
// form that has nothing to sell.

import { Redirect } from 'expo-router';

const PlaygroundDemoUnavailableScreen = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@/features/playground/demo/PlaygroundDemoUnavailableScreen') as typeof import('@/features/playground/demo/PlaygroundDemoUnavailableScreen'))
      .PlaygroundDemoUnavailableScreen
  : undefined;

export default function PlaygroundDemoSaleRoute() {
  if (PlaygroundDemoUnavailableScreen === undefined) return <Redirect href="/" />;
  return <PlaygroundDemoUnavailableScreen feature="La vente de produits" />;
}

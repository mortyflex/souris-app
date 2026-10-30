// BeautIzzy — Playground demo routes: the guard is enforced by the routes themselves
//
// The `(demo)` group layout, its tabs and its Step B2 routes, rendered
// the way Expo Router mounts them, with a Stack whose Protected groups render
// their screens only while their guard is true. The device database binding
// is mocked: the layout only hands its opener to the runtime.

import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import AuthLayout from '@/app/(auth)/_layout';
import PlaygroundDemoLayout from '@/app/(auth)/(demo)/_layout';
import PlaygroundDemoTabsLayout from '@/app/(auth)/(demo)/(tabs)/_layout';
import PlaygroundDemoHubRoute from '@/app/(auth)/(demo)/(tabs)/demo';
import PlaygroundDemoAccueilRoute from '@/app/(auth)/(demo)/(tabs)/accueil';
import PlaygroundDemoProduitsRoute from '@/app/(auth)/(demo)/(tabs)/produits';
import PlaygroundDemoCashRegisterRoute from '@/app/(auth)/(demo)/cash-register/index';
import PlaygroundDemoProductRoute from '@/app/(auth)/(demo)/products/[productId]';
import PlaygroundDemoNewProductRoute from '@/app/(auth)/(demo)/products/new';
import PlaygroundDemoSaleDetailRoute from '@/app/(auth)/(demo)/sales/[saleId]';
import PlaygroundDemoSalesHistoryRoute from '@/app/(auth)/(demo)/sales/index';
import PlaygroundDemoSaleRoute from '@/app/(auth)/(demo)/sales/new';

import { isPlaygroundAvailable } from '../../availability';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  const Screen = ({ name }: { readonly name: string }) => React.createElement(Text, { testID: `route-${name}` }, name);
  const Protected = ({ guard, children }: { readonly guard: boolean; readonly children?: React.ReactNode }) =>
    guard ? React.createElement(React.Fragment, null, children) : null;
  const Stack = ({ children }: { readonly children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  const { DefaultTheme } = jest.requireActual('expo-router') as typeof import('expo-router');
  return {
    DefaultTheme,
    Redirect: ({ href }: { readonly href: string }) => React.createElement(Text, { testID: 'redirect' }, href),
    Stack,
    ThemeProvider: ({ children }: { readonly children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn() }),
  };
});
jest.mock('expo-router/unstable-native-tabs', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text, View } = jest.requireActual('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  const NativeTabs = ({ children, ...props }: { readonly children?: ReactNode }) =>
    React.createElement(Host, { testID: 'native-tabs', ...props }, children);
  const Trigger = ({ name, children, ...props }: { readonly name: string; readonly children?: ReactNode }) =>
    React.createElement(Host, { testID: `trigger-${name}`, name, ...props }, children);
  function Icon(props: object) {
    return React.createElement(Host, { testID: 'trigger-icon', ...props });
  }
  function Label({ children }: { readonly children?: ReactNode }) {
    return React.createElement(Text, { testID: 'trigger-label' }, children);
  }
  Trigger.Icon = Icon;
  Trigger.Label = Label;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The « Tops & tendances » ticket (Step B2) can save / share its image: no native module in Jest.
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
jest.mock('react-native-reanimated', () => jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'));
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@/persistence/expo-database', () => ({ openInMemorySourisDatabase: jest.fn() }));
jest.mock('../../availability', () => ({ isPlaygroundAvailable: jest.fn(() => false) }));

async function renderRoute(element: React.ReactElement) {
  const view = await render(element);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  jest.mocked(isPlaygroundAvailable).mockReturnValue(false);
});

describe('Playground demo routes', () => {
  it('redirect a direct navigation into the demo group to the signed-out entry when the Playground is unavailable', async () => {
    const view = await renderRoute(<PlaygroundDemoLayout />);
    expect(view.getByTestId('redirect').props.children).toBe('/');
    expect(view.queryByTestId('route-(tabs)')).toBeNull();
  });

  it('redirect a deep link into the demo group to the landing when no demo was chosen', async () => {
    jest.mocked(isPlaygroundAvailable).mockReturnValue(true);
    const view = await renderRoute(
      <AuthLayoutHost>
        <PlaygroundDemoLayout />
      </AuthLayoutHost>,
    );
    expect(view.getByTestId('redirect').props.children).toBe('/playground');
    expect(view.queryByTestId('route-(tabs)')).toBeNull();
  });

  it('keep the (demo) group out of the signed-out stack unless the Playground is available', async () => {
    const unavailable = await renderRoute(<AuthLayout />);
    expect(unavailable.queryByTestId('route-(demo)')).toBeNull();
    expect(unavailable.queryByTestId('route-playground/index')).toBeNull();
    expect(unavailable.getByTestId('route-index')).toBeTruthy();

    jest.mocked(isPlaygroundAvailable).mockReturnValue(true);
    const available = await renderRoute(<AuthLayout />);
    expect(available.getByTestId('route-(demo)')).toBeTruthy();
    expect(available.getByTestId('route-playground/index')).toBeTruthy();
  });

  it('declare the demo tabs in the product’s order — Accueil, Agenda, Clientèle, Produits — then Démo where Plus stands', async () => {
    const view = await renderRoute(<PlaygroundDemoTabsLayout />);
    const triggers = view.getByTestId('native-tabs').children;
    expect(triggers.map((trigger) => (typeof trigger === 'string' ? trigger : trigger.props.name))).toEqual([
      'accueil',
      'agenda',
      'clientes',
      'produits',
      'demo',
    ]);
    expect(view.getAllByTestId('trigger-label').map((label) => label.props.children)).toEqual([
      'Accueil',
      'Agenda',
      'Clientèle',
      'Produits',
      'Démo',
    ]);
  });

  it('compose the Step B2 routes from the product’s own screens — no « Non disponible » placeholder left', () => {
    for (const route of [
      PlaygroundDemoAccueilRoute,
      PlaygroundDemoProduitsRoute,
      PlaygroundDemoCashRegisterRoute,
      PlaygroundDemoProductRoute,
      PlaygroundDemoNewProductRoute,
      PlaygroundDemoSaleRoute,
      PlaygroundDemoSalesHistoryRoute,
      PlaygroundDemoSaleDetailRoute,
    ]) {
      expect(typeof route).toBe('function');
    }
    expect(PlaygroundDemoSaleRoute.toString()).toContain('SaleCreationScreen');
    // The Caisse sale history and detail (read-only) follow the Caisse into the demo.
    expect(PlaygroundDemoSalesHistoryRoute.toString()).toContain('SalesHistoryScreen');
    expect(PlaygroundDemoSaleDetailRoute.toString()).toContain('SaleDetailScreen');
    expect(PlaygroundDemoAccueilRoute.toString()).toContain('HomeScreen');
    expect(PlaygroundDemoCashRegisterRoute.toString()).toContain('CashRegisterScreen');
  });

  it('compose the hub tab from the development module', () => {
    expect(typeof PlaygroundDemoHubRoute).toBe('function');
  });
});

/** The signed-out layout's own session provider around a child, as the (auth) stack provides it. */
function AuthLayoutHost({ children }: { readonly children: ReactNode }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PlaygroundDemoSessionProvider } = require('../session') as typeof import('../session');
  return <PlaygroundDemoSessionProvider>{children}</PlaygroundDemoSessionProvider>;
}

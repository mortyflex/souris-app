// BeautIzzy — the « Démo » tab (behavioural): the dataset at a glance and the three demo controls
//
// Rendered inside the real demo runtime (in-memory Node SQLite), so the
// counts come from the same providers the other screens read.

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import type { ClientSessionValue } from '@/features/clients/session/types';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

import { PlaygroundDemoHubScreen, CHANGE_PROFESSION_TITLE, LEAVE_PLAYGROUND_TITLE, RESET_DEMO_TITLE } from '../PlaygroundDemoHubScreen';
import { PlaygroundDemoRuntime } from '../PlaygroundDemoRuntime';
import { createPlaygroundDemoScenario } from '../scenarios';
import { PlaygroundDemoSessionProvider, usePlaygroundDemoSession, type PlaygroundDemoSessionValue } from '../session';

const mockPush = jest.fn();
const mockDismissTo = jest.fn();

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { readonly href: string }) => React.createElement(Text, { testID: 'redirect' }, href),
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
    useRouter: () => ({ push: mockPush, dismissTo: mockDismissTo, back: jest.fn(), replace: jest.fn() }),
  };
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
jest.mock('../../availability', () => ({ isPlaygroundAvailable: jest.fn(() => true) }));

const NOW = new Date(2027, 2, 10, 15, 30);
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

const session: { current?: PlaygroundDemoSessionValue } = {};
const clients: { current?: ClientSessionValue } = {};

function SessionProbe() {
  const value = usePlaygroundDemoSession();
  useEffect(() => {
    session.current = value;
  });
  return null;
}

function ClientsProbe() {
  const value = useClientSession();
  useEffect(() => {
    clients.current = value;
  });
  return null;
}

function Tree() {
  const [gateway] = useState(createFakeAuthGateway);
  return (
    <AuthProvider gateway={gateway}>
      <PlaygroundDemoSessionProvider>
        <SessionProbe />
        <PlaygroundDemoRuntime now={() => NOW} openDatabase={openTestDatabase}>
          <ClientsProbe />
          <PlaygroundDemoHubScreen />
        </PlaygroundDemoRuntime>
      </PlaygroundDemoSessionProvider>
    </AuthProvider>
  );
}

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

async function renderHub(activityType: 'HAIRDRESSING' | 'NAILS' | 'ESTHETICS') {
  const view = await render(<Tree />);
  await act(async () => {});
  await act(async () => {
    session.current!.start(activityType);
  });
  await waitFor(() => expect(view.getByTestId('playground-demo-hub')).toBeTruthy());
  return view;
}

beforeEach(() => {
  mockPush.mockClear();
  mockDismissTo.mockClear();
  alertSpy.mockClear();
  session.current = undefined;
  clients.current = undefined;
});

afterAll(() => {
  alertSpy.mockRestore();
});

describe('PlaygroundDemoHubScreen', () => {
  it('presents the demo Business, its profession and what the dataset holds', async () => {
    const view = await renderHub('ESTHETICS');
    const expected = createPlaygroundDemoScenario('ESTHETICS', NOW);
    const active = expected.seed.clients.filter((client) => client.archivedAt === undefined).length;

    expect(view.getByText('Mode démonstration')).toBeTruthy();
    expect(view.getByText('Institut Beauté Démo')).toBeTruthy();
    expect(view.getByText('ESTHÉTIQUE')).toBeTruthy();
    expect(
      view.getByText(
        `${active} clients · ${expected.seed.services.length} prestations · ${expected.seed.appointments.length} rendez-vous · ${expected.seed.products.length} produits · ${expected.seed.sales.length} ventes · 1 archivée`,
      ),
    ).toBeTruthy();
    expect(view.getByTestId('playground-demo-notice')).toBeTruthy();
    expect(view.getByTestId('playground-demo-indicator')).toBeTruthy();
  });

  it('opens the real catalogue and follows the demo edits in its counts', async () => {
    const view = await renderHub('NAILS');
    await press(view.getByTestId('playground-demo-services'));
    expect(mockPush).toHaveBeenCalledWith('/services');

    const before = clients.current!.activeClients.length;
    await act(async () => {
      clients.current!.addClient({ id: 'demo-added', firstName: 'Nouvelle' });
    });
    expect(view.getByText(new RegExp(`^${before + 1} clients`))).toBeTruthy();
  });

  it('resets only after confirmation, restoring the original dataset', async () => {
    const view = await renderHub('HAIRDRESSING');
    const before = clients.current!.activeClients.length;
    await act(async () => {
      clients.current!.addClient({ id: 'demo-added', firstName: 'Nouvelle' });
    });
    expect(clients.current!.activeClients).toHaveLength(before + 1);

    await press(view.getByTestId('playground-demo-reset'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0]![0]).toBe(RESET_DEMO_TITLE);
    const buttons = alertSpy.mock.calls[0]![2]!;
    // Cancelled: nothing changes.
    expect(clients.current!.activeClients).toHaveLength(before + 1);
    const generation = session.current!.scenario!.generation;

    await act(async () => {
      buttons.find((button) => button.style === 'destructive')!.onPress!();
    });
    await waitFor(() => expect(session.current!.scenario!.generation).toBe(generation + 1));
    await waitFor(() => expect(clients.current!.activeClients).toHaveLength(before));
    expect(session.current!.scenario!.activityType).toBe('HAIRDRESSING');
    expect(clients.current!.getClientById('demo-added')).toBeUndefined();
  });

  it('changes profession and leaves by dismissing the demo group, nothing else', async () => {
    const view = await renderHub('NAILS');
    expect(view.getByText(CHANGE_PROFESSION_TITLE)).toBeTruthy();
    expect(view.getByText(LEAVE_PLAYGROUND_TITLE)).toBeTruthy();

    await press(view.getByTestId('playground-demo-change-profession'));
    expect(mockDismissTo).toHaveBeenLastCalledWith('/playground');
    await press(view.getByTestId('playground-demo-leave'));
    expect(mockDismissTo).toHaveBeenLastCalledWith('/');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('offers « Prévisualiser les premiers pas » from the established demo: a just-onboarded Business of the same profession', async () => {
    const view = await renderHub('NAILS');
    expect(view.queryByTestId('playground-demo-first-use-clients-imported')).toBeNull();

    await press(view.getByTestId('playground-demo-preview-first-steps'));

    await waitFor(() => expect(session.current!.scenario!.firstUse).toEqual({ stage: 'just-onboarded', origin: undefined }));
    expect(session.current!.scenario!.activityType).toBe('NAILS');
  });

  it('lists the first-use stages, marks the one shown, switches stage keeping the origin, and goes back to the established demo', async () => {
    const view = await renderHub('ESTHETICS');
    const origin = { businessName: 'Institut Inès', ownerFirstName: 'Inès' };
    await act(async () => {
      session.current!.start('ESTHETICS', { stage: 'just-onboarded', origin });
    });
    await waitFor(() => expect(view.getByTestId('playground-demo-first-use-just-onboarded')).toBeTruthy());
    expect(view.getByTestId('playground-demo-first-use-just-onboarded').props.accessibilityLabel).toMatch(/état affiché$/);
    expect(view.getByTestId('playground-demo-first-use-priced-with-products').props.accessibilityLabel).not.toMatch(/état affiché/);

    await press(view.getByTestId('playground-demo-first-use-first-appointment'));
    await waitFor(() =>
      expect(session.current!.scenario!.firstUse).toEqual({ stage: 'first-appointment', origin }),
    );

    await waitFor(() => expect(view.getByTestId('playground-demo-established')).toBeTruthy());
    await press(view.getByTestId('playground-demo-established'));
    await waitFor(() => expect(session.current!.scenario!.firstUse).toBeUndefined());
  });
});

// BeautIzzy — Playground demo runtime (behavioural): the real providers, in memory only
//
// The runtime is rendered the way the `(demo)` layout renders it, under a
// signed-out AuthProvider (the application root's state while the Playground
// is reachable) and the demo session, with the database factory injected —
// here Node's in-memory SQLite, on the device expo-sqlite's `:memory:`. The
// modules the demo must never touch are mocked to THROW on load: Supabase,
// RevenueCat, the device database binding and the cloud sync runner. A
// regression that reached for any of them would fail at require time.

import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { AuthProvider, useAuth, type AuthState } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import type { ClientSessionValue } from '@/features/clients/session/types';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import type { AppointmentSessionValue } from '@/features/appointments/session/types';
import type { ServiceCatalogSessionValue } from '@/features/services/session/types';
import type { BusinessProfile } from '@/domain/business';
import type { SourisDatabase } from '@/persistence/database';
import { loadAppointments } from '@/persistence/stores/appointments';
import { loadClients } from '@/persistence/stores/clients';
import { loadServices } from '@/persistence/stores/services';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { usePersistence, type PersistenceValue } from '@/providers/PersistenceProvider';

import { isPlaygroundAvailable } from '../../availability';
import { PlaygroundDemoRuntime } from '../PlaygroundDemoRuntime';
import { createPlaygroundDemoScenario } from '../scenarios';
import { PlaygroundDemoSessionProvider, usePlaygroundDemoSession, type PlaygroundDemoSessionValue } from '../session';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text: RNText } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { readonly href: string }) => React.createElement(RNText, { testID: 'redirect' }, href),
  };
});
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

// Isolation boundary: none of these may be loaded by the demo runtime.
jest.mock('@/infrastructure/supabase', () => {
  throw new Error('the Playground demo must never load the Supabase gateways');
});
jest.mock('@/infrastructure/revenuecat', () => {
  throw new Error('the Playground demo must never load RevenueCat');
});
jest.mock('@/persistence/expo-database', () => {
  throw new Error('the Playground demo runtime must never open the device database');
});
jest.mock('@/providers/CloudSyncRunner', () => {
  throw new Error('the Playground demo must never mount the cloud sync runner');
});

const NOW = new Date(2027, 2, 10, 15, 30);

interface Probe {
  readonly business: BusinessProfile;
  readonly clients: ClientSessionValue;
  readonly services: ServiceCatalogSessionValue;
  readonly appointments: AppointmentSessionValue;
  readonly persistence: PersistenceValue;
}

const probe: { current?: Probe } = {};
const session: { current?: PlaygroundDemoSessionValue } = {};
const auth: { current?: AuthState } = {};

function DemoProbe() {
  const business = useCurrentBusiness();
  const clients = useClientSession();
  const services = useServiceCatalog();
  const appointments = useAppointmentSession();
  const persistence = usePersistence();
  useEffect(() => {
    probe.current = { business, clients, services, appointments, persistence };
  });
  return <Text testID="demo-business">{business.name}</Text>;
}

function SessionProbe() {
  const value = usePlaygroundDemoSession();
  const { state } = useAuth();
  useEffect(() => {
    session.current = value;
    auth.current = state;
  });
  return null;
}

interface Harness {
  readonly databases: SourisDatabase[];
  readonly gateway: FakeAuthGateway;
}

function createHarness(): Harness {
  return { databases: [], gateway: createFakeAuthGateway() };
}

// Lets a test unmount the runtime alone — as leaving the `(demo)` group does — while the session provider stays.
const controls: { hideRuntime?: () => void } = {};

function Tree({ harness }: { readonly harness: Harness }) {
  const [runtimeMounted, setRuntimeMounted] = useState(true);
  const [openDatabase] = useState(() => () => {
    const database = openTestDatabase();
    harness.databases.push(database);
    return database;
  });
  useEffect(() => {
    controls.hideRuntime = () => setRuntimeMounted(false);
  }, []);
  return (
    <AuthProvider gateway={harness.gateway}>
      <PlaygroundDemoSessionProvider>
        <SessionProbe />
        {runtimeMounted && (
          <PlaygroundDemoRuntime now={() => NOW} openDatabase={openDatabase}>
            <DemoProbe />
          </PlaygroundDemoRuntime>
        )}
      </PlaygroundDemoSessionProvider>
    </AuthProvider>
  );
}

async function renderRuntime(harness = createHarness()) {
  const view = await render(<Tree harness={harness} />);
  await act(async () => {});
  return { view, harness };
}

const start = (activityType: 'HAIRDRESSING' | 'NAILS' | 'ESTHETICS') =>
  act(async () => {
    session.current!.start(activityType);
  });

function isClosed(database: SourisDatabase): boolean {
  try {
    database.getFirstSync('SELECT 1 AS one');
    return false;
  } catch {
    return true;
  }
}

beforeEach(() => {
  probe.current = undefined;
  session.current = undefined;
  auth.current = undefined;
  jest.mocked(isPlaygroundAvailable).mockReturnValue(true);
});

describe('PlaygroundDemoRuntime', () => {
  it('redirects to the landing while no demo was chosen, opening nothing', async () => {
    const { view, harness } = await renderRuntime();
    expect(view.getByTestId('redirect').props.children).toBe('/playground');
    expect(view.queryByTestId('demo-business')).toBeNull();
    expect(harness.databases).toHaveLength(0);
  });

  it('redirects to the signed-out entry when the Playground is unavailable, whatever the session says', async () => {
    jest.mocked(isPlaygroundAvailable).mockReturnValue(false);
    const { view, harness } = await renderRuntime();
    await start('NAILS');
    expect(view.getByTestId('redirect').props.children).toBe('/');
    expect(harness.databases).toHaveLength(0);
  });

  it('mounts the real providers on the profession dataset, in one private in-memory database', async () => {
    const { view, harness } = await renderRuntime();
    await start('NAILS');
    await waitFor(() => expect(probe.current).toBeDefined());

    const expected = createPlaygroundDemoScenario('NAILS', NOW);
    expect(view.getByTestId('demo-business').props.children).toBe('Atelier Ongles Démo');
    expect(view.getByTestId('playground-demo-indicator')).toBeTruthy();
    expect(probe.current!.business).toEqual(expected.business);
    expect(probe.current!.clients.clients.map((client) => client.id).sort()).toEqual(
      expected.seed.clients.map((client) => client.id).sort(),
    );
    expect(probe.current!.clients.archivedClients).toHaveLength(1);
    expect(probe.current!.services.services.map((service) => service.name)).toEqual(
      expected.seed.services.map((service) => service.name),
    );
    expect(probe.current!.appointments.appointments).toHaveLength(expected.seed.appointments.length);

    // The database behind the providers is the injected one — and the only one.
    expect(harness.databases).toHaveLength(1);
    const database = harness.databases[0]!;
    expect(probe.current!.persistence.database).toBe(database);
    expect(loadClients(database)).toHaveLength(expected.seed.clients.length);
    expect(loadServices(database)).toHaveLength(expected.seed.services.length);
    expect(loadAppointments(database)).toHaveLength(expected.seed.appointments.length);
    // The files boundary is the demo's own, never a device directory.
    expect(probe.current!.persistence.files.documentDirectoryUri).toBe('file:///playground-demo/Documents/');
  });

  it('keeps every interactive change inside the demo and restores the original dataset on reset', async () => {
    const { harness } = await renderRuntime();
    await start('ESTHETICS');
    await waitFor(() => expect(probe.current).toBeDefined());
    const original = probe.current!.clients.clients.length;
    const first = harness.databases[0]!;

    await act(async () => {
      probe.current!.clients.addClient({ id: 'demo-added-client', firstName: 'Nouvelle', lastName: 'Cliente' });
    });
    expect(probe.current!.clients.clients).toHaveLength(original + 1);
    expect(loadClients(first).some((client) => client.id === 'demo-added-client')).toBe(true);

    await act(async () => {
      session.current!.reset();
    });
    await waitFor(() => expect(harness.databases).toHaveLength(2));
    await waitFor(() => expect(probe.current!.persistence.database).toBe(harness.databases[1]));

    expect(probe.current!.clients.clients).toHaveLength(original);
    expect(probe.current!.clients.getClientById('demo-added-client')).toBeUndefined();
    expect(loadClients(harness.databases[1]!).some((client) => client.id === 'demo-added-client')).toBe(false);
    // The previous generation's database is closed with it: nothing lingers.
    expect(isClosed(first)).toBe(true);
  });

  it('switching profession discards the previous demo entirely', async () => {
    const { view, harness } = await renderRuntime();
    await start('HAIRDRESSING');
    await waitFor(() => expect(probe.current).toBeDefined());
    const hairClientIds = probe.current!.clients.clients.map((client) => client.id);
    await act(async () => {
      probe.current!.services.addService({
        id: 'demo-added-service',
        businessId: probe.current!.business.id,
        name: 'Prestation ajoutée',
        type: 'SERVICE',
        price: 10,
        phases: [{ id: 'demo-added-phase', name: 'Prestation ajoutée', durationMinutes: 10, requiresStaff: true }],
        active: true,
      });
    });

    await start('NAILS');
    await waitFor(() => expect(view.getByTestId('demo-business').props.children).toBe('Atelier Ongles Démo'));
    await waitFor(() => expect(probe.current!.persistence.database).toBe(harness.databases[1]));

    expect(probe.current!.business.activityType).toBe('NAILS');
    expect(probe.current!.services.getServiceById('demo-added-service')).toBeUndefined();
    const nailsClientIds = new Set(probe.current!.clients.clients.map((client) => client.id));
    for (const id of hairClientIds) expect(nailsClientIds.has(id)).toBe(false);
    expect(isClosed(harness.databases[0]!)).toBe(true);
  });

  it('never touches authentication: the root session stays signed out and no auth call is made', async () => {
    const { harness } = await renderRuntime();
    await start('NAILS');
    await waitFor(() => expect(probe.current).toBeDefined());
    await act(async () => {
      probe.current!.clients.addClient({ id: 'demo-added-client', firstName: 'Nouvelle' });
    });

    expect(auth.current).toEqual({ status: 'unauthenticated' });
    expect(harness.gateway.calls.signIn).toHaveLength(0);
    expect(harness.gateway.calls.signUp).toHaveLength(0);
    expect(harness.gateway.calls.signOut).toBe(0);
    expect(harness.gateway.calls.restoreSession).toBe(1);
  });

  it('ends the demo session when it unmounts, so the next entry is a fresh one', async () => {
    const { view, harness } = await renderRuntime();
    await start('NAILS');
    await waitFor(() => expect(probe.current).toBeDefined());
    expect(session.current!.scenario?.activityType).toBe('NAILS');

    await act(async () => {
      controls.hideRuntime!();
    });
    expect(view.queryByTestId('demo-business')).toBeNull();
    expect(session.current!.scenario).toBeNull();
    expect(isClosed(harness.databases[0]!)).toBe(true);
    expect(harness.databases).toHaveLength(1);
  });
});

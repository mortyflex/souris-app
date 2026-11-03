// BeautIzzy — root gate: protected content never mounts before the session resolved

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';
import { BusinessAccessProvider } from '@/features/access/session/BusinessAccessProvider';
import { createFakeSubscriptionSource, type FakeSubscriptionSource } from '@/features/access/testing/fake-subscription-source';
import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import { createFakeBusinessGateway, createRemoteBusiness, type FakeBusinessGateway } from '@/features/business/testing/fake-business-gateway';
import { bindLocalDatabaseToBusiness, readBusinessProfile } from '@/persistence/stores/business-profile';
import { loadSyncOutbox, markAggregateUpserted } from '@/persistence/sync/outbox';
import { loadServices } from '@/persistence/stores/services';
import { migrateDatabase } from '@/persistence/migrations';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createFirstRunSeed } from '@/providers/first-run-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { RootNavigator } from '../RootNavigator';

// A faithful-enough Stack: Protected groups render their screens only while
// their guard is true; a Screen renders its route name.
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text: RNText } = jest.requireActual('react-native') as typeof import('react-native');
  const Screen = ({ name }: { readonly name: string }) =>
    React.createElement(RNText, { testID: `route-${name}` }, name);
  const Protected = ({ guard, children }: { readonly guard: boolean; readonly children?: React.ReactNode }) =>
    guard ? React.createElement(React.Fragment, null, children) : null;
  const Stack = ({ children }: { readonly children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.Screen = Screen;
  Stack.Protected = Protected;
  return { Stack };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

interface Options {
  readonly auth?: FakeAuthGateway;
  readonly business?: FakeBusinessGateway;
  readonly database?: ReturnType<typeof openTestDatabase>;
  readonly subscription?: FakeSubscriptionSource;
}

/** The store says the subscription ENDED: the harshest answer, which the shipped enforcement ignores. */
function createExpiredSubscriptionSource(): FakeSubscriptionSource {
  const source = createFakeSubscriptionSource();
  source.respondWith({ kind: 'verified', status: { kind: 'expired' } });
  return source;
}

// The same composition as the application root: Auth → Business → Access → gate.
async function renderGate({
  auth = createFakeAuthGateway(),
  business = createFakeBusinessGateway(),
  database = openTestDatabase(),
  subscription = createExpiredSubscriptionSource(),
}: Options = {}) {
  const view = await render(
    <TestPersistenceProvider createSeed={createFirstRunSeed} database={database}>
      <AuthProvider gateway={auth}>
        <BusinessSessionProvider gateway={business}>
          <BusinessAccessProvider enforcement={SUBSCRIPTION_ENFORCEMENT} source={subscription}>
            <RootNavigator />
            <Text testID="sibling">ok</Text>
          </BusinessAccessProvider>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  return view;
}

describe('RootNavigator', () => {
  it('shows only the branded boot surface while the session is restoring', async () => {
    let resolve: ((value: { kind: 'unauthenticated' }) => void) | undefined;
    const auth = createFakeAuthGateway({
      restore: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    const view = await renderGate({ auth });

    expect(view.getByTestId('boot-surface')).toBeTruthy();
    expect(view.queryByTestId('route-(app)')).toBeNull();
    expect(view.queryByTestId('route-(auth)')).toBeNull();

    await act(async () => resolve?.({ kind: 'unauthenticated' }));
    expect(view.queryByTestId('boot-surface')).toBeNull();
    expect(view.getByTestId('route-(auth)')).toBeTruthy();
    expect(view.queryByTestId('route-(app)')).toBeNull();
  });

  it('routes session + no business to setup, and session + business to the app', async () => {
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const setup = await renderGate({ auth });
    await waitFor(() => expect(setup.getByTestId('route-(onboarding)')).toBeTruthy());
    expect(setup.queryByTestId('route-(app)')).toBeNull();

    const app = await renderGate({ auth, business: createFakeBusinessGateway([createRemoteBusiness()]) });
    await waitFor(() => expect(app.getByTestId('route-(app)')).toBeTruthy());
    expect(app.queryByTestId('route-(auth)')).toBeNull();
    expect(app.queryByTestId('route-(onboarding)')).toBeNull();
  });

  it('an existing account on a new device never meets onboarding and never receives starter prestations', async () => {
    const database = openTestDatabase();
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const business = createFakeBusinessGateway([createRemoteBusiness({ activityType: 'HAIRDRESSING' })]);
    const view = await renderGate({ auth, business, database });

    // Remote discovery → local binding → the app, straight away.
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(view.queryByTestId('route-(onboarding)')).toBeNull();
    expect(business.calls.create).toBe(0);
    // The catalogue is exactly what the restore brings: nothing was seeded for the activity.
    expect(loadServices(database)).toHaveLength(0);
  });

  it('drops the protected group as soon as the session ends, and opens offline from the local binding', async () => {
    const database = openTestDatabase();
    migrateDatabase(database);
    bindLocalDatabaseToBusiness(database, createRemoteBusiness());
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'unavailable' }) });
    const view = await render(
      <TestPersistenceProvider createSeed={createFirstRunSeed} database={database}>
        <AuthProvider gateway={auth} resolveLocalOwner={() => ({ id: 'user-lea' })}>
          <BusinessSessionProvider gateway={createFakeBusinessGateway()}>
            <RootNavigator />
          </BusinessSessionProvider>
        </AuthProvider>
      </TestPersistenceProvider>,
    );
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());

    await act(async () => {
      auth.emitSession(null);
    });
    expect(view.queryByTestId('route-(app)')).toBeNull();
    expect(view.getByTestId('route-(auth)')).toBeTruthy();
  });

  it('shows the dedicated conflict and unavailable states instead of any protected screen', async () => {
    const database = openTestDatabase();
    migrateDatabase(database);
    bindLocalDatabaseToBusiness(database, createRemoteBusiness());
    const other = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: { id: 'user-b' } }) });
    const conflict = await renderGate({ auth: other, database });
    await waitFor(() => expect(conflict.getByTestId('account-conflict-screen')).toBeTruthy());
    expect(conflict.queryByTestId('route-(app)')).toBeNull();
    expect(conflict.queryByText('Maison Léa')).toBeNull();

    const failing = createFakeBusinessGateway();
    failing.failNext('NETWORK');
    const unavailable = await renderGate({
      auth: createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) }),
      business: failing,
    });
    await waitFor(() => expect(unavailable.getByTestId('account-unavailable-screen')).toBeTruthy());
    expect(unavailable.getByText('Réessayer')).toBeTruthy();
    expect(unavailable.queryByTestId('route-(app)')).toBeNull();
  });

  it('conflict: signing out the other account ends its session only — the bound data, its owner and its unsent changes stay', async () => {
    const database = openTestDatabase();
    migrateDatabase(database);
    const owner = createRemoteBusiness();
    bindLocalDatabaseToBusiness(database, owner);
    markAggregateUpserted(database, 'CLIENT', '11111111-1111-4111-8111-111111111111');
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: { id: 'user-b' } }) });
    const view = await renderGate({ auth, database, business: createFakeBusinessGateway([owner]) });
    await waitFor(() => expect(view.getByTestId('account-conflict-screen')).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByText('Se déconnecter'));
    });
    expect(auth.calls.signOut).toBe(1);
    expect(view.getByTestId('route-(auth)')).toBeTruthy();
    expect(readBusinessProfile(database)?.id).toBe(owner.id);
    expect(loadSyncOutbox(database, owner.id)).toHaveLength(1);

    // The original owner signs in again on this device: straight back to her Business.
    await act(async () => auth.emitSession(fakeUser));
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(loadSyncOutbox(database, owner.id)).toHaveLength(1);
  });

  it('routes exactly as before whatever the subscription source answers (enforcement disabled)', async () => {
    expect(SUBSCRIPTION_ENFORCEMENT).toBe('disabled');
    const answers = [
      { kind: 'verified', status: { kind: 'expired' } },
      { kind: 'verified', status: { kind: 'never' } },
      { kind: 'unavailable' },
    ] as const;
    for (const answer of answers) {
      const subscription = createFakeSubscriptionSource();
      subscription.respondWith(answer);
      const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
      const view = await renderGate({ auth, business: createFakeBusinessGateway([createRemoteBusiness()]), subscription });
      await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
      expect(subscription.calls.verify).toEqual(['user-lea']);
      expect(view.queryByTestId('route-(auth)')).toBeNull();
      expect(view.queryByTestId('route-(onboarding)')).toBeNull();
    }

    const signedOut = await renderGate({ subscription: createExpiredSubscriptionSource() });
    await waitFor(() => expect(signedOut.getByTestId('route-(auth)')).toBeTruthy());
  });
});

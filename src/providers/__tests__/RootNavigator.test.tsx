// Souris — root gate: protected content never mounts before the session resolved

import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import { createFakeBusinessGateway, createRemoteBusiness, type FakeBusinessGateway } from '@/features/business/testing/fake-business-gateway';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
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
}

async function renderGate({ auth = createFakeAuthGateway(), business = createFakeBusinessGateway(), database = openTestDatabase() }: Options = {}) {
  const view = await render(
    <TestPersistenceProvider createSeed={createFirstRunSeed} database={database}>
      <AuthProvider gateway={auth}>
        <BusinessSessionProvider gateway={business}>
          <RootNavigator />
          <Text testID="sibling">ok</Text>
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
});

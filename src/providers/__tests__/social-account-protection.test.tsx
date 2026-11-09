// BeautIzzy — Google / Apple never change which Business an account reaches
//
// The root gate decides from the authenticated USER ID only (Business
// resolution, the local binding). These tests sign in through the social
// entry points of a fake gateway and check the real gate over a real test
// SQLite database: an existing account reaches its Business unchanged; a
// different user id — even with the same email string — never sees it and
// never takes the device over while it holds unsent data; a new account gets
// the onboarding and nothing is created for it automatically.

import { act, render, waitFor } from '@testing-library/react-native';

import { SUBSCRIPTION_ENFORCEMENT } from '@/features/access/enforcement';
import { BusinessAccessProvider } from '@/features/access/session/BusinessAccessProvider';
import { createFakeSubscriptionSource } from '@/features/access/testing/fake-subscription-source';
import type { AuthUser } from '@/features/auth/gateway';
import { AuthProvider, useAuth, type AuthSessionValue } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import { ACCOUNT_CONFLICT_HANDOVER_ACTION } from '@/features/business/AccountConflictScreen';
import { BusinessSessionProvider } from '@/features/business/session/BusinessSessionProvider';
import { createFakeBusinessGateway, createRemoteBusiness, type FakeBusinessGateway } from '@/features/business/testing/fake-business-gateway';
import { migrateDatabase } from '@/persistence/migrations';
import { bindLocalDatabaseToBusiness, readBusinessProfile } from '@/persistence/stores/business-profile';
import { loadSyncOutbox, markAggregateUpserted } from '@/persistence/sync/outbox';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createFirstRunSeed } from '@/providers/first-run-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { useEffect } from 'react';

import { RootNavigator } from '../RootNavigator';

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

let latest: AuthSessionValue | undefined;
function AuthHandle() {
  const value = useAuth();
  useEffect(() => {
    latest = value;
  });
  return null;
}

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

/** Léa's phone: bound to her Business, one client change not yet sent. */
function bindToLea() {
  const database = openTestDatabase();
  migrateDatabase(database);
  const owner = createRemoteBusiness();
  bindLocalDatabaseToBusiness(database, owner);
  markAggregateUpserted(database, 'CLIENT', CLIENT_ID);
  return { database, owner };
}

async function renderGate(auth: FakeAuthGateway, business: FakeBusinessGateway, database = openTestDatabase()) {
  const source = createFakeSubscriptionSource();
  const view = await render(
    <TestPersistenceProvider createSeed={createFirstRunSeed} database={database}>
      <AuthProvider gateway={auth}>
        <BusinessSessionProvider gateway={business}>
          <BusinessAccessProvider enforcement={SUBSCRIPTION_ENFORCEMENT} source={source}>
            <RootNavigator />
            <AuthHandle />
          </BusinessAccessProvider>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

afterEach(() => {
  latest = undefined;
});

describe('social sign-in and the professional’s data', () => {
  it('an existing professional whose Google identity Supabase linked reaches the bound Business unchanged — same id, nothing created', async () => {
    const { database, owner } = bindToLea();
    // Same user id as the email account: Supabase linked the verified Google identity.
    const auth = createFakeAuthGateway({ signInWithGoogle: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const business = createFakeBusinessGateway([owner]);
    const view = await renderGate(auth, business, database);
    expect(view.getByTestId('route-(auth)')).toBeTruthy();

    await act(async () => {
      await latest?.signInWithGoogle();
    });
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(view.queryByTestId('route-(onboarding)')).toBeNull();
    expect(business.calls.create).toBe(0);
    expect(readBusinessProfile(database)).toMatchObject({ id: owner.id, ownerUserId: 'user-lea' });
    expect(loadSyncOutbox(database, owner.id)).toHaveLength(1);
  });

  it('an existing professional on a NEW device: Apple with the same id finds the remote Business — never the onboarding', async () => {
    const auth = createFakeAuthGateway({ signInWithApple: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const business = createFakeBusinessGateway([createRemoteBusiness()]);
    const view = await renderGate(auth, business);

    await act(async () => {
      await latest?.signInWithApple();
    });
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    expect(business.calls.create).toBe(0);
  });

  it.each<[string, AuthUser]>([
    ['an Apple private relay account', { id: 'user-apple-relay', email: 'x7k2m9q4@privaterelay.appleid.com', createdWith: 'apple' }],
    // The SAME email string under another user id (an unlinked identity): never merged by email.
    ['another user id with the same email', { id: 'user-google-other', email: fakeUser.email, createdWith: 'google' }],
  ])('%s never sees Léa’s Business: the conflict screen, its binding and unsent change untouched', async (_case, user) => {
    const { database, owner } = bindToLea();
    const auth = createFakeAuthGateway({ signInWithGoogle: async () => ({ kind: 'authenticated', user }) });
    const business = createFakeBusinessGateway([owner]);
    const view = await renderGate(auth, business, database);

    await act(async () => {
      await latest?.signInWithGoogle();
    });
    await waitFor(() => expect(view.getByTestId('account-conflict-screen')).toBeTruthy());
    expect(view.queryByTestId('route-(app)')).toBeNull();
    expect(view.queryByTestId('route-(onboarding)')).toBeNull();
    expect(view.queryByText('Maison Léa')).toBeNull();
    // The pending change blocks the hand-over: only « Se déconnecter » is offered.
    await waitFor(() => expect(view.getByTestId('account-conflict-sign-out')).toBeTruthy());
    expect(view.queryByText(ACCOUNT_CONFLICT_HANDOVER_ACTION)).toBeNull();
    expect(business.calls.create).toBe(0);
    expect(readBusinessProfile(database)).toMatchObject({ id: owner.id, ownerUserId: 'user-lea' });
    expect(loadSyncOutbox(database, owner.id)).toHaveLength(1);
  });

  it('a new professional on an empty device gets the onboarding — and no Business is created automatically', async () => {
    const auth = createFakeAuthGateway({
      signInWithGoogle: async () => ({
        kind: 'authenticated',
        user: { id: 'user-google-new', email: 'nina@gmail.com', createdWith: 'google' },
      }),
    });
    const business = createFakeBusinessGateway();
    const view = await renderGate(auth, business);

    await act(async () => {
      await latest?.signInWithGoogle();
    });
    await waitFor(() => expect(view.getByTestId('route-(onboarding)')).toBeTruthy());
    expect(business.calls.create).toBe(0);
    expect(business.rows).toHaveLength(0);
  });

  it('repeated logins (in, out, in again) reach the same Business: no duplicate, no onboarding', async () => {
    const { database, owner } = bindToLea();
    const auth = createFakeAuthGateway({ signInWithGoogle: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const business = createFakeBusinessGateway([owner]);
    const view = await renderGate(auth, business, database);

    await act(async () => {
      await latest?.signInWithGoogle();
    });
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());
    await act(async () => {
      await latest?.signOut();
    });
    expect(view.getByTestId('route-(auth)')).toBeTruthy();
    await act(async () => {
      await latest?.signInWithGoogle();
    });
    await waitFor(() => expect(view.getByTestId('route-(app)')).toBeTruthy());

    expect(business.calls.create).toBe(0);
    expect(business.rows).toHaveLength(1);
    expect(readBusinessProfile(database)?.id).toBe(owner.id);
    expect(loadSyncOutbox(database, owner.id)).toHaveLength(1);
  });
});

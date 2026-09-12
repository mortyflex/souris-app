import { act, render, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import type { SourisDatabase } from '@/persistence/database';
import { listLocalBusinessIds, readBusinessProfile } from '@/persistence/stores/business-profile';
import { createTestSeed } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { createFakeBusinessGateway, createRemoteBusiness, REMOTE_BUSINESS_ID, type FakeBusinessGateway } from '../../testing/fake-business-gateway';
import { BusinessSessionProvider, useBusinessSession, type BusinessSessionValue } from '../BusinessSessionProvider';

let latest: BusinessSessionValue | undefined;

function Probe() {
  const value = useBusinessSession();
  useEffect(() => {
    latest = value;
  });
  const { state } = value;
  const label =
    state.status === 'ready'
      ? `ready:${state.business.id}`
      : state.status === 'error'
        ? `error:${state.failure.code}`
        : state.status;
  return <Text testID="business-state">{label}</Text>;
}

interface Harness {
  readonly database: SourisDatabase;
  readonly auth: FakeAuthGateway;
  readonly business: FakeBusinessGateway;
}

type RenderedView = Awaited<ReturnType<typeof render>>;

async function renderSession({ database, auth, business }: Harness) {
  const view = await render(
    <TestPersistenceProvider createSeed={createTestSeed} database={database}>
      <AuthProvider gateway={auth}>
        <BusinessSessionProvider gateway={business}>
          <Probe />
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

const stateOf = (view: RenderedView) => view.getByTestId('business-state').props.children;

const setupInput = { ownerFirstName: 'Léa', ownerLastName: 'Martin', name: 'Maison Léa', activityType: 'HAIRDRESSING' } as const;

describe('BusinessSessionProvider', () => {
  afterEach(() => {
    latest = undefined;
  });

  it('stays idle while signed out and requires setup for an authenticated owner without a Business', async () => {
    const database = openTestDatabase();
    const business = createFakeBusinessGateway();
    const signedOut = await renderSession({ database, auth: createFakeAuthGateway(), business });
    expect(stateOf(signedOut)).toBe('idle');

    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const signedIn = await renderSession({ database: openTestDatabase(), auth, business });
    await waitFor(() => expect(stateOf(signedIn)).toBe('setup-required'));
  });

  it('creates the Business remotely, binds it locally, and only then reports ready', async () => {
    const database = openTestDatabase();
    const business = createFakeBusinessGateway();
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const view = await renderSession({ database, auth, business });
    await waitFor(() => expect(stateOf(view)).toBe('setup-required'));

    await act(async () => {
      await expect(latest?.createBusiness(setupInput)).resolves.toMatchObject({ kind: 'created' });
    });

    expect(stateOf(view)).toBe(`ready:${REMOTE_BUSINESS_ID}`);
    expect(readBusinessProfile(database)?.name).toBe('Maison Léa');
    expect(listLocalBusinessIds(database)).toEqual([REMOTE_BUSINESS_ID]);
    expect(business.calls.create).toBe(1);
  });

  it('keeps the form actionable and binds nothing when remote creation fails', async () => {
    const database = openTestDatabase();
    const business = createFakeBusinessGateway();
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const view = await renderSession({ database, auth, business });
    await waitFor(() => expect(stateOf(view)).toBe('setup-required'));

    business.failNext('NETWORK');
    await act(async () => {
      await expect(latest?.createBusiness(setupInput)).resolves.toEqual({ kind: 'failed', failure: { code: 'NETWORK' } });
    });

    expect(stateOf(view)).toBe('setup-required');
    expect(readBusinessProfile(database)).toBeUndefined();
    expect(business.rows).toHaveLength(0);
  });

  it('reuses the remote Business on retry instead of creating a duplicate', async () => {
    const database = openTestDatabase();
    const business = createFakeBusinessGateway([createRemoteBusiness()]);
    // The remote row exists (a previous attempt succeeded) but the device was never bound.
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    business.failNext('NETWORK');
    const view = await renderSession({ database, auth, business });
    await waitFor(() => expect(stateOf(view)).toBe('error:NETWORK'));

    await act(async () => {

      latest?.retry();

    });
    await waitFor(() => expect(stateOf(view)).toBe(`ready:${REMOTE_BUSINESS_ID}`));
    expect(business.calls.create).toBe(0);
    expect(business.rows).toHaveLength(1);

    // And a submit that races an existing remote row also ends bound, not duplicated.
    const secondDatabase = openTestDatabase();
    const secondView = await renderSession({ database: secondDatabase, auth, business });
    await waitFor(() => expect(stateOf(secondView)).toBe(`ready:${REMOTE_BUSINESS_ID}`));
    await act(async () => {
      await expect(latest?.createBusiness(setupInput)).resolves.toMatchObject({ kind: 'created', business: { id: REMOTE_BUSINESS_ID } });
    });
    expect(business.rows).toHaveLength(1);
  });

  it('hydrates an existing remote Business and goes back to idle on sign-out, keeping the binding', async () => {
    const database = openTestDatabase();
    const business = createFakeBusinessGateway([createRemoteBusiness()]);
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const view = await renderSession({ database, auth, business });
    await waitFor(() => expect(stateOf(view)).toBe(`ready:${REMOTE_BUSINESS_ID}`));

    await act(async () => {

      auth.emitSession(null);

    });
    expect(stateOf(view)).toBe('idle');
    expect(readBusinessProfile(database)?.id).toBe(REMOTE_BUSINESS_ID);

    await act(async () => {

      auth.emitSession(fakeUser);

    });
    await waitFor(() => expect(stateOf(view)).toBe(`ready:${REMOTE_BUSINESS_ID}`));
    expect(business.calls.list).toBe(1);
  });

  it('reports DEVICE_ACCOUNT_CONFLICT when a different account signs in on a bound device', async () => {
    const database = openTestDatabase();
    const business = createFakeBusinessGateway([createRemoteBusiness()]);
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const view = await renderSession({ database, auth, business });
    await waitFor(() => expect(stateOf(view)).toBe(`ready:${REMOTE_BUSINESS_ID}`));

    await act(async () => {

      auth.emitSession(null);

    });
    await act(async () => {
      auth.emitSession({ id: 'user-b', email: 'b@example.com' });
    });
    await waitFor(() => expect(stateOf(view)).toBe('device-account-conflict'));
    expect(readBusinessProfile(database)?.ownerUserId).toBe('user-lea');
    expect(business.calls.list).toBe(1);
  });
});

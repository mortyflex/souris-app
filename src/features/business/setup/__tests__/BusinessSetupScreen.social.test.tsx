// BeautIzzy — onboarding after « Continuer avec Google / Apple »
//
// A NEW account created by a provider walks the SAME five steps; nothing is
// created before the professional chooses the profession and completes the
// details. The provider's first name is a suggestion; an Apple private relay
// address is never proposed as the reminders Reply-To; and the account can be
// changed before any Business exists.

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { BusinessActivityType } from '@/domain/business';
import type { AuthUser } from '@/features/auth/gateway';
import { AuthProvider, useAuth } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser, type FakeAuthGateway } from '@/features/auth/testing/fake-auth-gateway';
import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import { createFakeCommunicationsGateway } from '@/features/communications/testing/fake-communications-gateway';
import { consumeFirstArrival } from '@/features/home/first-steps/arrival';
import { reducedMotion } from '@/features/clients/birthday/testing/mock-reanimated';
import { readBusinessProfile } from '@/persistence/stores/business-profile';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createFirstRunSeed } from '@/providers/first-run-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { BusinessSessionProvider } from '../../session/BusinessSessionProvider';
import { createFakeBusinessGateway } from '../../testing/fake-business-gateway';
import { BusinessSetupScreen } from '../BusinessSetupScreen';

jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });
const type = (element: unknown, text: string) =>
  act(async () => {
    fireEvent.changeText(element as Parameters<typeof fireEvent.changeText>[0], text);
  });

const GOOGLE_USER: AuthUser = { id: 'user-google-new', email: 'nina@gmail.com', createdWith: 'google', givenName: 'Nina' };
const APPLE_RELAY_USER: AuthUser = { id: 'user-apple-relay', email: 'x7k2m9q4@privaterelay.appleid.com', createdWith: 'apple' };

function AuthStatusProbe() {
  const { state } = useAuth();
  return <Text testID="auth-status">{state.status}</Text>;
}

async function renderSetup(user: AuthUser, auth: FakeAuthGateway = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user }) })) {
  const database = openTestDatabase();
  const business = createFakeBusinessGateway();
  const view = await render(
    <TestPersistenceProvider createSeed={createFirstRunSeed} database={database}>
      <AuthProvider gateway={auth}>
        <BusinessSessionProvider gateway={business}>
          <CommunicationsGatewayProvider gateway={createFakeCommunicationsGateway()}>
            <BusinessSetupScreen />
            <AuthStatusProbe />
          </CommunicationsGatewayProvider>
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return { view, database, business, auth };
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  reducedMotion.enabled = false;
  consumeFirstArrival();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('onboarding of an account created with Google or Apple', () => {
  it.each<BusinessActivityType>(['HAIRDRESSING', 'NAILS', 'ESTHETICS'])(
    'a new Google professional (%s) creates ONE Business, owned by the new user id, only after the details step',
    async (activity) => {
      const { view, business, database } = await renderSetup(GOOGLE_USER);

      expect(view.getByTestId('onboarding-activity')).toBeTruthy();
      expect(business.calls.create).toBe(0);
      await press(view.getByTestId(`activity-${activity}`));
      await press(view.getByTestId('continue-activity'));

      // The Google first name is a suggestion, already in the field.
      expect(view.getByTestId('owner-first-name-input').props.value).toBe('Nina');
      await type(view.getByTestId('business-name-input'), 'Studio Nina');
      expect(business.calls.create).toBe(0);
      await press(view.getByTestId('continue-details'));
      await press(view.getByTestId('skip-reminders'));

      await waitFor(() => expect(view.getByTestId('onboarding-services')).toBeTruthy());
      expect(business.calls.create).toBe(1);
      expect(business.rows).toHaveLength(1);
      expect(business.rows[0]).toMatchObject({
        ownerUserId: 'user-google-new',
        ownerFirstName: 'Nina',
        name: 'Studio Nina',
        activityType: activity,
      });
      expect(readBusinessProfile(database)?.ownerUserId).toBe('user-google-new');
    },
  );

  it('the suggested first name stays editable, even cleared', async () => {
    const { view } = await renderSetup(GOOGLE_USER);
    await press(view.getByTestId('activity-NAILS'));
    await press(view.getByTestId('continue-activity'));
    await type(view.getByTestId('owner-first-name-input'), '');
    expect(view.getByTestId('owner-first-name-input').props.value).toBe('');
    await type(view.getByTestId('owner-first-name-input'), 'Ninon');
    expect(view.getByTestId('owner-first-name-input').props.value).toBe('Ninon');
  });

  it('names the new account on step 1, and offers to change accounts before anything exists', async () => {
    const { view, business, auth } = await renderSetup(GOOGLE_USER);
    expect(view.getByText(/Nouveau compte créé avec Google \(nina@gmail\.com\)\./)).toBeTruthy();

    await press(view.getByTestId('onboarding-switch-account'));
    expect(auth.calls.signOut).toBe(1);
    expect(view.getByTestId('auth-status').props.children).toBe('unauthenticated');
    expect(business.calls.create).toBe(0);
  });

  it('Apple private relay: the address is never shown nor proposed as the reminders Reply-To', async () => {
    const { view } = await renderSetup(APPLE_RELAY_USER);
    expect(view.getByText(/Nouveau compte créé avec Apple\./)).toBeTruthy();
    expect(view.queryByText(/privaterelay/)).toBeNull();

    await press(view.getByTestId('activity-ESTHETICS'));
    await press(view.getByTestId('continue-activity'));
    // Apple gave no name this time: nothing is invented.
    expect(view.getByTestId('owner-first-name-input').props.value).toBe('');
    await type(view.getByTestId('owner-first-name-input'), 'Inès');
    await type(view.getByTestId('business-name-input'), 'Institut Inès');
    await press(view.getByTestId('continue-details'));
    expect(view.getByTestId('reminder-reply-to-input').props.value).toBe('');
  });

  it('an email + password account sees step 1 exactly as before: no account notice', async () => {
    const { view } = await renderSetup(fakeUser);
    expect(view.getByTestId('onboarding-activity')).toBeTruthy();
    expect(view.queryByTestId('onboarding-new-social-account')).toBeNull();
  });
});

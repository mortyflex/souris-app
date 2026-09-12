import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { readBusinessProfile } from '@/persistence/stores/business-profile';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createFirstRunSeed } from '@/providers/first-run-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { BusinessSessionProvider } from '../../session/BusinessSessionProvider';
import { createFakeBusinessGateway } from '../../testing/fake-business-gateway';
import { BusinessSetupScreen } from '../BusinessSetupScreen';

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

/** Every interaction runs inside an awaited act: React 19 flushes updates asynchronously. */
const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });
const type = (element: unknown, text: string) =>
  act(async () => {
    fireEvent.changeText(element as Parameters<typeof fireEvent.changeText>[0], text);
  });

async function renderSetup() {
  const database = openTestDatabase();
  const business = createFakeBusinessGateway();
  const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
  const view = await render(
    <TestPersistenceProvider createSeed={createFirstRunSeed} database={database}>
      <AuthProvider gateway={auth}>
        <BusinessSessionProvider gateway={business}>
          <BusinessSetupScreen />
        </BusinessSessionProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return { view, database, business };
}

describe('BusinessSetupScreen', () => {
  it('requires first name, activity name, and an activity type', async () => {
    const { view, business } = await renderSetup();

    await press(view.getByTestId('submit-business'));

    expect(view.getByText('Votre prénom est requis.')).toBeTruthy();
    expect(view.getByText('Le nom de votre activité est requis.')).toBeTruthy();
    expect(view.getByText('Choisissez votre activité.')).toBeTruthy();
    expect(business.calls.create).toBe(0);
  });

  it('offers the canonical activities in French and marks the selection', async () => {
    const { view } = await renderSetup();

    for (const label of ['Coiffure', 'Barbier', 'Onglerie', 'Esthétique', 'Cils & sourcils', 'Autre']) {
      expect(view.getByText(label)).toBeTruthy();
    }
    await press(view.getByTestId('activity-NAILS'));
    expect(view.getByTestId('activity-NAILS').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('activity-HAIRDRESSING').props.accessibilityState.selected).toBe(false);
  });

  it('creates and binds the Business with trimmed values', async () => {
    const { view, database, business } = await renderSetup();

    await type(view.getByTestId('owner-first-name-input'), ' Sofia ');
    await type(view.getByTestId('business-name-input'), 'Nails by Sofia');
    await press(view.getByTestId('activity-NAILS'));
    await press(view.getByTestId('submit-business'));

    await waitFor(() => expect(business.calls.create).toBe(1));
    expect(business.rows[0]).toMatchObject({ ownerUserId: 'user-lea', ownerFirstName: 'Sofia', name: 'Nails by Sofia', activityType: 'NAILS' });
    expect(readBusinessProfile(database)?.name).toBe('Nails by Sofia');
  });

  it('keeps the whole draft when the remote creation fails, and succeeds on retry', async () => {
    const { view, database, business } = await renderSetup();
    business.failNext('NETWORK');

    await type(view.getByTestId('owner-first-name-input'), 'Léa');
    await type(view.getByTestId('business-name-input'), 'Maison Léa');
    await press(view.getByTestId('activity-HAIRDRESSING'));
    await press(view.getByTestId('submit-business'));

    expect(view.getByText(/Une connexion internet est nécessaire/)).toBeTruthy();
    expect(view.getByTestId('owner-first-name-input').props.value).toBe('Léa');
    expect(view.getByTestId('business-name-input').props.value).toBe('Maison Léa');
    expect(view.getByTestId('activity-HAIRDRESSING').props.accessibilityState.selected).toBe(true);
    expect(readBusinessProfile(database)).toBeUndefined();

    await press(view.getByTestId('submit-business'));
    await waitFor(() => expect(readBusinessProfile(database)?.name).toBe('Maison Léa'));
    expect(business.rows).toHaveLength(1);
  });
});

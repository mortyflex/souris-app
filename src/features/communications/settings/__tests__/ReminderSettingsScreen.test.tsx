// Souris — Rappels clientes Settings screen (Lot B)
//
// The real screen against the fake gateway: OFF by default, enabling
// requires a valid Reply-To (prefilled from the account email), the fixed
// « 24 h avant le rendez-vous » timing, disabling, the server refusal, and
// the offline fail-safe (last cached state, or disabled).

import { act, fireEvent, render } from '@testing-library/react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { CommunicationPreferencesProvider } from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import {
  createFakeCommunicationsGateway,
  type FakeCommunicationsGateway,
} from '@/features/communications/testing/fake-communications-gateway';
import { haptics } from '@/shared/lib/haptics';
import { testBusiness, TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { ReminderSettingsScreen } from '../ReminderSettingsScreen';

jest.spyOn(haptics, 'success').mockImplementation();
jest.spyOn(haptics, 'warning').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    SymbolView: () => React.createElement(React.Fragment, null),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

async function renderSettings(gateway: FakeCommunicationsGateway) {
  const auth = createFakeAuthGateway({
    restore: async () => ({ kind: 'authenticated', user: fakeUser }),
  });
  const view = await render(
    <TestPersistenceProvider>
      <AuthProvider gateway={auth}>
        <CommunicationsGatewayProvider gateway={gateway}>
          <CommunicationPreferencesProvider>
            <ReminderSettingsScreen />
          </CommunicationPreferencesProvider>
        </CommunicationsGatewayProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
}

const toggleTo = (view: Awaited<ReturnType<typeof renderSettings>>, value: boolean) =>
  act(async () => {
    fireEvent(view.getByTestId('reminder-toggle-switch'), 'valueChange', value);
  });

describe('ReminderSettingsScreen', () => {
  it('reads OFF by default, shows the fixed timing and prefills the account email', async () => {
    const view = await renderSettings(createFakeCommunicationsGateway());

    expect(view.getByTestId('reminder-toggle-switch').props.value).toBe(false);
    expect(view.getByText('Envoi')).toBeTruthy();
    expect(view.getByText('24 h avant le rendez-vous')).toBeTruthy();
    expect(view.getByTestId('reminder-reply-to-input').props.value).toBe(fakeUser.email);
  });

  it('enabling persists the server preference with the Reply-To', async () => {
    const gateway = createFakeCommunicationsGateway();
    const view = await renderSettings(gateway);

    await toggleTo(view, true);

    expect(gateway.updates).toEqual([
      {
        businessId: testBusiness.id,
        preferences: {
          emailRemindersEnabled: true,
          smsRemindersEnabled: false,
          replyToEmail: fakeUser.email,
        },
      },
    ]);
    expect(view.getByTestId('reminder-toggle-switch').props.value).toBe(true);
  });

  it('refuses to enable with an invalid Reply-To — nothing reaches the server', async () => {
    const gateway = createFakeCommunicationsGateway();
    const view = await renderSettings(gateway);

    await act(async () => {
      fireEvent.changeText(view.getByTestId('reminder-reply-to-input'), 'pas-une-adresse');
    });
    await toggleTo(view, true);

    expect(view.getByText('Adresse e-mail invalide.')).toBeTruthy();
    expect(gateway.calls.update).toBe(0);
    expect(view.getByTestId('reminder-toggle-switch').props.value).toBe(false);
  });

  it('disabling persists OFF and keeps the stored Reply-To', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedPreferences(testBusiness.id, {
      emailRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
    const view = await renderSettings(gateway);
    expect(view.getByTestId('reminder-toggle-switch').props.value).toBe(true);

    await toggleTo(view, false);

    expect(gateway.updates.at(-1)).toEqual({
      businessId: testBusiness.id,
      preferences: {
        emailRemindersEnabled: false,
        smsRemindersEnabled: false,
        replyToEmail: 'salon@example.test',
      },
    });
    expect(view.getByTestId('reminder-toggle-switch').props.value).toBe(false);
  });

  it('editing the Reply-To while enabled offers an explicit save', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.seedPreferences(testBusiness.id, {
      emailRemindersEnabled: true,
      replyToEmail: 'salon@example.test',
    });
    const view = await renderSettings(gateway);

    await act(async () => {
      fireEvent.changeText(view.getByTestId('reminder-reply-to-input'), 'nouvelle@example.test');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('reminder-save-reply-to'));
    });

    expect(gateway.updates.at(-1)?.preferences).toEqual({
      emailRemindersEnabled: true,
      smsRemindersEnabled: false,
      replyToEmail: 'nouvelle@example.test',
    });
  });

  it('a failing update keeps the last known state and explains, without flipping the switch', async () => {
    const gateway = createFakeCommunicationsGateway();
    const view = await renderSettings(gateway);
    gateway.failNext('NETWORK');

    await toggleTo(view, true);

    expect(view.getByText(/Impossible d’enregistrer le réglage/)).toBeTruthy();
    expect(view.getByTestId('reminder-toggle-switch').props.value).toBe(false);
  });

  it('offline with no cached copy fails safe: disabled, with the offline notice', async () => {
    const gateway = createFakeCommunicationsGateway();
    gateway.failNext('NETWORK');
    const view = await renderSettings(gateway);

    expect(view.getByTestId('reminder-toggle-switch').props.value).toBe(false);
    expect(view.getByText(/Connexion indisponible/)).toBeTruthy();
  });
});

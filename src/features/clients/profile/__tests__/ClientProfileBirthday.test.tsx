import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';

import {
  BIRTHDAY_CONFETTI_DURATION_MS,
  BIRTHDAY_CONFETTI_PARTICLE_COUNT,
} from '@/features/clients/birthday/BirthdayConfetti';
import { reducedMotion } from '@/features/clients/birthday/testing/mock-reanimated';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';

import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { ClientProfileScreen } from '../ClientProfileScreen';

const successHaptic = jest.spyOn(haptics, 'success').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('@expo/ui/community/datetime-picker', () => ({ DateTimePicker: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const LEA = 'client-agenda-lea';

/** Gives Léa a 21 septembre birthday and lets the test leave / re-enter her profile. */
function Harness() {
  const { updateClient, archiveClient } = useClientSession();
  const [profileOpen, setProfileOpen] = useState(true);
  return (
    <>
      {profileOpen && <ClientProfileScreen clientId={LEA} />}
      <Pressable
        testID="give-lea-birthday"
        onPress={() =>
          updateClient({
            id: LEA,
            firstName: 'Léa',
            lastName: 'Martin',
            birthday: { month: 9, day: 21 },
          })
        }
      />
      <Pressable testID="archive-lea" onPress={() => archiveClient(LEA)} />
      <Pressable testID="toggle-profile" onPress={() => setProfileOpen((open) => !open)} />
    </>
  );
}

function renderProfile() {
  return render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <AppointmentSessionProvider>
              <Harness />
            </AppointmentSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

type View = Awaited<ReturnType<typeof renderProfile>>;

async function press(view: View, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

const hidden = { includeHiddenElements: true } as const;

describe('ClientProfileScreen — birthday', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 8, 21, 10, 0));
    reducedMotion.enabled = false;
    successHaptic.mockClear();
  });

  it('shows the reminder card today, adapted to the first name, as one accessible sentence', async () => {
    const view = await renderProfile();
    expect(view.queryByTestId('client-birthday-notice')).toBeNull();

    await press(view, 'give-lea-birthday');

    const notice = view.getByTestId('client-birthday-notice');
    expect(within(notice).getByText('Joyeux anniversaire')).toBeTruthy();
    expect(within(notice).getByText("C'est l'anniversaire de Léa aujourd'hui.")).toBeTruthy();
    expect(
      within(notice).getByText('Vous pouvez lui proposer une réduction sur son rendez-vous.'),
    ).toBeTruthy();
    expect(
      view.getByLabelText("Anniversaire aujourd'hui. Vous pouvez proposer une réduction à Léa."),
    ).toBeTruthy();
    // A reminder, not an action: the profile offers no discount control.
    expect(view.queryByText('Appliquer une réduction')).toBeNull();
  });

  it('shows nothing on another date: no card, no confetti, no haptic', async () => {
    jest.setSystemTime(new Date(2026, 8, 22, 10, 0));
    const view = await renderProfile();
    await press(view, 'give-lea-birthday');

    expect(view.queryByTestId('client-birthday-notice')).toBeNull();
    expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
    expect(successHaptic).not.toHaveBeenCalled();
    // The plain birthday information stays.
    expect(view.getByText('21 septembre')).toBeTruthy();
  });

  it('shows nothing for a Client without a birthday', async () => {
    const view = await renderProfile();

    expect(view.queryByTestId('client-birthday-notice')).toBeNull();
    expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
    expect(successHaptic).not.toHaveBeenCalled();
  });

  it('plays one short burst that stops by itself; the card stays', async () => {
    const view = await renderProfile();
    await press(view, 'give-lea-birthday');

    expect(view.getByTestId('birthday-confetti', hidden)).toBeTruthy();
    expect(BIRTHDAY_CONFETTI_DURATION_MS).toBeGreaterThanOrEqual(1500);
    expect(BIRTHDAY_CONFETTI_DURATION_MS).toBeLessThanOrEqual(2500);

    await act(async () => {
      jest.advanceTimersByTime(BIRTHDAY_CONFETTI_DURATION_MS);
    });

    expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
    expect(view.getByTestId('client-birthday-notice')).toBeTruthy();
  });

  it('celebrates on EVERY entry: leaving the profile and opening it again replays confetti and haptic', async () => {
    const view = await renderProfile();
    await press(view, 'give-lea-birthday');
    expect(view.getByTestId('birthday-confetti', hidden)).toBeTruthy();
    expect(successHaptic).toHaveBeenCalledTimes(1);

    // The first burst ends; the mounted profile stays quiet.
    await act(async () => {
      jest.advanceTimersByTime(BIRTHDAY_CONFETTI_DURATION_MS);
    });
    expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
    expect(successHaptic).toHaveBeenCalledTimes(1);

    // Back to Clientèle (unmount), then her profile again (a new mount).
    await press(view, 'toggle-profile');
    expect(view.queryByTestId('client-birthday-notice')).toBeNull();
    await press(view, 'toggle-profile');

    expect(view.getByTestId('client-birthday-notice')).toBeTruthy();
    expect(view.getByTestId('birthday-confetti', hidden)).toBeTruthy();
    expect(successHaptic).toHaveBeenCalledTimes(2);

    // And a third entry, even in the middle of the second burst.
    await press(view, 'toggle-profile');
    await press(view, 'toggle-profile');
    expect(view.getByTestId('birthday-confetti', hidden)).toBeTruthy();
    expect(successHaptic).toHaveBeenCalledTimes(3);
  });

  it('never replays within one mount: re-renders restart neither the confetti nor the haptic', async () => {
    const view = await renderProfile();
    await press(view, 'give-lea-birthday');
    expect(successHaptic).toHaveBeenCalledTimes(1);

    // Re-renders of the mounted profile: the « ••• » drawer opens, a data refresh
    // (the same birthday written again), the burst ends, another refresh.
    await press(view, 'open-client-actions');
    await press(view, 'give-lea-birthday');
    expect(view.getAllByTestId('birthday-confetti', hidden)).toHaveLength(1);
    await act(async () => {
      jest.advanceTimersByTime(BIRTHDAY_CONFETTI_DURATION_MS);
    });
    await press(view, 'give-lea-birthday');

    expect(successHaptic).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
    expect(view.getByTestId('client-birthday-notice')).toBeTruthy();
  });

  it('respects Reduce Motion on every entry: no confetti, the card is still there', async () => {
    reducedMotion.enabled = true;
    const view = await renderProfile();
    await press(view, 'give-lea-birthday');

    expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
    expect(view.getByTestId('client-birthday-notice')).toBeTruthy();
    expect(view.getByText("C'est l'anniversaire de Léa aujourd'hui.")).toBeTruthy();
    // The single haptic is not motion: it follows the same per-entry lifecycle.
    expect(successHaptic).toHaveBeenCalledTimes(1);

    await press(view, 'toggle-profile');
    await press(view, 'toggle-profile');

    expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
    expect(view.getByTestId('client-birthday-notice')).toBeTruthy();
    expect(successHaptic).toHaveBeenCalledTimes(2);
  });

  it('hides the confetti and every particle from assistive technology and from touches', async () => {
    const view = await renderProfile();
    await press(view, 'give-lea-birthday');

    // Invisible to the default (accessibility-aware) queries…
    expect(view.queryByTestId('birthday-confetti')).toBeNull();
    expect(view.queryAllByTestId('birthday-confetti-particle')).toHaveLength(0);
    // …while really rendered, in a restrained number.
    const confetti = view.getByTestId('birthday-confetti', hidden);
    expect(confetti.props.accessibilityElementsHidden).toBe(true);
    expect(confetti.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(confetti.props.pointerEvents).toBe('none');
    expect(view.getAllByTestId('birthday-confetti-particle', hidden)).toHaveLength(
      BIRTHDAY_CONFETTI_PARTICLE_COUNT,
    );
    expect(BIRTHDAY_CONFETTI_PARTICLE_COUNT).toBeLessThanOrEqual(30);
  });

  it('does not celebrate an archived Client', async () => {
    const view = await renderProfile();
    await press(view, 'archive-lea');
    await press(view, 'give-lea-birthday');

    expect(view.queryByTestId('client-birthday-notice')).toBeNull();
    expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
    expect(successHaptic).not.toHaveBeenCalled();
  });
});

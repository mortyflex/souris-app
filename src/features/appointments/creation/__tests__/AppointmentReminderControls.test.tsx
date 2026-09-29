// Souris — per-appointment reminder controls in Appointment Creation (Lot B)
//
// The real screen against the development fixtures, with the communications
// providers mounted the way (app)/_layout mounts them:
// - GLOBAL preference ON → the Résumé shows « Rappel client », ON by
//   default, and the created Appointment stores the explicit choice;
// - toggle OFF → stored false, and the missing-email warning stays away;
// - Client without a usable email → the lightweight warning with
//   « Ajouter l’e-mail » opening the EXISTING Client editor — and the
//   Appointment stays creatable without any email;
// - GLOBAL preference OFF → no toggle at all, nothing stored (absent =
//   domain default enabled).

import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { AppointmentSessionProvider, useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider, useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { CommunicationPreferencesProvider } from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import {
  createFakeCommunicationsGateway,
  type FakeCommunicationsGateway,
} from '@/features/communications/testing/fake-communications-gateway';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { testBusiness, TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

import { AppointmentCreationScreen } from '../AppointmentCreationScreen';

jest.spyOn(haptics, 'success').mockImplementation();
jest.spyOn(haptics, 'selection').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(View, props);
  const createAnimationBuilder = () => {
    const builder = {
      duration: () => builder,
      easing: () => builder,
    };
    return builder;
  };

  return {
    __esModule: true,
    default: Object.assign(AnimatedView, {
      View: AnimatedView,
      createAnimatedComponent: (component: unknown) => component,
    }),
    useSharedValue: (init: unknown) => {
      let value = init;
      return {
        get: () => value,
        set: (next: unknown) => {
          value = next;
        },
      };
    },
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: () => false,
    useEvent: () => () => undefined,
    withTiming: (value: unknown) => value,
    FadeIn: createAnimationBuilder(),
    FadeOut: createAnimationBuilder(),
    LinearTransition: createAnimationBuilder(),
    Easing: { bezier: () => () => 0 },
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    SymbolView: () => React.createElement(React.Fragment, null),
  };
});

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    DateTimePicker: () => React.createElement(View, null),
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

// A fixed future morning (the fixtures live on "today"; the flow itself is
// date-driven and must never depend on the day the suite runs).
const startAt = new Date(2026, 7, 25, 10, 15);

function Probe() {
  const { appointments } = useAppointmentSession();
  const { updateClient } = useClientSession();
  const newest = appointments[appointments.length - 1]?.appointment;
  return (
    <>
      <Text testID="last-appointment-reminder">
        {newest === undefined
          ? 'none'
          : 'clientReminderEnabled' in newest
            ? String(newest.clientReminderEnabled)
            : 'absent'}
      </Text>
      <Pressable
        testID="give-lea-email"
        onPress={() =>
          updateClient({
            id: 'client-agenda-lea',
            firstName: 'Léa',
            lastName: 'Martin',
            email: 'lea@example.test',
          })
        }
      />
    </>
  );
}

async function renderCreation(gateway: FakeCommunicationsGateway) {
  const view = await render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <ServiceCatalogProvider>
          <AppointmentSessionProvider>
            <CalendarBlockSessionProvider>
              <CommunicationsGatewayProvider gateway={gateway}>
                <CommunicationPreferencesProvider>
                  <AppointmentCreationScreen startAt={startAt} />
                  <Probe />
                </CommunicationPreferencesProvider>
              </CommunicationsGatewayProvider>
            </CalendarBlockSessionProvider>
          </AppointmentSessionProvider>
        </ServiceCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
  // Flush the provider's initial server read.
  await act(async () => {});
  return view;
}

type Rendered = Awaited<ReturnType<typeof renderCreation>>;

const press = (element: unknown) =>
  act(async () => {
    fireEvent.press(element as Parameters<typeof fireEvent.press>[0]);
  });

async function reachSummary(view: Rendered) {
  // Search first: the picker list is virtualized.
  await act(async () => {
    fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'Léa Martin');
  });
  await press(view.getByText('Léa Martin'));
  await press(view.getByText('Continuer'));
  await act(async () => {
    fireEvent.changeText(view.getByPlaceholderText('Rechercher une prestation'), 'brushing 1');
  });
  await press(view.getByRole('button', { name: /^Brushing 1, / }));
  await press(view.getByText('Continuer'));
}

function enabledGateway() {
  const gateway = createFakeCommunicationsGateway();
  gateway.seedPreferences(testBusiness.id, {
    emailRemindersEnabled: true,
    replyToEmail: 'salon@example.test',
  });
  return gateway;
}

describe('with the global preference enabled', () => {
  it('shows « Rappel client » ON by default and stores the explicit choice', async () => {
    const view = await renderCreation(enabledGateway());
    await reachSummary(view);

    const toggle = view.getByTestId('appointment-reminder-toggle-switch');
    expect(toggle.props.value).toBe(true);

    await press(view.getByText('Créer le rendez-vous'));
    expect(view.getByTestId('last-appointment-reminder').props.children).toBe('true');
  });

  it('warns about a missing client email without ever blocking the creation', async () => {
    const view = await renderCreation(enabledGateway());
    await reachSummary(view);

    // Léa Martin has no email in the fixtures.
    expect(view.getByTestId('creation-missing-email-notice')).toBeTruthy();
    expect(view.getByText('Aucune adresse e-mail renseignée')).toBeTruthy();
    expect(view.getByText('Le rappel ne pourra pas être envoyé.')).toBeTruthy();

    await press(view.getByText('Créer le rendez-vous'));
    expect(view.getByTestId('last-appointment-reminder').props.children).toBe('true');
  });

  it('« Ajouter l’e-mail » opens the existing Client editor, and a saved email clears the warning', async () => {
    const view = await renderCreation(enabledGateway());
    await reachSummary(view);

    await press(view.getByTestId('creation-missing-email-notice-add-email'));
    await settleSheetTransition();
    expect(view.getByText('Modifier le client')).toBeTruthy();

    // The same outcome as saving through the sheet: the Client gains an email.
    await press(view.getByTestId('give-lea-email'));
    expect(view.queryByTestId('creation-missing-email-notice')).toBeNull();
  });

  it('toggling OFF hides the warning and stores false', async () => {
    const view = await renderCreation(enabledGateway());
    await reachSummary(view);

    await act(async () => {
      fireEvent(view.getByTestId('appointment-reminder-toggle-switch'), 'valueChange', false);
    });

    expect(view.queryByTestId('creation-missing-email-notice')).toBeNull();
    await press(view.getByText('Créer le rendez-vous'));
    expect(view.getByTestId('last-appointment-reminder').props.children).toBe('false');
  });
});

describe('with the global preference disabled (the default)', () => {
  it('shows no toggle and stores nothing (absent = domain default enabled)', async () => {
    const view = await renderCreation(createFakeCommunicationsGateway());
    await reachSummary(view);

    expect(view.queryByTestId('appointment-reminder-toggle')).toBeNull();
    expect(view.queryByTestId('creation-missing-email-notice')).toBeNull();

    await press(view.getByText('Créer le rendez-vous'));
    expect(view.getByTestId('last-appointment-reminder').props.children).toBe('absent');
  });
});

// BeautIzzy — per-appointment reminder control in « Modifier le rendez-vous »
// (Lot B): visible only while the GLOBAL preference is on, hydrated from the
// stored flag (absent = enabled), saved as an explicit choice only when the
// professional actually changed it.

import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppointmentSessionProvider, useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { CommunicationPreferencesProvider } from '@/features/communications/preferences/CommunicationPreferencesProvider';
import { CommunicationsGatewayProvider } from '@/features/communications/session/CommunicationsGatewayProvider';
import {
  createFakeCommunicationsGateway,
  type FakeCommunicationsGateway,
} from '@/features/communications/testing/fake-communications-gateway';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { testBusiness, TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { AppointmentEditingScreen } from '../AppointmentEditingScreen';

jest.spyOn(haptics, 'success').mockImplementation();
jest.spyOn(haptics, 'selection').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
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

function Probe() {
  const { getAppointmentById } = useAppointmentSession();
  const appointment = getAppointmentById('agenda-sofia')?.appointment;
  return (
    <Text testID="edited-reminder">
      {appointment === undefined
        ? 'missing'
        : 'clientReminderEnabled' in appointment
          ? String(appointment.clientReminderEnabled)
          : 'absent'}
    </Text>
  );
}

async function renderEditor(gateway: FakeCommunicationsGateway) {
  const view = await render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <ServiceCatalogProvider>
          <AppointmentSessionProvider>
            <CalendarBlockSessionProvider>
              <CommunicationsGatewayProvider gateway={gateway}>
                <CommunicationPreferencesProvider>
                  <AppointmentEditingScreen appointmentId="agenda-sofia" />
                  <Probe />
                </CommunicationPreferencesProvider>
              </CommunicationsGatewayProvider>
            </CalendarBlockSessionProvider>
          </AppointmentSessionProvider>
        </ServiceCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return view;
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
  it('hydrates ON from an absent stored flag, warns about the missing email, and saves the explicit OFF', async () => {
    const view = await renderEditor(enabledGateway());

    const toggle = view.getByTestId('appointment-reminder-toggle-switch');
    expect(toggle.props.value).toBe(true);
    // Sofia Petit has no email in the fixtures; the warning never blocks.
    expect(view.getByTestId('editing-missing-email-notice')).toBeTruthy();

    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });
    expect(view.queryByTestId('editing-missing-email-notice')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    expect(view.getByTestId('edited-reminder').props.children).toBe('false');
  });

  it('an untouched toggle keeps the field exactly as stored (absent stays absent)', async () => {
    const view = await renderEditor(enabledGateway());

    // Toggling away and back is not a change.
    const toggle = view.getByTestId('appointment-reminder-toggle-switch');
    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });
    await act(async () => {
      fireEvent(view.getByTestId('appointment-reminder-toggle-switch'), 'valueChange', true);
    });
    expect(
      (view.getByTestId('save-appointment-edit').props as { accessibilityState?: { disabled?: boolean } })
        .accessibilityState?.disabled,
    ).toBe(true);
    expect(view.getByTestId('edited-reminder').props.children).toBe('absent');
  });
});

describe('with the global preference disabled (the default)', () => {
  it('shows no reminder controls at all', async () => {
    const view = await renderEditor(createFakeCommunicationsGateway());

    expect(view.queryByTestId('appointment-reminder-toggle')).toBeNull();
    expect(view.queryByTestId('editing-missing-email-notice')).toBeNull();
  });
});

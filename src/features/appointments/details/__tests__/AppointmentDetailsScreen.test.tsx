import { act, fireEvent, render, userEvent, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { haptics } from '@/shared/lib/haptics';

import { AppointmentDetailsScreen } from '../AppointmentDetailsScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockWarningHaptic = jest.spyOn(haptics, 'warning').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');

  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(NativeView, props);
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
    FadeIn: createAnimationBuilder(),
    FadeOut: createAnimationBuilder(),
    LinearTransition: createAnimationBuilder(),
    Easing: { bezier: () => () => 0 },
    interpolate: (value: number, input: number[], output: number[]) =>
      value <= input[0] ? output[0] : output[output.length - 1],
    useAnimatedStyle: (style: () => object) => style(),
    useReducedMotion: () => false,
    useSharedValue: (init: unknown) => {
      let value = init;
      return {
        get: () => value,
        set: (next: unknown) => {
          value = next;
        },
      };
    },
    withTiming: (value: unknown) => value,
  };
});

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(NativeView, props, children),
  };
});

function AppointmentPresence({ appointmentId }: { readonly appointmentId: string }) {
  const { getAppointmentById } = useAppointmentSession();
  return (
    <Text testID="appointment-presence">
      {getAppointmentById(appointmentId) ? 'present' : 'missing'}
    </Text>
  );
}

describe('AppointmentDetailsScreen', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 7, 29, 8, 0));
    mockPush.mockClear();
    mockBack.mockClear();
    mockWarningHaptic.mockClear();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('moves Modifier from the identity header to the rightmost normal action', async () => {
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    expect(view.getByText('Sofia Petit')).toBeTruthy();
    expect(
      within(view.getByTestId('appointment-identity-header')).queryByTestId(
        'modify-appointment',
      ),
    ).toBeNull();
    expect(
      within(view.getByTestId('appointment-normal-actions'))
        .getAllByRole('button')
        .map(({ props }) => props.testID),
    ).toEqual(['open-cancellation', 'modify-appointment']);
    expect(view.queryByText('Actions')).toBeNull();
    expect(view.queryByText('Actions secondaires')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId('modify-appointment'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/appointments/edit/[appointmentId]',
      params: { appointmentId: 'agenda-sofia' },
    });
  });

  it('offers cancellation for a future appointment and records its actor and reason', async () => {
    const user = userEvent.setup({
      advanceTimers: (delay) => jest.advanceTimersByTime(delay),
    });
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    expect(view.getByTestId('modify-appointment')).toBeTruthy();
    expect(view.getByTestId('open-cancellation')).toBeTruthy();
    expect(view.getByTestId('open-permanent-deletion')).toBeTruthy();
    expect(view.queryByTestId('complete-appointment')).toBeNull();
    expect(view.queryByTestId('open-no-show')).toBeNull();

    await user.press(view.getByTestId('open-cancellation'));

    expect(view.getByText('Annuler ce rendez-vous ?')).toBeTruthy();
    expect(view.getByTestId('confirm-cancellation').props.accessibilityState.disabled).toBe(true);

    await user.press(view.getByTestId('cancellation-actor-client'));
    await user.type(view.getByLabelText('Motif de l’annulation'), 'Empêchement');
    expect(view.getByTestId('confirm-cancellation').props.accessibilityState.disabled).toBe(false);

    await user.press(view.getByTestId('confirm-cancellation'));

    expect(view.getByText('Annulé')).toBeTruthy();
    expect(view.getByText('Annulé par la cliente')).toBeTruthy();
    expect(view.getByText('Empêchement')).toBeTruthy();
    expect(view.queryByTestId('modify-appointment')).toBeNull();
    expect(view.queryByTestId('open-cancellation')).toBeNull();
  });

  it('completes a started same-day appointment without requiring a start action', async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    expect(view.getByTestId('complete-appointment')).toBeTruthy();
    expect(view.getByTestId('open-no-show')).toBeTruthy();
    expect(view.getByTestId('open-cancellation')).toBeTruthy();
    expect(view.queryByText('Démarrer')).toBeNull();
    expect(
      within(view.getByTestId('appointment-normal-actions'))
        .getAllByRole('button')
        .map(({ props }) => props.testID),
    ).toEqual(['open-no-show', 'open-cancellation', 'modify-appointment']);

    await act(async () => {
      fireEvent.press(view.getByTestId('complete-appointment'));
    });

    expect(view.getByText('Terminé')).toBeTruthy();
    expect(view.queryByTestId('complete-appointment')).toBeNull();
    expect(view.queryByTestId('open-no-show')).toBeNull();
    expect(view.queryByTestId('open-cancellation')).toBeNull();
    expect(view.queryByTestId('modify-appointment')).toBeNull();
  });

  it('makes start-time actions available on the next wall-clock minute', async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 13, 59, 30));
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    expect(view.queryByTestId('complete-appointment')).toBeNull();
    expect(view.queryByTestId('open-no-show')).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(view.getByTestId('complete-appointment')).toBeTruthy();
    expect(view.getByTestId('open-no-show')).toBeTruthy();
  });

  it('confirms and preserves a started same-day no-show', async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('open-no-show'));
    });
    expect(view.getByText('Marquer comme absence ?')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-no-show'));
    });

    expect(view.getByText('Absence')).toBeTruthy();
    expect(view.queryByTestId('complete-appointment')).toBeNull();
    expect(view.queryByTestId('open-no-show')).toBeNull();
    expect(view.queryByTestId('open-cancellation')).toBeNull();
  });

  it('lets previous-local-day completion win over a stale cancellation sheet', async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 23, 59, 30));
    const user = userEvent.setup({
      advanceTimers: (delay) => jest.advanceTimersByTime(delay),
    });
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    await user.press(view.getByTestId('open-cancellation'));
    await user.press(view.getByTestId('cancellation-actor-client'));
    jest.setSystemTime(new Date(2026, 7, 30, 0, 0, 1));

    await user.press(view.getByTestId('confirm-cancellation'));

    expect(view.getByText('Terminé')).toBeTruthy();
    expect(view.queryByText('Annulé par la cliente')).toBeNull();
    expect(view.queryByTestId('cancellation-sheet')).toBeNull();
  });

  it('requires a focused confirmation and lets Retour preserve the appointment', async () => {
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
          <AppointmentPresence appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    const deleteAction = view.getByTestId('open-permanent-deletion');
    expect(deleteAction.props.accessibilityRole).toBe('button');
    expect(deleteAction.props.accessibilityState.disabled).toBeUndefined();
    expect(view.queryByText('Actions')).toBeNull();
    expect(view.queryByText('Actions secondaires')).toBeNull();
    expect(view.getByTestId('appointment-presence').props.children).toBe('present');

    await act(async () => {
      fireEvent.press(view.getByTestId('open-permanent-deletion'));
    });

    expect(view.getByText('Supprimer définitivement ce rendez-vous ?')).toBeTruthy();
    expect(view.getByText(/supprimé de l’agenda et de l’historique de la cliente/)).toBeTruthy();
    expect(view.getByTestId('appointment-presence').props.children).toBe('present');
    expect(mockWarningHaptic).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(view.getByTestId('cancel-permanent-deletion'));
    });

    expect(view.queryByTestId('permanent-deletion-dialog')).toBeNull();
    expect(view.getByTestId('appointment-presence').props.children).toBe('present');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('permanently deletes the appointment, triggers warning haptics, and closes Details', async () => {
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
          <AppointmentPresence appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId('open-permanent-deletion'));
    });
    expect(view.getByTestId('appointment-presence').props.children).toBe('present');

    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-permanent-deletion'));
    });

    expect(view.getByTestId('appointment-presence').props.children).toBe('missing');
    expect(view.queryByText('Rendez-vous introuvable')).toBeNull();
    expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('keeps permanent deletion available after cancellation', async () => {
    const user = userEvent.setup({
      advanceTimers: (delay) => jest.advanceTimersByTime(delay),
    });
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
          <AppointmentPresence appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    await user.press(view.getByTestId('open-cancellation'));
    await user.press(view.getByTestId('cancellation-actor-client'));
    await user.press(view.getByTestId('confirm-cancellation'));

    expect(view.getByText('Annulé')).toBeTruthy();
    expect(view.getByTestId('open-permanent-deletion')).toBeTruthy();
    expect(view.queryByTestId('open-cancellation')).toBeNull();
    mockWarningHaptic.mockClear();

    await user.press(view.getByTestId('open-permanent-deletion'));
    await user.press(view.getByTestId('confirm-permanent-deletion'));

    expect(view.getByTestId('appointment-presence').props.children).toBe('missing');
    expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows concise processing phases without redundant wording', async () => {
    const view = await render(
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <AppointmentDetailsScreen appointmentId="agenda-sofia" />
        </AppointmentSessionProvider>
      </ClientSessionProvider>,
    );

    await act(async () => {
      fireEvent.press(view.getByLabelText(/Balayage, commence à/));
    });

    expect(view.getAllByText('Temps de pose').length).toBeGreaterThanOrEqual(1);
    expect(view.queryByText('Professionnelle disponible')).toBeNull();
    expect(view.queryByText('Professionnelle occupée')).toBeNull();
  });
});

import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';

import { AppointmentSessionProvider, useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { haptics } from '@/shared/lib/haptics';

import { AppointmentEditingScreen } from '../AppointmentEditingScreen';

const mockBack = jest.fn();
const mockSuccessHaptic = jest.spyOn(haptics, 'success').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
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
    useAnimatedStyle: (style: () => object) => style(),
    useEvent: () => () => undefined,
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

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));

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

function SessionProbe() {
  const { getAppointmentById, updateAppointment } = useAppointmentSession();
  const entry = getAppointmentById('agenda-sofia');
  const items = entry?.appointment.items ?? [];
  return (
    <>
      <Text testID="session-items">
        {items
          .map(
            (item) =>
              `${item.id}:${item.serviceName}:${item.price}:${item.phases
                .map((phase) => `${phase.id}=${phase.durationMinutes}`)
                .join(',')}`,
          )
          .join('|')}
      </Text>
      <Pressable
        testID="complete-edited-appointment"
        onPress={() => {
          if (!entry) return;
          updateAppointment({
            appointment: { ...entry.appointment, status: 'COMPLETED' },
          });
        }}
      />
    </>
  );
}

function renderEditor() {
  return render(
    <ClientSessionProvider>
      <AppointmentSessionProvider>
        <AppointmentEditingScreen appointmentId="agenda-sofia" />
        <SessionProbe />
      </AppointmentSessionProvider>
    </ClientSessionProvider>,
  );
}

describe('AppointmentEditingScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockSuccessHaptic.mockClear();
  });

  it('initializes from the existing Appointment snapshot and keeps the final service', async () => {
    const view = await renderEditor();

    expect(view.getByText('MODIFIER LE RENDEZ-VOUS')).toBeTruthy();
    expect(view.queryByText('Modifier le rendez-vous')).toBeNull();
    expect(view.getByText('95,00 €')).toBeTruthy();
    expect(view.queryByLabelText('Prix de Balayage')).toBeNull();
    expect(view.getByText('1 h + 55 min de pose')).toBeTruthy();
    expect(view.queryByLabelText('Retirer Balayage')).toBeNull();
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(true);
  });

  it('edits price and processing on the snapshot, then updates the shared session on save', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage'), '90');
    });
    for (let index = 0; index < 3; index += 1) {
      await act(async () => {
        fireEvent.press(view.getByLabelText('Réduire Temps de pose'));
      });
    }

    expect(view.getByTestId('phase-value-sofia-processing').props.children).toBe('40 min');
    expect(view.getByTestId('save-appointment-edit').props.accessibilityState.disabled).toBe(false);
    expect(mockSuccessHaptic).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    expect(view.getByTestId('session-items').props.children).toContain(
      'item-sofia:Balayage:90:sofia-application=30,sofia-processing=40,sofia-finish=30',
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
  });

  it('adds a current catalog service without replacing the existing snapshot', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.changeText(
        view.getByPlaceholderText('Rechercher une prestation'),
        'coupe brushing 1',
      );
    });
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Brushing 1'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });

    const sessionItems = view.getByTestId('session-items').props.children as string;
    expect(sessionItems).toContain('item-sofia:Balayage:95:sofia-application=30,sofia-processing=55,sofia-finish=30');
    expect(sessionItems).toMatch(
      /agenda-sofia-item-new-\d+-\d+:Coupe Brushing 1:40:technique-coupe-coupe-brushing-1-active=50/,
    );
    expect(sessionItems).toContain('agenda-sofia-item-new-');
  });

  it('discards unsaved changes from Annuler without changing session state', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((button) => button.text === 'Abandonner')?.onPress?.();
    });
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage'), '90');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('cancel-appointment-edit'));
    });

    expect(view.getByTestId('session-items').props.children).toContain('item-sofia:Balayage:95:');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Abandonner les modifications ?',
      'Les modifications non enregistrées seront perdues.',
      expect.any(Array),
    );
    alertSpy.mockRestore();
  });

  it('stops editing when the appointment reaches a terminal outcome', async () => {
    const view = await renderEditor();

    await act(async () => {
      fireEvent.press(view.getByTestId('complete-edited-appointment'));
    });

    expect(view.getByText('Modification indisponible')).toBeTruthy();
    expect(view.queryByTestId('save-appointment-edit')).toBeNull();
  });
});

// Souris — Appointment Creation screen integration test
//
// Runs the real screen against the real normalized legacy clients and
// catalog. Proves the key creation behaviors end to end:
// - the Agenda start time is visible from the first step;
// - a client far beyond index 60 in the legacy source is reachable;
// - appointment-specific price/processing overrides reach the summary;
// - the draft survives Summary → Prestations → Summary transitions;
// - a selected service can be removed directly from its draft card;
// - the draft start time is adjustable in ±5 minute steps and drives
//   the summary without changing durations.

import { act, fireEvent, render } from '@testing-library/react-native';

import { normalizedClients } from '@/features/clients/adapters/normalized-clients';
import type { NormalizedClient } from '@/features/clients/adapters/legacy-clients-adapter';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { haptics } from '@/shared/lib/haptics';

import { AppointmentCreationScreen } from '../AppointmentCreationScreen';

const mockBack = jest.fn();
const mockSuccessHaptic = jest.spyOn(haptics, 'success').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
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

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const startAt = new Date(2026, 7, 25, 10, 15);

type Rendered = Awaited<ReturnType<typeof renderCreation>>;

function renderCreation() {
  return render(
    <AppointmentSessionProvider>
      <AppointmentCreationScreen startAt={startAt} />
    </AppointmentSessionProvider>,
  );
}

async function selectClientBeyond60(view: Rendered) {
  const target = normalizedClients.find(
    (client) => client.firstName === 'Claudine' && client.lastName === 'Couillard',
  ) as NormalizedClient | undefined;
  expect(target).toBeDefined();
  expect(normalizedClients.indexOf(target as NormalizedClient)).toBeGreaterThan(60);

  await act(async () => {
    fireEvent.changeText(
      view.getByPlaceholderText('Rechercher une cliente'),
      'Claudine Couillard',
    );
  });
  await act(async () => {
    fireEvent.press(view.getByText('Claudine Couillard'));
  });
  await act(async () => {
    fireEvent.press(view.getByText('Continuer'));
  });
}

async function searchService(view: Rendered, query: string) {
  await act(async () => {
    fireEvent.changeText(view.getByPlaceholderText('Rechercher une prestation'), query);
  });
}

describe('AppointmentCreationScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockSuccessHaptic.mockClear();
  });

  it('creates an appointment with overrides and preserves the draft across step transitions', async () => {
    const view = await renderCreation();

    // The Agenda-selected time is visible on the first screen.
    expect(view.getByText('Mar. 25 août · 10:15')).toBeTruthy();

    await selectClientBeyond60(view);

    // Prestations keeps the selected client and time visible.
    expect(view.getByText('Claudine Couillard')).toBeTruthy();
    expect(view.getByText('Mar. 25 août · 10:15')).toBeTruthy();

    // Select the Balayage 1 TECHNIQUE through the catalog search.
    await searchService(view, 'balayage 1');
    await act(async () => {
      fireEvent.press(view.getByText('Balayage 1'));
    });

    // New selections are compact; open the disclosure before editing.
    expect(view.queryByLabelText('Prix de Balayage 1')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage 1'));
    });

    // Appointment-specific price: 45 → 50.
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage 1'), '50');
    });
    expect(view.getByText('50,00 €')).toBeTruthy();

    // Appointment-specific processing: 60 → 45 (three −5 steps).
    const decreaseProcessing = view.getByLabelText('Réduire Temps de pose');
    for (let index = 0; index < 3; index += 1) {
      await act(async () => {
        fireEvent.press(decreaseProcessing);
      });
    }
    expect(
      view.getByTestId('phase-value-technique-balayage-balayage-1-processing').props.children,
    ).toBe('45 min');

    await act(async () => {
      fireEvent.press(view.getByText('Continuer'));
    });

    // Summary reflects the adjusted snapshot values.
    expect(view.getByText('10:15 – 12:30')).toBeTruthy();
    expect(view.getByText('Temps de pose')).toBeTruthy();
    expect(view.getByText('45 min')).toBeTruthy();
    expect(view.getByText('1 h 30 min')).toBeTruthy();
    expect(view.getByText('2 h 15 min')).toBeTruthy();
    expect(view.getAllByText('50,00 €').length).toBe(2);

    // Modifier returns to Prestations with the draft preserved.
    await act(async () => {
      fireEvent.press(view.getByTestId('edit-services'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage 1'));
    });
    expect(view.getByDisplayValue('50,00')).toBeTruthy();
    expect(
      view.getByTestId('phase-value-technique-balayage-balayage-1-processing').props.children,
    ).toBe('45 min');

    // Returning forward keeps everything.
    await act(async () => {
      fireEvent.press(view.getByText('Continuer'));
    });
    expect(view.getByText('10:15 – 12:30')).toBeTruthy();
    expect(view.getAllByText('50,00 €').length).toBe(2);
  });

  it('removes a selected service directly from its draft card, dropping its overrides', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    // Select Balayage 1 and give it a custom price.
    await searchService(view, 'balayage 1');
    await act(async () => {
      fireEvent.press(view.getByText('Balayage 1'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage 1'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage 1'), '50');
    });

    // With exactly one selected service no drag handle is shown.
    expect(view.queryByLabelText('Déplacer Balayage 1')).toBeNull();

    // Select a second service → drag handles appear.
    await searchService(view, 'coupe brushing 1');
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Brushing 1'));
    });
    expect(view.getByLabelText('Déplacer Balayage 1')).toBeTruthy();
    expect(view.getByLabelText('Déplacer Coupe Brushing 1')).toBeTruthy();

    // Remove the first service directly from its draft card.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Retirer Balayage 1'));
    });

    // Only the second service remains in Sélectionnées (card + catalog row),
    // and its drag handle is hidden again.
    expect(view.queryByText('Balayage 1')).toBeNull();
    expect(view.getAllByText('Coupe Brushing 1').length).toBe(2);
    expect(view.queryByText('50,00 €')).toBeNull();
    expect(view.getAllByText('40,00 €').length).toBe(2);
    expect(view.queryByLabelText('Déplacer Coupe Brushing 1')).toBeNull();

    // Re-selecting the removed service starts from catalog defaults again —
    // the override was removed together with the draft entry.
    await searchService(view, 'balayage 1');
    await act(async () => {
      fireEvent.press(view.getByText('Balayage 1'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage 1'));
    });
    expect(view.getByDisplayValue('45,00')).toBeTruthy();
  });

  it('starts selected cards collapsed and keeps only one editor expanded', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await searchService(view, 'balayage 1');
    await act(async () => {
      fireEvent.press(view.getByText('Balayage 1'));
    });

    expect(view.queryByLabelText('Prix de Balayage 1')).toBeNull();
    expect(view.queryByLabelText('Retirer Balayage 1')).toBeNull();
    expect(view.getByLabelText('Développer Balayage 1')).toBeTruthy();
    expect(view.getByText('1 h 30 min + 1 h de pose')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage 1'));
    });
    expect(view.getByLabelText('Réduire Balayage 1')).toBeTruthy();
    expect(view.getByLabelText('Prix de Balayage 1')).toBeTruthy();
    expect(view.getByLabelText('Réduire Temps de pose')).toBeTruthy();
    expect(view.getByLabelText('Retirer Balayage 1')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduire Temps de pose'));
    });
    expect(
      view.getByTestId('phase-value-technique-balayage-balayage-1-processing').props.children,
    ).toBe('55 min');
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage 1'), '50');
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduire Balayage 1'));
    });
    expect(view.queryByLabelText('Prix de Balayage 1')).toBeNull();
    expect(view.queryByLabelText('Retirer Balayage 1')).toBeNull();
    expect(view.getByText('1 h 30 min + 55 min de pose')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage 1'));
    });
    expect(view.getByDisplayValue('50')).toBeTruthy();
    expect(
      view.getByTestId('phase-value-technique-balayage-balayage-1-processing').props.children,
    ).toBe('55 min');
    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduire Balayage 1'));
    });

    await searchService(view, 'coupe brushing 1');
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Brushing 1'));
    });

    expect(view.getByLabelText('Développer Balayage 1')).toBeTruthy();
    expect(view.getByLabelText('Développer Coupe Brushing 1')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage 1'));
    });
    expect(view.getByLabelText('Réduire Balayage 1')).toBeTruthy();
    expect(view.queryByLabelText('Prix de Coupe Brushing 1')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Coupe Brushing 1'));
    });
    expect(view.queryByLabelText('Réduire Balayage 1')).toBeNull();
    expect(view.getByLabelText('Réduire Coupe Brushing 1')).toBeTruthy();
    expect(view.getByLabelText('Prix de Coupe Brushing 1')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduire Coupe Brushing 1'));
    });
    expect(view.queryByLabelText('Prix de Coupe Brushing 1')).toBeNull();
  });

  it('steps the draft start time and recalculates the summary without changing durations', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    // Select Balayage 1 (TECHNIQUE: 1 h 30 actif + 1 h de pose).
    await searchService(view, 'balayage 1');
    await act(async () => {
      fireEvent.press(view.getByText('Balayage 1'));
    });
    await act(async () => {
      fireEvent.press(view.getByText('Continuer'));
    });

    expect(view.getByText('10:15 – 12:45')).toBeTruthy();
    expect(view.getByText('2 h 30 min')).toBeTruthy();

    // Open the inline time control and step +5 minutes three times: 10:15 → 10:30.
    await act(async () => {
      fireEvent.press(view.getByLabelText("Changer l'horaire"));
    });
    expect(view.getByTestId('time-value').props.children).toBe('10:15');
    for (let index = 0; index < 3; index += 1) {
      await act(async () => {
        fireEvent.press(view.getByLabelText('Avancer de 5 minutes'));
      });
    }
    expect(view.getByTestId('time-value').props.children).toBe('10:30');
    await act(async () => {
      fireEvent.press(view.getByLabelText("Terminer la modification de l'heure"));
    });

    // The Rendez-vous block shows the edited schedule.
    expect(view.getByText('Mardi 25 août')).toBeTruthy();

    // Summary start and end shift together; durations stay unchanged.
    expect(view.getByText('10:30 – 13:00')).toBeTruthy();
    expect(view.getByText('2 h 30 min')).toBeTruthy();
    expect(view.getByText('1 h 30 min')).toBeTruthy();
    expect(view.getByText('1 h')).toBeTruthy();
  });

  it('emits success feedback only after the appointment is created', async () => {
    const view = await renderCreation();

    expect(mockSuccessHaptic).not.toHaveBeenCalled();
    await selectClientBeyond60(view);
    await searchService(view, 'coupe brushing 1');
    await act(async () => {
      fireEvent.press(view.getByText('Coupe Brushing 1'));
    });
    await act(async () => {
      fireEvent.press(view.getByText('Continuer'));
    });

    expect(mockSuccessHaptic).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      view.unmount();
    });
  });
});

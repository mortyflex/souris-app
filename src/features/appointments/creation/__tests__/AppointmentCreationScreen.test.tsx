// Souris — Appointment Creation screen integration test
//
// Runs the real screen against the real normalized legacy clients and
// catalog. Proves the key creation behaviors end to end:
// - the Agenda start time is visible from the first step;
// - a client far beyond index 60 in the legacy source is reachable;
// - the Prestations step is a compact grouped multi-selection grid without
//   a selected-services stack;
// - the Résumé step hosts the ordered stacked accordion editor;
// - price and phase-duration adjustments commit to the catalog only when
//   creation succeeds, and the Appointment snapshot uses the same values;
// - abandoned creations and deselected services never touch the catalog;
// - a client can be created directly from the picker.

import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { Client } from '@/domain/clients';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { ClientSessionProvider, useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { AppointmentSessionProvider, useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { ServiceCatalogProvider, useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
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

const startAt = new Date(2026, 7, 25, 10, 15);

type Rendered = Awaited<ReturnType<typeof renderCreation>>;

function SessionProbe() {
  const { clients } = useClientSession();
  const { appointments } = useAppointmentSession();
  const { getServiceById, setServiceActive } = useServiceCatalog();
  const newest = appointments[appointments.length - 1]?.appointment;
  const createdClient = clients.find((client) => client.firstName === 'Nouvelle');
  const balayage = getServiceById('technique-balayage-balayage-1');
  const brushing = getServiceById('service-brushing-brushing-1');

  return (
    <>
      <Text testID="new-client-id">{createdClient?.id ?? ''}</Text>
      <Text testID="last-appointment-client-id">{newest?.clientId ?? ''}</Text>
      <Text testID="appointments-probe">
        {appointments
          .map(
            ({ appointment }) =>
              `${appointment.id}|${appointment.items
                .map(
                  (item) =>
                    `${item.serviceName}:${item.price}:${item.phases
                      .map((phase) => phase.durationMinutes)
                      .join('/')}`,
                )
                .join(';')}`,
          )
          .join('~')}
      </Text>
      <Text testID="catalog-balayage">
        {balayage
          ? `${balayage.price}:${balayage.phases
              .map((phase) => `${phase.id}=${phase.durationMinutes}`)
              .join(',')}`
          : 'missing'}
      </Text>
      <Text testID="catalog-brushing-1">
        {brushing
          ? `${brushing.price}:${brushing.phases
              .map((phase) => `${phase.id}=${phase.durationMinutes}`)
              .join(',')}`
          : 'missing'}
      </Text>
      <Pressable
        testID="deactivate-balayage"
        onPress={() => setServiceActive('technique-balayage-balayage-1', false)}
      />
      <Pressable
        testID="reactivate-balayage"
        onPress={() => setServiceActive('technique-balayage-balayage-1', true)}
      />
    </>
  );
}

function creationTree(screenKey: number) {
  return (
    <ClientSessionProvider>
      <ServiceCatalogProvider>
        <AppointmentSessionProvider>
          <AppointmentCreationScreen key={screenKey} startAt={startAt} />
          <SessionProbe />
        </AppointmentSessionProvider>
      </ServiceCatalogProvider>
    </ClientSessionProvider>
  );
}

function renderCreation() {
  return render(creationTree(0));
}

async function restartCreation(view: Rendered, screenKey: number) {
  await act(async () => {
    view.rerender(creationTree(screenKey));
  });
}

async function selectClientBeyond60(view: Rendered) {
  const initialClients = createInitialClients();
  const target = initialClients.find(
    (client) => client.firstName === 'Claudine' && client.lastName === 'Couillard',
  ) as Client | undefined;
  expect(target).toBeDefined();
  expect(initialClients.indexOf(target as Client)).toBeGreaterThan(60);

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

async function clearServiceSearch(view: Rendered) {
  await act(async () => {
    fireEvent.changeText(view.getByPlaceholderText('Rechercher une prestation'), '');
  });
}

async function selectService(view: Rendered, name: string) {
  await act(async () => {
    fireEvent.press(view.getByText(name));
  });
}

async function continueToSummary(view: Rendered) {
  await act(async () => {
    fireEvent.press(view.getByText('Continuer'));
  });
}

async function expandService(view: Rendered, name: string) {
  await act(async () => {
    fireEvent.press(view.getByLabelText(`Développer ${name}`));
  });
}

describe('AppointmentCreationScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockSuccessHaptic.mockClear();
  });

  it('presents a compact grouped selection grid without a selected stack', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    expect(view.getByText('Services')).toBeTruthy();
    expect(view.getByText('Techniques')).toBeTruthy();
    expect(view.getByText('0 prestation sélectionnée')).toBeTruthy();

    await selectService(view, 'Balayage 1');
    expect(view.getByText('1 prestation sélectionnée')).toBeTruthy();
    // No sticky selected-stack editor on the selection step.
    expect(view.queryByLabelText('Développer Balayage 1')).toBeNull();
    expect(view.queryByLabelText('Prix de Balayage 1')).toBeNull();
  });

  it('search filters both sections, hides empty ones, and preserves selections', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await selectService(view, 'Brushing 1');
    await searchService(view, 'balayage');

    expect(view.getByText('Balayage 1')).toBeTruthy();
    expect(view.queryByText('Services')).toBeNull();
    expect(view.getByText('Techniques')).toBeTruthy();

    await selectService(view, 'Balayage 1');
    await clearServiceSearch(view);

    // Both selections survive; both sections return.
    expect(view.getByText('2 prestations sélectionnées')).toBeTruthy();
    expect(view.getByText('Services')).toBeTruthy();
    expect(view.getByText('Techniques')).toBeTruthy();
  });

  it('offers only active Services for new additions and reacts immediately', async () => {
    const view = await renderCreation();

    await act(async () => {
      fireEvent.press(view.getByTestId('deactivate-balayage'));
    });
    await selectClientBeyond60(view);
    await searchService(view, 'balayage 1');

    expect(view.queryByText('Balayage 1')).toBeNull();
    expect(view.getByText('Aucune prestation trouvée')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('reactivate-balayage'));
    });

    expect(view.getByText('Balayage 1')).toBeTruthy();
  });

  it('creates an appointment with adjustments and preserves the draft across step transitions', async () => {
    const view = await renderCreation();

    expect(view.getByText('Mar. 25 août · 10:15')).toBeTruthy();
    await selectClientBeyond60(view);

    expect(view.getByText('Claudine Couillard')).toBeTruthy();
    expect(view.getByText('Mar. 25 août · 10:15')).toBeTruthy();

    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);

    // Summary hosts the stacked editor, collapsed by default.
    expect(view.getByText('1 h 30 min + 1 h de pose')).toBeTruthy();
    expect(view.queryByLabelText('Prix de Balayage 1')).toBeNull();
    await expandService(view, 'Balayage 1');

    // Appointment-specific price: 45 → 50.
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage 1'), '50');
    });
    expect(view.getAllByText('50,00 €').length).toBeGreaterThanOrEqual(1);

    // Per-phase durations: active 90 stays, pose 60 → 45.
    expect(view.getByLabelText('Durée de Balayage 1').props.value).toBe('90');
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de Temps de pose'), '45');
    });
    expect(
      view.getByText('Les modifications seront enregistrées pour les prochains rendez-vous.'),
    ).toBeTruthy();

    // Summary reflects the adjusted draft values.
    expect(view.getByText('10:15 – 12:30')).toBeTruthy();
    expect(view.getByText('45 min')).toBeTruthy();
    expect(view.getByText('1 h 30 min')).toBeTruthy();
    expect(view.getByText('2 h 15 min')).toBeTruthy();
    expect(view.getAllByText('50,00 €').length).toBe(2);

    // Modifier les prestations returns to the grid with the draft preserved.
    await act(async () => {
      fireEvent.press(view.getByTestId('edit-services'));
    });
    expect(view.getByText('1 prestation sélectionnée')).toBeTruthy();
    await continueToSummary(view);
    await expandService(view, 'Balayage 1');
    expect(view.getByDisplayValue('50,00')).toBeTruthy();
    expect(view.getByLabelText('Durée de Temps de pose').props.value).toBe('45');

    // Creation commits both the Appointment snapshot and the future default.
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    const catalog = view.getByTestId('catalog-balayage').props.children as string;
    expect(catalog).toBe(
      '50:technique-balayage-balayage-1-active=90,technique-balayage-balayage-1-processing=45',
    );
    const appointments = view.getByTestId('appointments-probe').props.children as string;
    expect(appointments).toContain('Balayage 1:50:90/45');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('keeps only one Summary editor expanded and values survive collapse', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await searchService(view, 'coupe brushing 1');
    await selectService(view, 'Coupe Brushing 1');
    await continueToSummary(view);

    // Both collapsed; drag handles visible for the ordered stack.
    expect(view.queryByLabelText('Prix de Balayage 1')).toBeNull();
    expect(view.getByLabelText('Développer Balayage 1')).toBeTruthy();
    expect(view.getByLabelText('Développer Coupe Brushing 1')).toBeTruthy();
    expect(view.getByLabelText('Déplacer Balayage 1')).toBeTruthy();
    expect(view.getByLabelText('Déplacer Coupe Brushing 1')).toBeTruthy();

    await expandService(view, 'Balayage 1');
    expect(view.getByLabelText('Prix de Balayage 1')).toBeTruthy();
    expect(view.getByLabelText('Durée de Balayage 1')).toBeTruthy();
    expect(view.getByLabelText('Durée de Temps de pose')).toBeTruthy();

    // Expanding another card collapses the previous one.
    await expandService(view, 'Coupe Brushing 1');
    expect(view.queryByLabelText('Prix de Balayage 1')).toBeNull();
    expect(view.getByLabelText('Prix de Coupe Brushing 1')).toBeTruthy();
    // A SERVICE exposes one simple Durée field.
    expect(view.getByLabelText('Durée de Coupe Brushing 1')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduire Coupe Brushing 1'));
    });
    expect(view.queryByLabelText('Prix de Coupe Brushing 1')).toBeNull();
  });

  it('deselecting a modified service drops its draft and never commits it', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);
    await expandService(view, 'Balayage 1');
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage 1'), '110');
    });

    // Back to selection and deselect the modified service.
    await act(async () => {
      fireEvent.press(view.getByTestId('edit-services'));
    });
    await selectService(view, 'Balayage 1');
    expect(view.getByText('0 prestation sélectionnée')).toBeTruthy();

    await searchService(view, 'coupe brushing 1');
    await selectService(view, 'Coupe Brushing 1');
    await continueToSummary(view);
    expect(view.queryByText('Balayage 1')).toBeNull();
    expect(view.getByText('Coupe Brushing 1')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    // Balayage catalog untouched; appointment contains only Coupe Brushing 1.
    const catalog = view.getByTestId('catalog-balayage').props.children as string;
    expect(catalog).toContain('45:');
    const appointments = view.getByTestId('appointments-probe').props.children as string;
    expect(appointments).toContain('Coupe Brushing 1:40:50');
    expect(appointments).not.toContain('Balayage 1:110');
  });

  it('appends new selections to the end of the appointment order', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await searchService(view, 'brushing 1');
    await selectService(view, 'Brushing 1');
    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);

    expect(
      view
        .getAllByLabelText(/^Déplacer /)
        .map((element) => element.props.accessibilityLabel),
    ).toEqual(['Déplacer Brushing 1', 'Déplacer Balayage 1']);

    // Return, add a third service, and the order appends it.
    await act(async () => {
      fireEvent.press(view.getByTestId('edit-services'));
    });
    await searchService(view, 'chignon');
    await selectService(view, 'Chignon');
    await continueToSummary(view);

    expect(
      view
        .getAllByLabelText(/^Déplacer /)
        .map((element) => element.props.accessibilityLabel),
    ).toEqual(['Déplacer Brushing 1', 'Déplacer Balayage 1', 'Déplacer Chignon']);
  });

  it('simple service price and duration become catalog defaults only on success', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await searchService(view, 'brushing 1');
    await selectService(view, 'Brushing 1');
    await continueToSummary(view);
    await expandService(view, 'Brushing 1');

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Brushing 1'), '25');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de Brushing 1'), '35');
    });

    // Before creation the catalog keeps its current defaults.
    expect(view.getByTestId('catalog-brushing-1').props.children).toContain('20:');

    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    expect(view.getByTestId('catalog-brushing-1').props.children).toContain(
      '25:service-brushing-brushing-1-phase=35',
    );
    const appointments = view.getByTestId('appointments-probe').props.children as string;
    expect(appointments).toContain('Brushing 1:25:35');
  });

  it('abandoning creation leaves the catalog unchanged', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);
    await expandService(view, 'Balayage 1');
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage 1'), '110');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de Temps de pose'), '55');
    });

    await act(async () => {
      fireEvent.press(view.getByLabelText('Annuler la création'));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    const catalog = view.getByTestId('catalog-balayage').props.children as string;
    expect(catalog).toBe(
      '45:technique-balayage-balayage-1-active=90,technique-balayage-balayage-1-processing=60',
    );
  });

  it('keeps earlier Appointment snapshots unchanged when defaults are updated', async () => {
    const view = await renderCreation();

    // First appointment uses catalog defaults (45 / 90 + 60).
    await selectClientBeyond60(view);
    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    // Second appointment adjusts the defaults: 110 / 35 + 55.
    await restartCreation(view, 1);
    await selectClientBeyond60(view);
    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);
    await expandService(view, 'Balayage 1');
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage 1'), '110');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de Balayage 1'), '35');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Durée de Temps de pose'), '55');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    // Catalog default and newest appointment use the new values…
    const catalog = view.getByTestId('catalog-balayage').props.children as string;
    expect(catalog).toBe(
      '110:technique-balayage-balayage-1-active=35,technique-balayage-balayage-1-processing=55',
    );
    // …while the earlier Appointment keeps its booked snapshot.
    const appointments = view.getByTestId('appointments-probe').props.children as string;
    expect(appointments).toContain('Balayage 1:45:90/60');
    expect(appointments).toContain('Balayage 1:110:35/55');

    // A third creation starts from the new defaults.
    await restartCreation(view, 2);
    await selectClientBeyond60(view);
    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);
    await expandService(view, 'Balayage 1');
    expect(view.getByDisplayValue('110,00')).toBeTruthy();
    expect(view.getByLabelText('Durée de Balayage 1').props.value).toBe('35');
    expect(view.getByLabelText('Durée de Temps de pose').props.value).toBe('55');
  });

  it('steps the draft start time and recalculates the summary without changing durations', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);

    expect(view.getByText('10:15 – 12:45')).toBeTruthy();
    expect(view.getByText('2 h 30 min')).toBeTruthy();

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

    expect(view.getByText('Mardi 25 août')).toBeTruthy();

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
    await selectService(view, 'Coupe Brushing 1');
    await continueToSummary(view);

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

  it('adds a client directly from the picker, selects it, and stores its exact id', async () => {
    const view = await renderCreation();

    expect(view.getByTestId('new-client-id').props.children).toBe('');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-client-picker'));
    });
    expect(view.getByLabelText('Prénom')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prénom'), 'Nouvelle');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom'), 'Cliente');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Ajouter la cliente'));
    });

    const createdClientId = view.getByTestId('new-client-id').props.children as string;
    expect(createdClientId.length).toBeGreaterThan(0);

    expect(view.getByText('Nouvelle Cliente')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByText('Continuer'));
    });
    expect(view.getByText('Nouvelle Cliente')).toBeTruthy();

    await searchService(view, 'coupe brushing 1');
    await selectService(view, 'Coupe Brushing 1');
    await continueToSummary(view);
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    expect(view.getByTestId('last-appointment-client-id').props.children).toBe(createdClientId);
    await act(async () => {
      view.unmount();
    });
  });
});

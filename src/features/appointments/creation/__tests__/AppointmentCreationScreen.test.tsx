// Souris — Appointment Creation screen integration test
//
// Runs the real screen against the real normalized legacy clients and
// catalog. Proves the key creation behaviors end to end:
// - the Agenda start time is visible from the first step;
// - a client far beyond index 60 in the legacy source is reachable;
// - the Prestations step is a compact grouped multi-selection grid without
//   a selected-services stack;
// - the Résumé step hosts the ordered stacked accordion editor;
// - price and phase-duration adjustments (5-minute stepper, zero allowed)
//   reach the Appointment snapshot ONLY — the Service catalog is never
//   written by creation, whether it succeeds, is abandoned, or a modified
//   service is deselected;
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
import { loadAppointments } from '@/persistence/stores/appointments';
import { loadServices } from '@/persistence/stores/services';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

const mockBack = jest.fn();
const mockSuccessHaptic = jest.spyOn(haptics, 'success').mockImplementation();
const mockSelectionHaptic = jest.spyOn(haptics, 'selection').mockImplementation();

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
  const { clients, archiveClient } = useClientSession();
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
      <Pressable testID="archive-lea" onPress={() => archiveClient('client-agenda-lea')} />
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

type TestDatabase = ReturnType<typeof openTestDatabase>;

function creationTree(screenKey: number, database?: TestDatabase) {
  return (
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
      <ServiceCatalogProvider>
        <AppointmentSessionProvider>
          <AppointmentCreationScreen key={screenKey} startAt={startAt} />
          <SessionProbe />
        </AppointmentSessionProvider>
      </ServiceCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>
  );
}

function renderCreation(database?: TestDatabase) {
  return render(creationTree(0, database));
}

async function restartCreation(view: Rendered, screenKey: number, database?: TestDatabase) {
  await act(async () => {
    view.rerender(creationTree(screenKey, database));
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

const BALAYAGE_ACTIVE = 'technique-balayage-balayage-1-active';
const BALAYAGE_POSE = 'technique-balayage-balayage-1-processing';
const BRUSHING_PHASE = 'service-brushing-brushing-1-phase';

/** Taps the shared ±5 stepper `times` times (negative = decrement). */
async function stepPhase(view: Rendered, phaseId: string, times: number) {
  const action = times < 0 ? 'decrement' : 'increment';
  for (let index = 0; index < Math.abs(times); index += 1) {
    await act(async () => {
      fireEvent.press(view.getByTestId(`phase-duration-${phaseId}-${action}`));
    });
  }
}

function phaseValue(view: Rendered, phaseId: string): string {
  return view.getByTestId(`phase-duration-${phaseId}-value`).props.children as string;
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
    mockSelectionHaptic.mockClear();
  });

  it('gives exactly one selection haptic when the time control is opened', async () => {
    const view = await renderCreation();

    await act(async () => {
      fireEvent.press(view.getByTestId('time-modifier'));
    });

    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('time-value').props.children).toBe('10:15');
    await act(async () => {
      fireEvent.press(view.getByLabelText('Avancer de 5 minutes'));
    });
    expect(view.getByTestId('time-value').props.children).toBe('10:20');
    // Stepping the time itself adds no further haptic noise.
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
  });

  it('opens in the canonical Souris sheet shell with a scrollable Client list and no auto-focus', async () => {
    const view = await renderCreation();

    expect(view.getByTestId('appointment-creation-sheet')).toBeTruthy();
    expect(view.getByText('NOUVEAU RENDEZ-VOUS')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Cliente' })).toBeTruthy();
    expect(view.getByLabelText('Annuler la création')).toBeTruthy();
    expect(view.getByTestId('appointment-creation-actions')).toBeTruthy();
    expect(view.getByText('Continuer')).toBeTruthy();

    const search = view.getByPlaceholderText('Rechercher une cliente');
    expect(search.props.autoFocus).toBeFalsy();
    // The Client list is a real vertical list the professional scrolls through;
    // scrolling it never closes the creation sheet.
    const list = view.getByTestId('client-picker-list');
    expect(list.props.data.length).toBeGreaterThan(60);
    await act(async () => {
      fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 1200 } } });
    });
    expect(view.getByTestId('appointment-creation-sheet')).toBeTruthy();
    expect(view.getByText('NOUVEAU RENDEZ-VOUS')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
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

    // Per-phase durations through the shared ±5 stepper (no keyboard):
    // active 90 stays, pose 60 → 45.
    expect(view.queryByLabelText('Durée de Temps de pose')).toBeNull();
    expect(phaseValue(view, BALAYAGE_ACTIVE)).toBe('90 min');
    await stepPhase(view, BALAYAGE_POSE, -3);
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('45 min');
    expect(view.queryByText(/prochains rendez-vous/)).toBeNull();

    // Summary reflects the adjusted draft values.
    expect(view.getByText('10:15 – 12:30')).toBeTruthy();
    // Stepper value + Temps de pose summary row.
    expect(view.getAllByText('45 min')).toHaveLength(2);
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
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('45 min');

    // Creation writes the Appointment snapshot only; the catalog keeps 45 / 90 + 60.
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    const catalog = view.getByTestId('catalog-balayage').props.children as string;
    expect(catalog).toBe(
      '45:technique-balayage-balayage-1-active=90,technique-balayage-balayage-1-processing=60',
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
    expect(view.getByTestId(`phase-duration-${BALAYAGE_ACTIVE}`)).toBeTruthy();
    expect(view.getByTestId(`phase-duration-${BALAYAGE_POSE}`)).toBeTruthy();

    // Expanding another card collapses the previous one.
    await expandService(view, 'Coupe Brushing 1');
    expect(view.queryByLabelText('Prix de Balayage 1')).toBeNull();
    expect(view.getByLabelText('Prix de Coupe Brushing 1')).toBeTruthy();
    // A SERVICE exposes one simple Durée stepper.
    expect(view.getByText('Durée')).toBeTruthy();
    expect(view.getByLabelText('Réduire la durée de Coupe Brushing 1 de 5 minutes')).toBeTruthy();

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

  it('keeps a simple service price and duration on the snapshot; the catalog stays at its defaults', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await searchService(view, 'brushing 1');
    await selectService(view, 'Brushing 1');
    await continueToSummary(view);
    await expandService(view, 'Brushing 1');

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Brushing 1'), '25');
    });
    await stepPhase(view, BRUSHING_PHASE, 1);

    const catalogBefore = view.getByTestId('catalog-brushing-1').props.children as string;
    expect(catalogBefore).toBe('20:service-brushing-brushing-1-phase=30');

    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    expect(view.getByTestId('catalog-brushing-1').props.children).toBe(catalogBefore);
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
    await stepPhase(view, BALAYAGE_POSE, -1);

    await act(async () => {
      fireEvent.press(view.getByLabelText('Annuler la création'));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    const catalog = view.getByTestId('catalog-balayage').props.children as string;
    expect(catalog).toBe(
      '45:technique-balayage-balayage-1-active=90,technique-balayage-balayage-1-processing=60',
    );
  });

  it('never writes the catalog: a zero pose stays on Appointment A and Appointment B starts from 40 again', async () => {
    const db = openTestDatabase();
    const view = await renderCreation(db);
    const servicesBefore = loadServices(db);

    // Appointment A: Balayage 1 initializes from the catalog (90 / 60), pose → 0.
    await selectClientBeyond60(view);
    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);
    await expandService(view, 'Balayage 1');
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('60 min');
    await stepPhase(view, BALAYAGE_POSE, -13);
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('0 min');
    // 90 min of active work, no pose: the end moves from 12:45 to 11:45.
    expect(view.getByText('10:15 – 11:45')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    // Appointment A carries 0; the catalog (memory AND SQLite) is untouched.
    let appointments = view.getByTestId('appointments-probe').props.children as string;
    expect(appointments).toContain('Balayage 1:45:90/0');
    expect(view.getByTestId('catalog-balayage').props.children).toBe(
      '45:technique-balayage-balayage-1-active=90,technique-balayage-balayage-1-processing=60',
    );
    expect(loadServices(db)).toEqual(servicesBefore);
    const storedA = loadAppointments(db).at(-1);
    expect(storedA?.items[0]?.phases.map((phase) => phase.durationMinutes)).toEqual([90, 0]);
    expect(storedA?.items[0]?.phases).toHaveLength(2);

    // Appointment B starts from the catalog default again: 60, not 0.
    await restartCreation(view, 1, db);
    await selectClientBeyond60(view);
    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);
    await expandService(view, 'Balayage 1');
    expect(view.getByDisplayValue('45,00')).toBeTruthy();
    expect(phaseValue(view, BALAYAGE_ACTIVE)).toBe('90 min');
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('60 min');
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    appointments = view.getByTestId('appointments-probe').props.children as string;
    expect(appointments).toContain('Balayage 1:45:90/0');
    expect(appointments).toContain('Balayage 1:45:90/60');
    expect(loadServices(db)).toEqual(servicesBefore);
  });

  it('steps creation timing 10 → 5 → 0 → 0, then back up, and keeps the zero phase', async () => {
    const db = openTestDatabase();
    const view = await renderCreation(db);
    await selectClientBeyond60(view);
    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);
    await expandService(view, 'Balayage 1');

    // 60 → 10 first, then the canonical 10 → 5 → 0 → 0 sequence.
    await stepPhase(view, BALAYAGE_POSE, -10);
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('10 min');
    await stepPhase(view, BALAYAGE_POSE, -1);
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('5 min');
    await stepPhase(view, BALAYAGE_POSE, -1);
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('0 min');
    expect(
      view.getByLabelText('Réduire le temps de pose de 5 minutes').props.accessibilityState.disabled,
    ).toBe(true);
    await stepPhase(view, BALAYAGE_POSE, -1);
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('0 min');
    await stepPhase(view, BALAYAGE_POSE, 2);
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('10 min');
    await stepPhase(view, BALAYAGE_POSE, -2);
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('0 min');

    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    // Persisted as zero, phase kept, catalog pose still 60.
    const stored = loadAppointments(db).at(-1);
    expect(stored?.items[0]?.phases[1]).toEqual({
      id: BALAYAGE_POSE,
      name: 'Temps de pose',
      durationMinutes: 0,
      requiresStaff: false,
    });
    expect(
      loadServices(db)
        .find((service) => service.id === 'technique-balayage-balayage-1')
        ?.phases.map((phase) => phase.durationMinutes),
    ).toEqual([90, 60]);
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
    await settleSheetTransition();

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

  it('never offers an archived Client in the Cliente step', async () => {
    const view = await renderCreation();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'léa martin');
    });
    expect(view.getByText('Léa Martin')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });

    expect(view.queryByText('Léa Martin')).toBeNull();
    expect(view.getByText('Aucune cliente trouvée')).toBeTruthy();
  });
});

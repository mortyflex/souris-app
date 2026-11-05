// BeautIzzy — Appointment Creation screen integration test
//
// Runs the real screen against the normalized synthetic address book and the
// catalog. Proves the key creation behaviors end to end:
// - the Agenda start time is visible from the first step;
// - a client far beyond index 60 in the client source is reachable;
// - the Prestations step is a compact grouped multi-selection grid without
//   a selected-services stack;
// - the Résumé step hosts the ordered stacked accordion editor;
// - price and phase-duration adjustments (5-minute stepper, zero allowed)
//   reach the Appointment snapshot ONLY — the Service catalog is never
//   written by creation, whether it succeeds, is abandoned, or a modified
//   service is deselected;
// - a client can be created directly from the picker.

import { formatEuros } from '@/shared/lib/money';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import type { Appointment, AppointmentItem, AppointmentStatus } from '@/domain/appointments';
import type { Client } from '@/domain/clients';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { ClientSessionProvider, useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { AppointmentSessionProvider, useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ServiceCatalogProvider, useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';
import { haptics } from '@/shared/lib/haptics';
import { caution, serviceCategoryColors } from '@/shared/ui/theme';

import { AppointmentCreationScreen } from '../AppointmentCreationScreen';
import * as depositStore from '@/persistence/stores/appointment-deposits';
import { loadAppointmentDeposits } from '@/persistence/stores/appointment-deposits';
import { loadAppointments } from '@/persistence/stores/appointments';
import { PERSISTENCE_FAILURE_TITLE } from '@/providers/persistence-failure';
import { loadServices } from '@/persistence/stores/services';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { usePersistence } from '@/providers/PersistenceProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';
import { settleWheelOn, wheelRowKeys, wheelValue } from '@/shared/ui/testing/wheels';

const mockBack = jest.fn();
let mockReducedMotion = false;
const mockSuccessHaptic = jest.spyOn(haptics, 'success').mockImplementation();
const mockSelectionHaptic = jest.spyOn(haptics, 'selection').mockImplementation();
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation();

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
    useReducedMotion: () => mockReducedMotion,
    useEvent: () => () => undefined,
    withTiming: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
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

const sofiaItem: AppointmentItem = {
  id: 'sofia-item',
  serviceId: 'service-cut',
  order: 0,
  serviceName: 'Coupe',
  serviceType: 'SERVICE',
  price: 42,
  phases: [{ id: 'sofia-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
};

const CONSTANCE_ID = createInitialClients().find(
  (client) => client.firstName === 'Constance' && client.lastName === 'Chevalier',
)?.id as string;

/** One past Appointment (July 2026) of Sofia — or of the given Client. */
function sofiaAppointment(
  id: string,
  day: number,
  status: AppointmentStatus,
  cancelledBy?: 'CLIENT' | 'BUSINESS',
  clientId = 'client-agenda-sofia',
): Appointment {
  const at = new Date(2026, 6, day, 10);
  return {
    id,
    businessId: 'fixture-business',
    clientId,
    staffMemberId: 'staff-amelie',
    startAt: at,
    status,
    items: [{ ...sofiaItem, id: `${id}-item` }],
    ...(status === 'NO_SHOW' ? { noShow: { recordedAt: at } } : {}),
    ...(status === 'CANCELLED'
      ? { cancellation: { cancelledAt: at, cancelledBy: cancelledBy ?? 'CLIENT' } }
      : {}),
  };
}

type Rendered = Awaited<ReturnType<typeof renderCreation>>;

function SessionProbe() {
  const { clients, archiveClient, updateClient } = useClientSession();
  const { appointments, addAppointment, deposits } = useAppointmentSession();
  const { getServiceById, setServiceActive } = useServiceCatalog();
  const newest = appointments[appointments.length - 1]?.appointment;
  const createdClient = clients.find((client) => client.firstName === 'Nouvelle');
  const balayage = getServiceById('technique-balayage-balayage-1');
  const brushing = getServiceById('service-brushing-brushing-1');

  return (
    <>
      <Text testID="new-client-id">{createdClient?.id ?? ''}</Text>
      <Text testID="last-appointment-client-id">{newest?.clientId ?? ''}</Text>
      <Text testID="last-appointment-discount">{JSON.stringify(newest?.discount ?? null)}</Text>
      <Text testID="last-appointment-id">{newest?.id ?? ''}</Text>
      <Text testID="deposits-probe">
        {deposits
          .map(
            (deposit) =>
              `${deposit.appointmentId}|${deposit.amountCents}|${deposit.paymentMethod}|${deposit.status}|${deposit.businessId}`,
          )
          .join('~')}
      </Text>
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
      <Pressable testID="archive-sofia" onPress={() => archiveClient('client-agenda-sofia')} />
      {/* Sofia's history, added in whatever order a test needs: dates decide, not insertion. */}
      <Pressable
        testID="sofia-no-show-1"
        onPress={() => addAppointment({ appointment: sofiaAppointment('sofia-ns-1', 10, 'NO_SHOW') })}
      />
      <Pressable
        testID="constance-no-show-1"
        onPress={() =>
          addAppointment({
            appointment: sofiaAppointment('constance-ns-1', 10, 'NO_SHOW', undefined, CONSTANCE_ID),
          })
        }
      />
      <Pressable
        testID="sofia-no-show-2"
        onPress={() => addAppointment({ appointment: sofiaAppointment('sofia-ns-2', 11, 'NO_SHOW') })}
      />
      <Pressable
        testID="sofia-no-show-3"
        onPress={() => addAppointment({ appointment: sofiaAppointment('sofia-ns-3', 12, 'NO_SHOW') })}
      />
      <Pressable
        testID="sofia-no-shows-4-5"
        onPress={() => {
          addAppointment({ appointment: sofiaAppointment('sofia-ns-4', 13, 'NO_SHOW') });
          addAppointment({ appointment: sofiaAppointment('sofia-ns-5', 14, 'NO_SHOW') });
        }}
      />
      <Pressable
        testID="sofia-no-show-6"
        onPress={() => addAppointment({ appointment: sofiaAppointment('sofia-ns-6', 15, 'NO_SHOW') })}
      />
      <Pressable
        testID="sofia-attended-after"
        onPress={() => addAppointment({ appointment: sofiaAppointment('sofia-came', 20, 'COMPLETED') })}
      />
      <Pressable
        testID="sofia-attended-before"
        onPress={() => addAppointment({ appointment: sofiaAppointment('sofia-came-early', 2, 'COMPLETED') })}
      />
      <Pressable
        testID="sofia-unresolved-after"
        onPress={() => addAppointment({ appointment: sofiaAppointment('sofia-open', 22, 'SCHEDULED') })}
      />
      <Pressable
        testID="sofia-cancelled-after"
        onPress={() => {
          addAppointment({ appointment: sofiaAppointment('sofia-cancelled', 23, 'CANCELLED', 'CLIENT') });
          addAppointment({
            appointment: sofiaAppointment('sofia-business-cancelled', 24, 'CANCELLED', 'BUSINESS'),
          });
        }}
      />
      <Pressable
        testID="sofia-future"
        onPress={() =>
          addAppointment({
            appointment: {
              ...sofiaAppointment('sofia-future', 1, 'SCHEDULED'),
              startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            },
          })
        }
      />
      <Pressable
        testID="give-lea-birthday"
        onPress={() =>
          updateClient({
            id: 'client-agenda-lea',
            firstName: 'Léa',
            lastName: 'Martin',
            // The day of `startAt` (25 août), never the day the suite runs.
            birthday: { month: 8, day: 25 },
          })
        }
      />
      <Pressable
        testID="give-sofia-birthday"
        onPress={() =>
          updateClient({
            id: 'client-agenda-sofia',
            firstName: 'Sofia',
            lastName: 'Petit',
            birthday: { month: 8, day: 25 },
          })
        }
      />
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

/**
 * What the cloud sync runner does after a pull that applied other devices'
 * changes: rows already in SQLite, then `reloadSnapshot()` IN PLACE (the
 * runner → reloadSnapshot link is covered by CloudSyncRunner.test.tsx).
 */
function RemoteChangeProbe() {
  const { database, reloadSnapshot } = usePersistence();
  return (
    <Pressable
      testID="apply-remote-change"
      onPress={() => {
        database.runSync("UPDATE services SET price_cents = 6000 WHERE id = 'technique-balayage-balayage-1'");
        database.runSync("UPDATE clients SET notes = 'Notée ailleurs' WHERE first_name = 'Constance' AND last_name = 'Chevalier'");
        reloadSnapshot();
      }}
    />
  );
}

function creationTree(
  screenKey: number,
  database?: TestDatabase,
  appointmentStartAt: Date = startAt,
  initialClientId?: string,
) {
  return (
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
      <ServiceCatalogProvider>
        <AppointmentSessionProvider>
          <CalendarBlockSessionProvider>
            <AppointmentCreationScreen
              initialClientId={initialClientId}
              key={screenKey}
              startAt={appointmentStartAt}
            />
            <SessionProbe />
            <RemoteChangeProbe />
          </CalendarBlockSessionProvider>
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
    (client) => client.firstName === 'Constance' && client.lastName === 'Chevalier',
  ) as Client | undefined;
  expect(target).toBeDefined();
  expect(initialClients.indexOf(target as Client)).toBeGreaterThan(60);

  await act(async () => {
    fireEvent.changeText(
      view.getByPlaceholderText('Rechercher un client'),
      'Constance Chevalier',
    );
  });
  await act(async () => {
    fireEvent.press(view.getByText('Constance Chevalier'));
  });
  await act(async () => {
    fireEvent.press(view.getByText('Continuer'));
  });
}

/** Taps a Client row of the Client step — the selection event itself, no « Continuer ». */
async function tapClient(view: Rendered, fullName: string) {
  await act(async () => {
    fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), fullName);
  });
  // The ROW: once chosen, the name is also written in the context row.
  await act(async () => {
    fireEvent.press(view.getByRole('button', { name: new RegExp(fullName) }));
  });
}

async function selectClientByName(view: Rendered, fullName: string) {
  await act(async () => {
    fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), fullName);
  });
  await act(async () => {
    fireEvent.press(view.getByText(fullName));
  });
  await act(async () => {
    fireEvent.press(view.getByText('Continuer'));
  });
}

/** Léa (birthday 25 août) + Brushing 1 (20 €), up to the Résumé. */
async function reachBirthdaySummary(view: Rendered) {
  await act(async () => {
    fireEvent.press(view.getByTestId('give-lea-birthday'));
  });
  await selectClientByName(view, 'Léa Martin');
  await searchService(view, 'brushing 1');
  await selectService(view, 'Brushing 1');
  await continueToSummary(view);
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

// Presses the catalog CARD (labelled « name, duration, price, category »): a
// selected name is also written in the footer reminder. The catalogue shows
// ONE category at a time, so the helper first opens the segment holding it.
async function selectService(view: Rendered, name: string) {
  const card = { name: new RegExp(`^${name}, `) };
  for (const tab of ['catalog-category-SERVICE', 'catalog-category-TECHNIQUE']) {
    if (view.queryByRole('button', card)) break;
    await act(async () => {
      fireEvent.press(view.getByTestId(tab));
    });
  }
  await act(async () => {
    fireEvent.press(view.getByRole('button', card));
  });
}

/** [−] inside a selected card: one occurrence less. */
async function decrementService(view: Rendered, name: string) {
  const label = `Retirer une fois ${name}`;
  for (const tab of ['catalog-category-SERVICE', 'catalog-category-TECHNIQUE']) {
    if (view.queryByLabelText(label)) break;
    await act(async () => {
      fireEvent.press(view.getByTestId(tab));
    });
  }
  await act(async () => {
    fireEvent.press(view.getByLabelText(label));
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
    // The wheels open on the draft start time, 24-hour, no AM/PM.
    expect(wheelValue(view, 'start-time-wheel-hour')).toBe('10 heures');
    expect(wheelValue(view, 'start-time-wheel-minute')).toBe('15 minutes');

    // One restrained haptic per value the wheel actually snaps to…
    await settleWheelOn(view, 'start-time-wheel-minute', '20');
    expect(wheelValue(view, 'start-time-wheel-minute')).toBe('20 minutes');
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(2);
    // …and none when it settles back on the same row.
    await settleWheelOn(view, 'start-time-wheel-minute', '20');
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(2);
  });

  it('chooses the start time on two independent 24-hour wheels within the operational day', async () => {
    const view = await renderCreation();
    await act(async () => {
      fireEvent.press(view.getByTestId('time-modifier'));
    });

    // Hours of the operational day, minutes on the 5-minute grid.
    expect(wheelRowKeys(view, 'start-time-wheel-hour')).toEqual(
      Array.from({ length: 16 }, (_, index) => String(8 + index)),
    );
    expect(wheelRowKeys(view, 'start-time-wheel-minute')).toEqual(
      Array.from({ length: 12 }, (_, index) => String(index * 5)),
    );

    // 19:00 is two flicks; one wheel never moves the other.
    await settleWheelOn(view, 'start-time-wheel-hour', '19');
    expect(wheelValue(view, 'start-time-wheel-hour')).toBe('19 heures');
    expect(wheelValue(view, 'start-time-wheel-minute')).toBe('15 minutes');
    await settleWheelOn(view, 'start-time-wheel-minute', '00');
    expect(wheelValue(view, 'start-time-wheel-hour')).toBe('19 heures');
    expect(wheelValue(view, 'start-time-wheel-minute')).toBe('0 minutes');

    // The last start of the day.
    await settleWheelOn(view, 'start-time-wheel-hour', '23');
    await settleWheelOn(view, 'start-time-wheel-minute', '55');
    await act(async () => {
      fireEvent.press(view.getByLabelText("Terminer la modification de l'heure"));
    });
    expect(view.getByTestId('time-modifier-value')).toHaveTextContent('23:55');
  });

  it('shows the Agenda date read-only and the time as the one editable row', async () => {
    const view = await renderCreation();

    // Date: information, never an action — no button role, no « Changer la date ».
    const date = view.getByTestId('appointment-date');
    expect(date.props.accessibilityRole).toBeUndefined();
    expect(date.props.accessibilityLabel).toBe('Date, Mardi 25 août');
    expect(view.queryByLabelText('Changer la date')).toBeNull();
    // Heure: the whole row is the button; no separate « Changer l'horaire » link.
    expect(view.getByRole('button', { name: 'Heure, 10:15' })).toBeTruthy();
    expect(view.queryByText("Changer l'horaire")).toBeNull();
    // No Client row above the search: the Client is picked in the list.
    expect(view.queryByText('Choisir un client')).toBeNull();
    expect(view.getByPlaceholderText('Rechercher un client')).toBeTruthy();
    expect(view.getByText('Ajouter un client')).toBeTruthy();
  });

  it('opens in the canonical BeautIzzy sheet shell with a scrollable Client list and no auto-focus', async () => {
    const view = await renderCreation();

    expect(view.getByTestId('appointment-creation-sheet')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Nouveau rendez-vous' })).toBeTruthy();
    // The stepper and the segment name the mode: no « Client » page title.
    expect(view.queryByRole('header', { name: 'Client' })).toBeNull();
    expect(view.queryByText('NOUVEAU RENDEZ-VOUS')).toBeNull();
    expect(view.getByLabelText('Annuler la création')).toBeTruthy();
    expect(view.getByTestId('appointment-creation-actions')).toBeTruthy();
    expect(view.getByText('Continuer')).toBeTruthy();

    const search = view.getByPlaceholderText('Rechercher un client');
    expect(search.props.autoFocus).toBeFalsy();
    // The Client list is a real vertical list the professional scrolls through;
    // scrolling it never closes the creation sheet.
    const list = view.getByTestId('client-picker-list');
    expect(list.props.data.length).toBeGreaterThan(60);
    await act(async () => {
      fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 1200 } } });
    });
    expect(view.getByTestId('appointment-creation-sheet')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Nouveau rendez-vous' })).toBeTruthy();
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

  it('reminds WHICH services are selected under the count, names only, updated at once', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    // Nothing selected: the count alone, exactly as before.
    expect(view.getByTestId('selection-count').props.children).toBe('0 prestation sélectionnée');
    expect(view.queryByTestId('selection-names')).toBeNull();

    await selectService(view, 'Balayage 1');
    expect(view.getByTestId('selection-count').props.children).toBe('1 prestation sélectionnée');
    expect(view.getByTestId('selection-names').props.children).toBe('Balayage 1');

    await selectService(view, 'Brushing 1');
    expect(view.getByTestId('selection-count').props.children).toBe('2 prestations sélectionnées');
    const names = view.getByTestId('selection-names');
    expect(names.props.children).toBe('Balayage 1 · Brushing 1');
    // A reminder, not a second summary: no duration, no price, bounded height.
    expect(names.props.children).not.toMatch(/\d+\s?(min|h\b)|€/);
    expect(names.props.numberOfLines).toBe(2);

    // A second tap adds one more occurrence: named once, with its quantity.
    await selectService(view, 'Brushing 1');
    expect(view.getByTestId('selection-count').props.children).toBe('3 prestations sélectionnées');
    expect(view.getByTestId('selection-names').props.children).toBe('Balayage 1 · Brushing 1 ×2');
    expect(view.getByTestId('selection-names').props.accessibilityLabel).toBe('Balayage 1, Brushing 1 ×2');

    // [−] down to 0 removes the name immediately: no stale label.
    await decrementService(view, 'Balayage 1');
    expect(view.getByTestId('selection-count').props.children).toBe('2 prestations sélectionnées');
    expect(view.getByTestId('selection-names').props.children).toBe('Brushing 1 ×2');

    await decrementService(view, 'Brushing 1');
    await decrementService(view, 'Brushing 1');
    expect(view.queryByTestId('selection-names')).toBeNull();
    expect(view.getByTestId('selection-count').props.children).toBe('0 prestation sélectionnée');
  });

  it('books the same Service twice as two items: quantity, totals and the saved Appointment agree', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);
    await searchService(view, 'brushing 1');

    await selectService(view, 'Brushing 1');
    const card = () => view.getByRole('button', { name: /^Brushing 1, / });
    expect(card().props.accessibilityLabel).toMatch(/, quantité 1$/);
    expect(view.getByTestId('service-card-service-brushing-brushing-1-quantity')).toBeTruthy();
    expect(view.queryByTestId('service-card-service-brushing-brushing-1-check')).toBeNull();

    // [+] adds exactly one: the card underneath never also receives the tap.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Ajouter une fois de plus Brushing 1'));
    });
    expect(card().props.accessibilityLabel).toMatch(/, quantité 2$/);
    expect(view.getByText('×2')).toBeTruthy();
    expect(view.getByTestId('selection-count').props.children).toBe('2 prestations sélectionnées');

    // The VoiceOver actions do the same as the buttons.
    await act(async () => {
      fireEvent(card(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    });
    expect(card().props.accessibilityLabel).toMatch(/, quantité 3$/);
    await act(async () => {
      fireEvent(card(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    });
    expect(card().props.accessibilityLabel).toMatch(/, quantité 2$/);

    await continueToSummary(view);
    // Two independent occurrences, priced and timed twice.
    expect(view.getAllByLabelText(/^Développer Brushing 1$/)).toHaveLength(2);
    expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(40));
    expect(view.getByTestId('creation-final-summary').props.accessibilityLabel).toMatch(/^Durée totale 1 h,/);

    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });
    const appointments = view.getByTestId('appointments-probe').props.children as string;
    expect(appointments.match(/Brushing 1:20:30/g)).toHaveLength(2);
  });

  it('searches inside the chosen category, offers the other one, and preserves selections', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    await selectService(view, 'Brushing 1');
    await searchService(view, 'balayage');

    // Services holds no Balayage: the empty state offers Techniques.
    expect(view.queryByText('Balayage 1')).toBeNull();
    expect(view.getByText('Aucune prestation trouvée')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('catalog-show-other-category'));
    });
    expect(view.getByTestId('catalog-category-TECHNIQUE').props.accessibilityState).toEqual({
      selected: true,
    });

    await selectService(view, 'Balayage 1');
    await clearServiceSearch(view);

    // Both selections survive, each card with its own category state.
    expect(view.getByText('2 prestations sélectionnées')).toBeTruthy();
    expect(view.getByTestId('service-card-technique-balayage-balayage-1').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(
      StyleSheet.flatten(view.getByTestId('service-card-technique-balayage-balayage-1-quantity').props.style)
        .backgroundColor,
    ).toBe(serviceCategoryColors.TECHNIQUE.accent);
    await act(async () => {
      fireEvent.press(view.getByTestId('catalog-category-SERVICE'));
    });
    expect(
      StyleSheet.flatten(view.getByTestId('service-card-service-brushing-brushing-1-quantity').props.style)
        .backgroundColor,
    ).toBe(serviceCategoryColors.SERVICE.accent);
  });

  it('shows the shared Services / Techniques segment in the category colours', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);

    const background = (testID: string) =>
      StyleSheet.flatten(view.getByTestId(testID).props.style).backgroundColor;
    expect(background('catalog-category-SERVICE')).toBe(serviceCategoryColors.SERVICE.strong);
    expect(view.getByTestId('catalog-list-SERVICE')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('catalog-category-TECHNIQUE'));
    });
    expect(background('catalog-category-TECHNIQUE')).toBe(serviceCategoryColors.TECHNIQUE.strong);
    expect(background('catalog-category-SERVICE')).not.toBe(serviceCategoryColors.SERVICE.strong);
    expect(view.getByTestId('catalog-list-TECHNIQUE')).toBeTruthy();
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
    expect(view.queryByTestId('catalog-show-other-category')).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByTestId('reactivate-balayage'));
    });

    // Active again: the Techniques segment finds it at once.
    await act(async () => {
      fireEvent.press(view.getByTestId('catalog-show-other-category'));
    });
    expect(view.getByText('Balayage 1')).toBeTruthy();
  });

  it('creates an appointment with adjustments and preserves the draft across step transitions', async () => {
    const view = await renderCreation();

    expect(view.getByTestId('appointment-date-value')).toHaveTextContent('Mar. 25 août');
    expect(view.getByTestId('time-modifier-value')).toHaveTextContent('10:15');
    await selectClientBeyond60(view);

    // Prestations repeats the Date / Heure group; the Client only replaces the
    // « RENDEZ-VOUS » heading, never a row of its own.
    expect(view.getByTestId('appointment-date-value')).toHaveTextContent('Mar. 25 août');
    expect(view.getByTestId('time-modifier-value')).toHaveTextContent('10:15');
    expect(view.getAllByText('Constance Chevalier')).toEqual([
      view.getByTestId('appointment-schedule-heading'),
    ]);
    expect(view.queryByText("Changer l'horaire")).toBeNull();

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

  it('keeps the whole creation draft — step, Client, services, time, adjustments — when remote changes are applied in place', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);
    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);
    await expandService(view, 'Balayage 1');
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage 1'), '50');
    });
    await stepPhase(view, BALAYAGE_POSE, -3);
    const clientMentions = view.queryAllByText(/Constance Chevalier/).length;
    const summaryBefore = view.getByText('10:15 – 12:30');
    expect(summaryBefore).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('apply-remote-change')));

    // The persisted catalog adopted the remote price underneath…
    expect(view.getByTestId('catalog-balayage').props.children).toMatch(/^60:/);
    // …while the open Summary step keeps every draft value.
    expect(view.getByText('Créer le rendez-vous')).toBeTruthy();
    expect(view.queryAllByText(/Constance Chevalier/)).toHaveLength(clientMentions);
    expect(view.getByText('10:15 – 12:30')).toBeTruthy();
    // The open editor keeps the typed price, not the remote catalog one.
    expect(view.getByLabelText('Prix de Balayage 1').props.value).toBe('50');
    expect(view.getAllByText('50,00 €').length).toBeGreaterThanOrEqual(1);
    expect(view.queryByText('60,00 €')).toBeNull();
    expect(phaseValue(view, BALAYAGE_POSE)).toBe('45 min');
    expect(mockBack).not.toHaveBeenCalled();

    // The draft still creates exactly what the professional prepared.
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });
    expect(view.getByTestId('appointments-probe').props.children).toContain('Balayage 1:50:90/45');
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

    // Back to selection and deselect the modified service ([−] down to 0).
    await act(async () => {
      fireEvent.press(view.getByTestId('edit-services'));
    });
    await decrementService(view, 'Balayage 1');
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

  it('applies an optional discount from the Résumé: gross, discount and total are shown, the snapshot price is untouched', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);
    await searchService(view, 'brushing 1');
    await selectService(view, 'Brushing 1');
    await continueToSummary(view);

    // Secondary by default: one collapsed row, no breakdown, the plain total.
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
    expect(view.queryByTestId('creation-discount-breakdown')).toBeNull();
    expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(20));

    await act(async () => {
      fireEvent.press(view.getByTestId('appointment-discount-toggle'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduction de 50 pour cent'));
    });

    expect(view.getByTestId('creation-discount-breakdown')).toBeTruthy();
    expect(view.getByText('Réduction -50 %')).toBeTruthy();
    expect(view.getByText(`-${formatEuros(10)}`)).toBeTruthy();
    expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(10));
    // The amount to charge outweighs the two breakdown lines above it.
    const total = StyleSheet.flatten(view.getByTestId('creation-total').props.style);
    const discountLine = StyleSheet.flatten(view.getByText(`-${formatEuros(10)}`).props.style);
    expect(total.fontSize).toBeGreaterThan(discountLine.fontSize as number);
    expect(total.fontFamily).not.toBe(discountLine.fontFamily);

    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    expect(view.getByTestId('last-appointment-discount').props.children).toBe('{"type":"PERCENT","percent":50}');
    expect(view.getByTestId('appointments-probe').props.children).toContain('Brushing 1:20:30');
    expect(view.getByTestId('catalog-brushing-1').props.children).toBe('20:service-brushing-brushing-1-phase=30');
  });

  it('creates an Appointment with a freely entered amount, typed with a comma, stored as exact cents', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);
    await searchService(view, 'brushing 1');
    await selectService(view, 'Brushing 1');
    await continueToSummary(view);

    await act(async () => {
      fireEvent.press(view.getByTestId('appointment-discount-toggle'));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Réduction en euros'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByTestId('appointment-discount-entry-input'), '7,50');
    });

    // 20 € − 7,50 € = 12,50 €, shown before confirmation.
    expect(view.getByTestId('creation-discount-breakdown')).toBeTruthy();
    expect(within(view.getByTestId('creation-discount-breakdown')).getByText(`-${formatEuros(7.5)}`)).toBeTruthy();
    expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(12.5));
    expect(view.getByTestId('appointment-discount-summary').props.children).toBe(`-${formatEuros(7.5)}`);

    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    expect(view.getByTestId('last-appointment-discount').props.children).toBe('{"type":"FIXED","amountCents":750}');
  });

  it('creates an Appointment without a discount exactly as before', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);
    await searchService(view, 'brushing 1');
    await selectService(view, 'Brushing 1');
    await continueToSummary(view);

    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    expect(view.getByTestId('last-appointment-discount').props.children).toBe('null');
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
      fireEvent.press(view.getByTestId('time-modifier'));
    });
    expect(wheelValue(view, 'start-time-wheel-hour')).toBe('10 heures');
    expect(wheelValue(view, 'start-time-wheel-minute')).toBe('15 minutes');
    await settleWheelOn(view, 'start-time-wheel-minute', '30');
    expect(wheelValue(view, 'start-time-wheel-minute')).toBe('30 minutes');
    await act(async () => {
      fireEvent.press(view.getByLabelText("Terminer la modification de l'heure"));
    });

    expect(view.getByTestId('appointment-date-value')).toHaveTextContent('Mar. 25 août');

    expect(view.getByText('10:30 – 13:00')).toBeTruthy();
    expect(view.getByText('2 h 30 min')).toBeTruthy();
    expect(view.getByText('1 h 30 min')).toBeTruthy();
    expect(view.getByText('1 h')).toBeTruthy();
  });

  it('reviews the Résumé in grouped rows: Client and Heure are actions, Date is read-only, no TOTAL heading', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);
    await searchService(view, 'brushing 1');
    await selectService(view, 'Brushing 1');
    await continueToSummary(view);

    // Client: one row, the row is the action.
    expect(view.getByText('CLIENT')).toBeTruthy();
    const clientRow = view.getByTestId('edit-client');
    expect(clientRow.props.accessibilityRole).toBe('button');
    expect(clientRow.props.accessibilityLabel).toBe('Client, Constance Chevalier');
    expect(view.getByTestId('edit-client-value')).toHaveTextContent('Constance Chevalier');
    expect(view.queryByText('Changer de client')).toBeNull();

    // Date: read-only, the full date spoken.
    const dateRow = view.getByTestId('appointment-date');
    expect(dateRow.props.accessibilityRole).toBeUndefined();
    expect(dateRow.props.accessibilityLabel).toBe('Date, Mardi 25 août');
    expect(view.getByTestId('appointment-date-value')).toHaveTextContent('Mar. 25 août');

    // Heure: the range, one button.
    const timeRow = view.getByTestId('time-modifier');
    expect(timeRow.props.accessibilityRole).toBe('button');
    expect(timeRow.props.accessibilityLabel).toBe('Heure, 10:15 à 10:45');
    expect(view.getByTestId('time-modifier-value')).toHaveTextContent('10:15 – 10:45');
    expect(view.queryByText("Changer l'horaire")).toBeNull();

    // Prestations: count, short « Modifier », edit chevron (one row: nothing to reorder).
    expect(view.getByText('Prestations sélectionnées')).toBeTruthy();
    expect(view.getByText('Modifier')).toBeTruthy();
    expect(view.queryByLabelText('Déplacer Brushing 1')).toBeNull();
    expect(view.getByLabelText('Développer Brushing 1')).toBeTruthy();

    // Options: the Réduction row, no TOTAL heading anywhere.
    expect(view.getByText('Options')).toBeTruthy();
    expect(view.getByLabelText('Réduction, aucune')).toBeTruthy();
    expect(view.getByText('Total')).toBeTruthy();
    expect(view.queryByText('TOTAL')).toBeNull();

    // No pose time: Temps actif would repeat Durée totale, so no breakdown.
    expect(view.queryByTestId('creation-time-breakdown')).toBeNull();
    expect(view.queryByText('Temps actif')).toBeNull();
    expect(view.queryByText('Temps de pose')).toBeNull();
    expect(view.getByTestId('creation-final-summary').props.accessibilityLabel).toBe(
      `Durée totale 30 min, total ${formatEuros(20)}`,
    );

    // Client row returns to the Client step.
    await act(async () => {
      fireEvent.press(clientRow);
    });
    expect(view.getByPlaceholderText('Rechercher un client')).toBeTruthy();
  });

  it('shows the Temps actif / Temps de pose breakdown only when the Résumé has pose time', async () => {
    const view = await renderCreation();
    await selectClientBeyond60(view);
    await searchService(view, 'balayage 1');
    await selectService(view, 'Balayage 1');
    await continueToSummary(view);

    const breakdown = view.getByTestId('creation-time-breakdown');
    expect(within(breakdown).getByLabelText('Temps actif, 1 h 30 min')).toBeTruthy();
    expect(within(breakdown).getByLabelText('Temps de pose, 1 h')).toBeTruthy();
    expect(view.getByTestId('creation-final-summary').props.accessibilityLabel).toBe(
      `Durée totale 2 h 30 min, total ${formatEuros(45)}`,
    );

    // Pose stepped down to zero: the breakdown disappears, Durée totale follows.
    await expandService(view, 'Balayage 1');
    await stepPhase(view, BALAYAGE_POSE, -12);
    expect(view.queryByTestId('creation-time-breakdown')).toBeNull();
    expect(view.getByTestId('creation-final-summary').props.accessibilityLabel).toBe(
      `Durée totale 1 h 30 min, total ${formatEuros(45)}`,
    );
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
      fireEvent.press(view.getByText('Ajouter le client'));
    });
    await settleSheetTransition();

    const createdClientId = view.getByTestId('new-client-id').props.children as string;
    expect(createdClientId.length).toBeGreaterThan(0);

    // Selected at once: Continuer is enabled and the Résumé names her.
    await act(async () => {
      fireEvent.press(view.getByText('Continuer'));
    });

    await searchService(view, 'coupe brushing 1');
    await selectService(view, 'Coupe Brushing 1');
    await continueToSummary(view);
    expect(view.getByText('Nouvelle Cliente')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByText('Créer le rendez-vous'));
    });

    expect(view.getByTestId('last-appointment-client-id').props.children).toBe(createdClientId);
    await act(async () => {
      view.unmount();
    });
  });

  it('never offers an archived Client in the Client step', async () => {
    const view = await renderCreation();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'léa martin');
    });
    expect(view.getByText('Léa Martin')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });

    expect(view.queryByText('Léa Martin')).toBeNull();
    expect(view.getByText('Aucun client trouvé')).toBeTruthy();
  });

  describe('selected Client as the « RENDEZ-VOUS » heading', () => {
    function heading(view: Rendered) {
      return view.getByTestId('appointment-schedule-heading');
    }

    it('reads RENDEZ-VOUS before a selection, then the chosen name in the very same heading', async () => {
      const view = await renderCreation();

      expect(heading(view)).toHaveTextContent('RENDEZ-VOUS');
      const labelStyle = StyleSheet.flatten(heading(view).props.style);
      expect(view.getByText('Continuer')).toBeDisabled();

      await tapClient(view, 'Léa Martin');

      // Only the string changes: same element, same eyebrow style (uppercase included).
      expect(heading(view)).toHaveTextContent('Léa Martin');
      expect(StyleSheet.flatten(heading(view).props.style)).toEqual(labelStyle);
      expect(labelStyle).toMatchObject({ textTransform: 'uppercase' });
      expect(view.queryByText('RENDEZ-VOUS')).toBeNull();
      // The list selection is untouched: row selected, Continuer enabled.
      expect(view.getByRole('button', { name: /Léa Martin/ })).toBeSelected();
      expect(view.getByText('Continuer')).toBeEnabled();
    });

    it('stays driven by the selection, whatever the search lists', async () => {
      const view = await renderCreation();
      await tapClient(view, 'Léa Martin');

      await act(async () => {
        fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'Constance Chevalier');
      });
      expect(view.queryByRole('button', { name: /Léa Martin/ })).toBeNull();
      expect(view.getAllByText('Léa Martin')).toEqual([heading(view)]);

      await act(async () => {
        fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), '');
      });
      expect(heading(view)).toHaveTextContent('Léa Martin');
    });

    it('follows a changed selection at once', async () => {
      const view = await renderCreation();
      await tapClient(view, 'Léa Martin');
      await tapClient(view, 'Constance Chevalier');

      expect(heading(view)).toHaveTextContent('Constance Chevalier');
      expect(view.queryByText('Léa Martin')).toBeNull();
    });

    it('restores RENDEZ-VOUS when the selection empties (the chosen Client is archived)', async () => {
      const view = await renderCreation();
      await tapClient(view, 'Léa Martin');
      expect(heading(view)).toHaveTextContent('Léa Martin');

      await act(async () => {
        fireEvent.press(view.getByTestId('archive-lea'));
      });
      expect(heading(view)).toHaveTextContent('RENDEZ-VOUS');
      expect(view.getByText('Continuer')).toBeDisabled();
    });

    it('stays the heading on Prestations and follows a change made after Précédent', async () => {
      const view = await renderCreation();
      await selectClientByName(view, 'Léa Martin');

      expect(view.getByPlaceholderText('Rechercher une prestation')).toBeTruthy();
      expect(heading(view)).toHaveTextContent('Léa Martin');

      await act(async () => {
        fireEvent.press(view.getByText('Précédent'));
      });
      await selectClientByName(view, 'Constance Chevalier');
      expect(heading(view)).toHaveTextContent('Constance Chevalier');
    });

    it('keeps a long name to one truncated line', async () => {
      const view = await renderCreation();
      await tapClient(view, 'Léa Martin');

      expect(heading(view).props.numberOfLines).toBe(1);
      expect(heading(view).props.ellipsizeMode).toBe('tail');
    });
  });

  describe('opened from a Client Profile (initialClientId)', () => {
    it('starts on Client with her selected, the Agenda date kept, and creates nothing', async () => {
      const view = await render(creationTree(0, undefined, startAt, 'client-agenda-lea'));
      const before = view.getByTestId('appointments-probe').props.children;

      expect(view.getByPlaceholderText('Rechercher un client')).toBeTruthy();
      expect(view.getByTestId('appointment-schedule-heading')).toHaveTextContent('Léa Martin');
      expect(view.getByTestId('appointment-date-value')).toHaveTextContent('Mar. 25 août');
      expect(view.getByTestId('time-modifier-value')).toHaveTextContent('10:15');
      expect(view.getByText('Continuer')).toBeEnabled();
      expect(view.getByTestId('appointments-probe').props.children).toBe(before);

      // Her row in the (virtualised) list is the selected one.
      await act(async () => {
        fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'Léa Martin');
      });
      expect(view.getByRole('button', { name: /Léa Martin/ })).toBeSelected();
    });

    it('continues through the normal flow and books the preselected Client', async () => {
      const view = await render(creationTree(0, undefined, startAt, 'client-agenda-lea'));

      await act(async () => {
        fireEvent.press(view.getByText('Continuer'));
      });
      expect(view.getByPlaceholderText('Rechercher une prestation')).toBeTruthy();
      await searchService(view, 'balayage 1');
      await selectService(view, 'Balayage 1');
      await continueToSummary(view);
      await act(async () => {
        fireEvent.press(view.getByText('Créer le rendez-vous'));
      });

      expect(view.getByTestId('last-appointment-client-id')).toHaveTextContent('client-agenda-lea');
    });

    it('still lets her be replaced on the Client step', async () => {
      const view = await render(creationTree(0, undefined, startAt, 'client-agenda-lea'));

      await tapClient(view, 'Constance Chevalier');

      expect(view.getByTestId('appointment-schedule-heading')).toHaveTextContent('Constance Chevalier');
    });

    it('falls back to no selection for an unknown or archived Client', async () => {
      const view = await render(creationTree(0, undefined, startAt, 'client-missing'));

      expect(view.getByTestId('appointment-schedule-heading')).toHaveTextContent('RENDEZ-VOUS');
      expect(view.getByText('Continuer')).toBeDisabled();
    });
  });

  describe('birthday discount suggestion', () => {
    it('suggests a discount when the APPOINTMENT date is the Client birthday, whatever today is', async () => {
      // The suite never runs on 25 août 2026 at 10:15: the match comes from `startAt`.
      const view = await renderCreation();
      await reachBirthdaySummary(view);

      const notice = view.getByTestId('appointment-birthday-notice');
      expect(within(notice).getByText('Anniversaire du client')).toBeTruthy();
      expect(
        within(notice).getByText('Vous pouvez appliquer une réduction anniversaire.'),
      ).toBeTruthy();
      expect(
        view.getByLabelText(
          'Anniversaire du client. Vous pouvez appliquer une réduction anniversaire.',
        ),
      ).toBeTruthy();
      expect(view.getByRole('button', { name: 'Appliquer une réduction' })).toBeTruthy();
      // A suggestion only: nothing is discounted.
      expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
      expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(20));
    });

    it('shows no suggestion when the Appointment is another day', async () => {
      const view = await render(creationTree(0, undefined, new Date(2026, 7, 26, 10, 15)));
      await reachBirthdaySummary(view);

      expect(view.queryByTestId('appointment-birthday-notice')).toBeNull();
      expect(view.queryByText('Appliquer une réduction')).toBeNull();
    });

    it('removes the suggestion as soon as another Client is chosen, and brings it back with her', async () => {
      const view = await renderCreation();
      await reachBirthdaySummary(view);
      expect(view.getByTestId('appointment-birthday-notice')).toBeTruthy();

      await act(async () => {
        fireEvent.press(view.getByTestId('edit-client'));
      });
      await selectClientByName(view, 'Sofia Petit');
      await continueToSummary(view);

      expect(view.getByTestId('edit-client-value')).toHaveTextContent('Sofia Petit');
      expect(view.queryByTestId('appointment-birthday-notice')).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('edit-client'));
      });
      await selectClientByName(view, 'Léa Martin');
      await continueToSummary(view);

      expect(view.getByTestId('appointment-birthday-notice')).toBeTruthy();
    });

    it('« Appliquer une réduction » opens the existing editor and selects nothing', async () => {
      const view = await renderCreation();
      await reachBirthdaySummary(view);
      expect(view.queryByTestId('appointment-discount-presets')).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('apply-birthday-discount'));
      });

      // The generic editor is open: % / € switch and the normal presets.
      expect(view.getByTestId('appointment-discount-toggle').props.accessibilityState.expanded).toBe(true);
      expect(view.getByTestId('appointment-discount-mode')).toBeTruthy();
      const presets = within(view.getByTestId('appointment-discount-presets')).getAllByRole('button');
      expect(presets).toHaveLength(10);
      for (const preset of presets) {
        expect(preset.props.accessibilityState.selected).toBe(false);
      }
      // No discount, no price change; the now-useless CTA is gone, the reminder stays.
      expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
      expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(20));
      expect(view.queryByTestId('creation-discount-breakdown')).toBeNull();
      expect(view.queryByTestId('apply-birthday-discount')).toBeNull();
      expect(view.getByTestId('appointment-birthday-notice')).toBeTruthy();

      await act(async () => {
        fireEvent.press(view.getByText('Créer le rendez-vous'));
      });
      expect(view.getByTestId('last-appointment-discount').props.children).toBe('null');
    });

    it('states an existing discount instead of prompting, persists a plain generic discount and prices it as usual', async () => {
      const view = await renderCreation();
      await reachBirthdaySummary(view);
      await act(async () => {
        fireEvent.press(view.getByTestId('apply-birthday-discount'));
      });
      await act(async () => {
        fireEvent.press(view.getByLabelText('Réduction de 10 pour cent'));
      });

      const notice = view.getByTestId('appointment-birthday-notice');
      expect(
        within(notice).getByText('Une réduction est déjà appliquée à ce rendez-vous.'),
      ).toBeTruthy();
      expect(view.queryByText('Vous pouvez appliquer une réduction anniversaire.')).toBeNull();
      expect(view.queryByTestId('apply-birthday-discount')).toBeNull();
      // Never claims the generic discount is a « birthday discount ».
      expect(view.queryByText(/réduction anniversaire appliquée/i)).toBeNull();
      // Generic pricing, unchanged: 20 € − 10 % = 18 €.
      expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(18));

      await act(async () => {
        fireEvent.press(view.getByText('Créer le rendez-vous'));
      });
      // Exactly the generic discount: no origin, reason or birthday marker.
      expect(view.getByTestId('last-appointment-discount').props.children).toBe(
        '{"type":"PERCENT","percent":10}',
      );
      expect(view.getByTestId('appointments-probe').props.children).toContain('Brushing 1:20:30');
    });

    it('shows no suggestion for a Client without a birthday', async () => {
      const view = await renderCreation();
      await selectClientByName(view, 'Sofia Petit');
      await searchService(view, 'brushing 1');
      await selectService(view, 'Brushing 1');
      await continueToSummary(view);

      expect(view.queryByTestId('appointment-birthday-notice')).toBeNull();
    });
  });

  describe('no-show warning in the footer (Client step and Résumé)', () => {
    const WARNING = 'appointment-no-show-warning';
    const FOOTER = 'appointment-creation-actions';
    const LIST = 'client-picker-list';
    const LAST_MISSED = 'Dernier rendez-vous non honoré';
    const HISTORY = "Historique d'absences";

    beforeAll(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    beforeEach(() => {
      // Today is 10 août at 08:00, before every seeded Agenda fixture of the
      // day: the seeded appointments are still to come, so only the history
      // added by each test is in the past. The July no-shows are past.
      jest.setSystemTime(new Date(2026, 7, 10, 8, 0));
    });

    async function press(view: Rendered, testID: string) {
      await act(async () => {
        fireEvent.press(view.getByTestId(testID));
      });
    }

    async function seedNoShows(view: Rendered, count: 1 | 2 | 3 | 5 | 6) {
      await press(view, 'sofia-no-show-1');
      if (count >= 2) await press(view, 'sofia-no-show-2');
      if (count >= 3) await press(view, 'sofia-no-show-3');
      if (count >= 5) await press(view, 'sofia-no-shows-4-5');
      if (count >= 6) await press(view, 'sofia-no-show-6');
    }

    /** The warning, found INSIDE the fixed footer — never inside the scrolling list. */
    function footerWarning(view: Rendered) {
      const warning = within(view.getByTestId(FOOTER)).getByTestId(WARNING);
      const list = view.queryByTestId(LIST);
      if (list) expect(within(list).queryByTestId(WARNING)).toBeNull();
      return warning;
    }

    it('shows nothing for a Client without no-shows: the step is unchanged', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-attended-after');
      await press(view, 'sofia-cancelled-after');

      await tapClient(view, 'Sofia Petit');

      expect(view.queryByTestId(WARNING)).toBeNull();
      expect(view.queryByText(/absence/)).toBeNull();
      expect(view.getByText('Continuer')).toBeEnabled();
    });

    it('warns at once, above « Continuer », that the last appointment was missed — amber, singular', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-no-show-1');
      expect(view.queryByTestId(WARNING)).toBeNull();

      await tapClient(view, 'Sofia Petit');

      // Still on the Client step, the row selected: the warning blocks nothing.
      expect(view.getByLabelText('Client — étape en cours')).toBeTruthy();
      expect(view.getByRole('button', { name: /Sofia Petit/ })).toBeSelected();
      expect(view.getByText('Continuer')).toBeEnabled();

      const warning = footerWarning(view);
      expect(within(warning).getByText(LAST_MISSED)).toBeTruthy();
      expect(
        within(warning).getByText('1 absence enregistrée. Pensez à demander un acompte.'),
      ).toBeTruthy();
      expect(warning).toHaveStyle({ borderColor: caution.amber600, borderWidth: 1.5 });
      expect(
        view.getByLabelText(`${LAST_MISSED}. 1 absence enregistrée. Pensez à demander un acompte.`),
      ).toBeTruthy();
      // In the footer, BEFORE the buttons: it sits above « Continuer », never over it.
      const footer = view.getByTestId(FOOTER);
      const continueButton = view.getByText('Continuer');
      expect(footer.children.indexOf(warning)).toBe(0);
      expect(within(footer).getByText('Continuer')).toBe(continueButton);
      expect(within(warning).queryByText('Continuer')).toBeNull();
      // A suggestion in words only: no deposit action, no dialog, no celebration.
      expect(view.queryByText(/Ajouter un acompte|Prendre un acompte/)).toBeNull();
      expect(view.queryByRole('alert')).toBeNull();
      expect(mockSuccessHaptic).not.toHaveBeenCalled();
    });

    it('is visible for a Client far down the list, without scrolling back to the top', async () => {
      const view = await renderCreation();
      await press(view, 'constance-no-show-1');

      // Constance sits beyond index 60 of the address book: her row is reached by
      // the search, the way a scrolled list would — the header is far away.
      await tapClient(view, 'Constance Chevalier');

      expect(within(footerWarning(view)).getByText(LAST_MISSED)).toBeTruthy();
      // The scrolling header carries no warning any more (no duplicate, nothing to scroll to).
      expect(view.getAllByTestId(WARNING)).toHaveLength(1);
    });

    it('stays put while the list scrolls and while the search is used', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-no-show-1');
      await tapClient(view, 'Sofia Petit');

      await act(async () => {
        fireEvent.scroll(view.getByTestId(LIST), {
          nativeEvent: {
            contentOffset: { x: 0, y: 1800 },
            contentSize: { width: 390, height: 6000 },
            layoutMeasurement: { width: 390, height: 500 },
          },
        });
      });
      expect(footerWarning(view)).toBeTruthy();

      await act(async () => {
        fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'Léa');
      });
      expect(footerWarning(view)).toBeTruthy();
      // The list still answers: another row can be chosen right away.
      await act(async () => {
        fireEvent.press(view.getByRole('button', { name: /Léa Martin/ }));
      });
      expect(view.queryByTestId(WARNING)).toBeNull();
    });

    it('agrees in number and grades amber, orange, red as the no-shows add up', async () => {
      const view = await renderCreation();
      await seedNoShows(view, 2);
      await tapClient(view, 'Sofia Petit');

      expect(within(footerWarning(view)).getByText(/^2 absences enregistrées\./)).toBeTruthy();
      expect(footerWarning(view)).toHaveStyle({ borderColor: caution.amber600 });

      await press(view, 'sofia-no-show-3');
      expect(within(footerWarning(view)).getByText(/^3 absences enregistrées\./)).toBeTruthy();
      expect(footerWarning(view)).toHaveStyle({ borderColor: caution.orange600 });

      await press(view, 'sofia-no-shows-4-5');
      expect(within(footerWarning(view)).getByText(/^5 absences enregistrées\./)).toBeTruthy();
      expect(footerWarning(view)).toHaveStyle({ borderColor: caution.orange600 });

      await press(view, 'sofia-no-show-6');
      expect(within(footerWarning(view)).getByText(/^6 absences enregistrées\./)).toBeTruthy();
      expect(footerWarning(view)).toHaveStyle({ borderColor: caution.red600 });
      expect(within(footerWarning(view)).getByText(LAST_MISSED)).toBeTruthy();
    });

    it('falls back to the history wording — the count alone — when the Client came back since', async () => {
      const view = await renderCreation();
      // Insertion order is deliberately NOT chronological: the dates decide.
      await press(view, 'sofia-attended-after');
      await press(view, 'sofia-no-show-1');
      await tapClient(view, 'Sofia Petit');

      const warning = footerWarning(view);
      expect(within(warning).getByText(HISTORY)).toBeTruthy();
      expect(within(warning).getByText('1 absence enregistrée.')).toBeTruthy();
      expect(within(warning).queryByText(LAST_MISSED)).toBeNull();
      expect(within(warning).queryByText(/acompte/)).toBeNull();
      expect(warning).toHaveStyle({ borderColor: caution.amber600 });

      await press(view, 'sofia-no-show-2');
      await press(view, 'sofia-no-show-3');
      expect(within(footerWarning(view)).getByText('3 absences enregistrées.')).toBeTruthy();
      expect(footerWarning(view)).toHaveStyle({ borderColor: caution.orange600 });
    });

    it('still names the missed last appointment when only earlier visits were attended', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-attended-before');
      await press(view, 'sofia-no-show-1');
      await tapClient(view, 'Sofia Petit');

      expect(within(footerWarning(view)).getByText(LAST_MISSED)).toBeTruthy();
    });

    it('ignores future bookings and later cancellations when deciding what the last one was', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-no-show-1');
      await press(view, 'sofia-future');
      await press(view, 'sofia-cancelled-after');
      await tapClient(view, 'Sofia Petit');

      const warning = footerWarning(view);
      expect(within(warning).getByText(LAST_MISSED)).toBeTruthy();
      // Cancellations are never absences.
      expect(within(warning).getByText(/^1 absence enregistrée\./)).toBeTruthy();
    });

    it('never claims the last one was missed while the most recent past appointment is unresolved', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-no-show-1');
      await press(view, 'sofia-unresolved-after');
      await tapClient(view, 'Sofia Petit');

      const warning = footerWarning(view);
      expect(within(warning).getByText(HISTORY)).toBeTruthy();
      expect(within(warning).queryByText(LAST_MISSED)).toBeNull();
    });

    it('follows the selection: another Client clears it, choosing her again brings it back', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-no-show-1');
      await tapClient(view, 'Sofia Petit');
      expect(footerWarning(view)).toBeTruthy();

      await tapClient(view, 'Léa Martin');
      expect(view.queryByTestId(WARNING)).toBeNull();
      expect(view.queryByText(/absence/)).toBeNull();

      await tapClient(view, 'Sofia Petit');
      expect(within(footerWarning(view)).getByText(LAST_MISSED)).toBeTruthy();
    });

    it('disappears when the selection empties (the chosen Client is archived)', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-no-show-1');
      await tapClient(view, 'Sofia Petit');
      expect(footerWarning(view)).toBeTruthy();

      await press(view, 'archive-sofia');

      expect(view.queryByTestId(WARNING)).toBeNull();
      expect(view.getByText('Continuer')).toBeDisabled();
    });

    it('leaves Prestations alone, comes back on the Résumé above « Créer le rendez-vous », and again on the Client step', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-no-show-1');
      await selectClientByName(view, 'Sofia Petit');

      // Prestations: the service flow is unchanged.
      expect(view.getByPlaceholderText('Rechercher une prestation')).toBeTruthy();
      expect(view.queryByTestId(WARNING)).toBeNull();

      await searchService(view, 'balayage 1');
      await selectService(view, 'Balayage 1');
      await continueToSummary(view);

      // Résumé: the SAME warning, in the fixed footer, right before the CTA.
      expect(view.getByText('Créer le rendez-vous')).toBeEnabled();
      const footer = view.getByTestId(FOOTER);
      const warning = within(footer).getByTestId(WARNING);
      expect(footer.children.indexOf(warning)).toBe(0);
      expect(within(warning).getByText(LAST_MISSED)).toBeTruthy();
      expect(
        within(warning).getByText('1 absence enregistrée. Pensez à demander un acompte.'),
      ).toBeTruthy();
      expect(view.getAllByTestId(WARNING)).toHaveLength(1);
      // Awareness only: the warning carries no deposit action, and the « Acompte »
      // row of the Résumé stays collapsed and empty — nothing is enabled or filled in.
      expect(within(warning).queryByRole('button')).toBeNull();
      expect(within(footer).queryByText(/acompte/i)).toBe(within(warning).getByText(/Pensez à demander un acompte/));
      expect(view.getByTestId('creation-deposit-summary').props.children).toBe('Aucun');
      expect(view.queryByTestId('creation-deposit-amount')).toBeNull();

      // Back to the Client step through « Précédent » twice: still there, still correct.
      await act(async () => {
        fireEvent.press(view.getByText('Précédent'));
      });
      expect(view.queryByTestId(WARNING)).toBeNull();
      await act(async () => {
        fireEvent.press(view.getByText('Précédent'));
      });
      expect(within(footerWarning(view)).getByText(LAST_MISSED)).toBeTruthy();
    });

    it('shows no warning on the Résumé for a Client without no-shows', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-no-show-1');
      await selectClientByName(view, 'Léa Martin');
      await searchService(view, 'balayage 1');
      await selectService(view, 'Balayage 1');
      await continueToSummary(view);

      expect(view.getByText('Créer le rendez-vous')).toBeEnabled();
      expect(view.queryByTestId(WARNING)).toBeNull();
      expect(view.queryByText(/absence/)).toBeNull();
    });

    it('follows a Client change made from the Résumé', async () => {
      const view = await renderCreation();
      await press(view, 'sofia-no-show-1');
      await selectClientByName(view, 'Léa Martin');
      await searchService(view, 'balayage 1');
      await selectService(view, 'Balayage 1');
      await continueToSummary(view);
      expect(view.queryByTestId(WARNING)).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('edit-client'));
      });
      await selectClientByName(view, 'Sofia Petit');
      await continueToSummary(view);

      expect(view.getByTestId('edit-client-value')).toHaveTextContent('Sofia Petit');
      expect(within(view.getByTestId(FOOTER)).getByTestId(WARNING)).toBeTruthy();
    });

    it('never blocks: the appointment is created as usual, with no deposit of any kind', async () => {
      const view = await renderCreation();
      await seedNoShows(view, 6);
      const before = view.getByTestId('appointments-probe').props.children as string;

      await selectClientByName(view, 'Sofia Petit');
      await searchService(view, 'balayage 1');
      await selectService(view, 'Balayage 1');
      await continueToSummary(view);
      expect(footerWarning(view)).toHaveStyle({ borderColor: caution.red600 });
      await act(async () => {
        fireEvent.press(view.getByText('Créer le rendez-vous'));
      });

      expect(view.getByTestId('last-appointment-client-id')).toHaveTextContent('client-agenda-sofia');
      const after = view.getByTestId('appointments-probe').props.children as string;
      expect(after.split('~')).toHaveLength(before.split('~').length + 1);
      expect(after).toContain('Balayage 1:');
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('birthday at Client selection', () => {
    const hidden = { includeHiddenElements: true } as const;
    const CONFETTI_MS = 2200;

    beforeAll(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    beforeEach(() => {
      // Today is 10 août; the Appointment (`startAt`) is the 25th, Léa's birthday.
      jest.setSystemTime(new Date(2026, 7, 10, 9, 0));
      mockReducedMotion = false;
    });

    async function renderWithBirthdays() {
      const view = await renderCreation();
      await act(async () => {
        fireEvent.press(view.getByTestId('give-lea-birthday'));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId('give-sofia-birthday'));
      });
      return view;
    }

    it('recognizes the birthday the moment the Client is tapped, from the APPOINTMENT date, without « aujourd\'hui »', async () => {
      const view = await renderWithBirthdays();
      expect(view.queryByTestId('client-selection-birthday-notice')).toBeNull();

      await tapClient(view, 'Léa Martin');

      // Still on the Client step: the selection succeeded and the reminder is there.
      expect(view.getByLabelText('Client — étape en cours')).toBeTruthy();
      expect(view.getByRole('button', { name: /Léa Martin/ }).props.accessibilityState.selected).toBe(true);
      const notice = view.getByTestId('client-selection-birthday-notice');
      expect(within(notice).getByText("C'est l'anniversaire de Léa ce jour-là.")).toBeTruthy();
      expect(
        within(notice).getByText('Vous pourrez lui proposer une réduction sur ce rendez-vous.'),
      ).toBeTruthy();
      expect(view.queryByText(/aujourd'hui/)).toBeNull();
      expect(
        view.getByLabelText(
          "C'est l'anniversaire de Léa ce jour-là. Vous pourrez lui proposer une réduction sur ce rendez-vous.",
        ),
      ).toBeTruthy();
      // Awareness only: no discount action on this step.
      expect(view.queryByText('Appliquer une réduction')).toBeNull();

      // Exactly one celebration for that explicit selection.
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
      expect(mockSelectionHaptic).not.toHaveBeenCalled();
      expect(view.getAllByTestId('birthday-confetti', hidden)).toHaveLength(1);
      // Decorative: invisible to accessibility-aware queries, pointer-transparent.
      expect(view.queryByTestId('birthday-confetti')).toBeNull();
      expect(view.getByTestId('birthday-confetti', hidden).props.pointerEvents).toBe('none');

      // The burst ends by itself; the reminder stays.
      await act(async () => {
        jest.advanceTimersByTime(CONFETTI_MS);
      });
      expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
      expect(view.getByTestId('client-selection-birthday-notice')).toBeTruthy();
    });

    it('says « aujourd\'hui » when the birthday Appointment is today', async () => {
      jest.setSystemTime(new Date(2026, 7, 25, 8, 0));
      const view = await renderWithBirthdays();
      await tapClient(view, 'Léa Martin');

      expect(view.getByText("C'est l'anniversaire de Léa aujourd'hui.")).toBeTruthy();
      expect(view.queryByText(/ce jour-là/)).toBeNull();
    });

    it('never replays on a re-render, a re-tap or a step round trip', async () => {
      const view = await renderWithBirthdays();
      await tapClient(view, 'Léa Martin');
      await act(async () => {
        jest.advanceTimersByTime(CONFETTI_MS);
      });
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);

      await act(async () => {
        view.rerender(creationTree(0));
      });
      await tapClient(view, 'Léa Martin');
      await act(async () => {
        fireEvent.press(view.getByText('Continuer'));
      });
      expect(view.queryByTestId('client-selection-birthday-notice')).toBeNull();
      await act(async () => {
        fireEvent.press(view.getByLabelText('Étape précédente'));
      });

      // Back on the Client step: the reminder is there, nothing replayed.
      expect(view.getByTestId('client-selection-birthday-notice')).toBeTruthy();
      expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it('drops the reminder for a Client without a matching birthday and celebrates again when she is chosen again', async () => {
      const view = await renderCreation();
      await act(async () => {
        fireEvent.press(view.getByTestId('give-lea-birthday'));
      });
      await tapClient(view, 'Léa Martin');
      expect(view.getByTestId('birthday-confetti', hidden)).toBeTruthy();

      // Mid-burst change to Sofia (no birthday): nothing stale, not even the confetti.
      await tapClient(view, 'Sofia Petit');
      expect(view.queryByTestId('client-selection-birthday-notice')).toBeNull();
      expect(view.queryByText(/anniversaire/i)).toBeNull();
      expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);

      // A new explicit selection of Léa celebrates again.
      await tapClient(view, 'Léa Martin');
      expect(view.getByTestId('client-selection-birthday-notice')).toBeTruthy();
      expect(view.getAllByTestId('birthday-confetti', hidden)).toHaveLength(1);
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(2);
    });

    it('moves from one birthday Client to another: the name updates and the new selection celebrates', async () => {
      const view = await renderWithBirthdays();
      await tapClient(view, 'Léa Martin');
      await tapClient(view, 'Sofia Petit');

      expect(view.getByText("C'est l'anniversaire de Sofia ce jour-là.")).toBeTruthy();
      expect(view.queryByText(/anniversaire de Léa/)).toBeNull();
      expect(view.getAllByTestId('birthday-confetti', hidden)).toHaveLength(1);
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(2);
    });

    it('shows nothing when the Appointment is not on her birthday', async () => {
      const view = await render(creationTree(0, undefined, new Date(2026, 7, 26, 10, 15)));
      await act(async () => {
        fireEvent.press(view.getByTestId('give-lea-birthday'));
      });
      await tapClient(view, 'Léa Martin');

      expect(view.queryByTestId('client-selection-birthday-notice')).toBeNull();
      expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
      expect(mockSuccessHaptic).not.toHaveBeenCalled();
    });

    it('respects Reduce Motion: the reminder and the haptic, no confetti', async () => {
      mockReducedMotion = true;
      const view = await renderWithBirthdays();
      await tapClient(view, 'Léa Martin');

      expect(view.getByTestId('client-selection-birthday-notice')).toBeTruthy();
      expect(view.queryByTestId('birthday-confetti', hidden)).toBeNull();
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it('keeps the actionable reminder on the Résumé, which still only opens the discount editor', async () => {
      const view = await renderWithBirthdays();
      await reachBirthdaySummary(view);

      expect(view.queryByTestId('client-selection-birthday-notice')).toBeNull();
      expect(view.getByTestId('appointment-birthday-notice')).toBeTruthy();
      await act(async () => {
        fireEvent.press(view.getByTestId('apply-birthday-discount'));
      });
      expect(view.getByTestId('appointment-discount-presets')).toBeTruthy();
      expect(view.getByTestId('appointment-discount-summary').props.children).toBe('Aucune');
      expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(20));
    });
  });

  describe('deposit already received (« Acompte » on the Résumé)', () => {
    const DEPOSIT = 'creation-deposit';
    const SUMMARY = 'creation-deposit-summary';
    const AMOUNT = 'creation-deposit-amount';
    const ERROR = 'creation-deposit-error';
    const CREATE = 'Créer le rendez-vous';

    beforeAll(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    });

    afterAll(() => {
      jest.useRealTimers();
    });

    beforeEach(() => {
      // Today is 10 août; the Appointment (`startAt`, the 25th) is still to come,
      // so it stays SCHEDULED on save and may receive a deposit.
      jest.setSystemTime(new Date(2026, 7, 10, 9, 0));
      mockAlert.mockClear();
    });

    async function press(view: Rendered, testID: string) {
      await act(async () => {
        fireEvent.press(view.getByTestId(testID));
      });
    }

    async function typeAmount(view: Rendered, text: string) {
      await act(async () => {
        fireEvent.changeText(view.getByTestId(AMOUNT), text);
      });
    }

    /** Constance + Brushing 1 (20 €), up to the Résumé, the « Acompte » row opened. */
    async function reachSummaryWithDepositOpen(view: Rendered) {
      await selectClientBeyond60(view);
      await searchService(view, 'brushing 1');
      await selectService(view, 'Brushing 1');
      await continueToSummary(view);
      await press(view, 'creation-deposit-toggle');
    }

    async function createAppointment(view: Rendered) {
      await act(async () => {
        fireEvent.press(view.getByText(CREATE));
      });
    }

    const summaryText = (view: Rendered) => view.getByTestId(SUMMARY).props.children as string;
    const storedDeposits = (database: TestDatabase) => loadAppointmentDeposits(database);
    const createButton = (view: Rendered) => view.getByText(CREATE);

    it('offers ONE collapsed « Acompte » row, inactive by default; creating as before writes no deposit', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      await selectClientBeyond60(view);
      await searchService(view, 'brushing 1');
      await selectService(view, 'Brushing 1');
      await continueToSummary(view);

      // After « Réduction », before the reminder: a quiet row, nothing prefilled.
      expect(view.getByTestId(DEPOSIT)).toBeTruthy();
      expect(summaryText(view)).toBe('Aucun');
      expect(view.getByLabelText('Acompte, aucun')).toBeTruthy();
      expect(view.getByTestId('creation-deposit-toggle').props.accessibilityHint).toBe('Ajouter un acompte reçu');
      expect(view.queryByTestId('creation-deposit-quick-amounts')).toBeNull();
      expect(view.queryByTestId(AMOUNT)).toBeNull();
      expect(createButton(view)).toBeEnabled();

      await createAppointment(view);

      expect(view.getByTestId('last-appointment-discount').props.children).toBe('null');
      expect(view.getByTestId('deposits-probe').props.children).toBe('');
      expect(storedDeposits(database)).toEqual([]);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('records a deposit already received: a quick amount, Espèces, the position shown, saved WITH the Appointment', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      await reachSummaryWithDepositOpen(view);

      expect(view.getByText('Montant déjà reçu du client, enregistré avec le rendez-vous.')).toBeTruthy();
      // 20 € expected: 10 € and exactly 20 € fit, 30 € and 50 € are not offered.
      expect(view.getByTestId('creation-deposit-quick-1000')).toBeTruthy();
      expect(view.getByTestId('creation-deposit-quick-2000')).toBeTruthy();
      expect(view.queryByTestId('creation-deposit-quick-3000')).toBeNull();
      expect(view.queryByTestId('creation-deposit-position')).toBeNull();

      await press(view, 'creation-deposit-quick-1000');
      await press(view, 'creation-deposit-method-cash');

      expect(summaryText(view)).toBe(`${formatEuros(10)} · Espèces`);
      expect(view.getByLabelText('Acompte, 10,00 € par espèces')).toBeTruthy();
      expect(view.getByTestId('creation-deposit-expected-total').props.children).toBe(formatEuros(20));
      expect(view.getByTestId('creation-deposit-collected').props.children).toBe(formatEuros(10));
      expect(view.getByTestId('creation-deposit-remaining').props.children).toBe(formatEuros(10));
      // The expected total of the Appointment never changes because of a deposit.
      expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(20));
      expect(mockSuccessHaptic).not.toHaveBeenCalled();

      await createAppointment(view);

      const appointmentId = view.getByTestId('last-appointment-id').props.children as string;
      expect(appointmentId).not.toBe('');
      expect(view.getByTestId('deposits-probe').props.children).toBe(`${appointmentId}|1000|CASH|ACTIVE|fixture-business`);
      expect(storedDeposits(database)).toEqual([
        expect.objectContaining({
          appointmentId,
          businessId: 'fixture-business',
          amountCents: 1000,
          paymentMethod: 'CASH',
          status: 'ACTIVE',
          paidAt: new Date(2026, 7, 10, 9, 0),
        }),
      ]);
      expect(loadAppointments(database).find((appointment) => appointment.id === appointmentId)).toMatchObject({
        status: 'SCHEDULED',
        clientId: CONSTANCE_ID,
      });
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
      expect(mockAlert).not.toHaveBeenCalled();
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('reads a free amount typed with a comma or a dot as exact cents, Carte by default', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      await reachSummaryWithDepositOpen(view);

      await typeAmount(view, '7,50');
      expect(summaryText(view)).toBe(`${formatEuros(7.5)} · Carte`);
      expect(view.getByTestId('creation-deposit-remaining').props.children).toBe(formatEuros(12.5));

      await typeAmount(view, '7.5');
      expect(summaryText(view)).toBe(`${formatEuros(7.5)} · Carte`);

      await typeAmount(view, '12,');
      expect(summaryText(view)).toBe(`${formatEuros(12)} · Carte`);

      await createAppointment(view);

      expect(storedDeposits(database)).toEqual([
        expect.objectContaining({ amountCents: 1200, paymentMethod: 'CARD' }),
      ]);
    });

    it('refuses zero, negative, unreadable and oversized amounts and holds « Créer le rendez-vous »', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      const before = loadAppointments(database).length;
      await reachSummaryWithDepositOpen(view);

      await typeAmount(view, '0');
      expect(view.getByTestId(ERROR).props.children).toBe('Le montant doit être supérieur à 0 €.');
      expect(summaryText(view)).toBe('Aucun');
      expect(createButton(view)).toBeDisabled();

      await typeAmount(view, '-5');
      expect(view.getByTestId(ERROR).props.children).toBe('Montant invalide');
      expect(createButton(view)).toBeDisabled();

      await typeAmount(view, 'dix');
      expect(view.getByTestId(ERROR).props.children).toBe('Montant invalide');
      expect(createButton(view)).toBeDisabled();

      await typeAmount(view, '20,01');
      expect(view.getByTestId(ERROR).props.children).toBe(
        `L’acompte ne peut pas dépasser le reste à encaisser (${formatEuros(20)}).`,
      );
      expect(createButton(view)).toBeDisabled();

      // Nothing was written by any of those attempts.
      await createAppointment(view);
      expect(loadAppointments(database)).toHaveLength(before);
      expect(storedDeposits(database)).toEqual([]);

      // Exactly the total is fine: fully prepaid.
      await typeAmount(view, '20');
      expect(view.queryByTestId(ERROR)).toBeNull();
      expect(view.getByTestId('creation-deposit-remaining').props.children).toBe(formatEuros(0));
      expect(createButton(view)).toBeEnabled();
    });

    it('a discount added after the deposit re-validates it — percentage, then fixed — and never clamps it', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      await reachSummaryWithDepositOpen(view);
      await typeAmount(view, '15');
      expect(createButton(view)).toBeEnabled();

      // 20 € − 50 % = 10 €: the 15 € deposit no longer fits.
      await press(view, 'appointment-discount-toggle');
      await act(async () => {
        fireEvent.press(view.getByLabelText('Réduction de 50 pour cent'));
      });
      expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(10));
      expect(view.getByTestId(ERROR).props.children).toBe(
        `L’acompte ne peut pas dépasser le reste à encaisser (${formatEuros(10)}).`,
      );
      expect(summaryText(view)).toBe('Aucun');
      expect(view.getByTestId(AMOUNT).props.value).toBe('15');
      expect(createButton(view)).toBeDisabled();

      // The discount removed: the same typed amount is valid again.
      await press(view, 'appointment-discount-clear');
      expect(view.queryByTestId(ERROR)).toBeNull();
      expect(summaryText(view)).toBe(`${formatEuros(15)} · Carte`);
      expect(createButton(view)).toBeEnabled();

      // A fixed 7,50 € discount: 12,50 € expected, the deposit is lowered by hand.
      await act(async () => {
        fireEvent.press(view.getByLabelText('Réduction en euros'));
      });
      await act(async () => {
        fireEvent.changeText(view.getByTestId('appointment-discount-entry-input'), '7,50');
      });
      expect(view.getByTestId(ERROR)).toBeTruthy();
      await typeAmount(view, '12,50');
      expect(view.queryByTestId(ERROR)).toBeNull();
      expect(view.getByTestId('creation-deposit-expected-total').props.children).toBe(formatEuros(12.5));
      expect(view.getByTestId('creation-deposit-remaining').props.children).toBe(formatEuros(0));

      await createAppointment(view);

      expect(view.getByTestId('last-appointment-discount').props.children).toBe('{"type":"FIXED","amountCents":750}');
      expect(storedDeposits(database)).toEqual([expect.objectContaining({ amountCents: 1250, paymentMethod: 'CARD' })]);
    });

    it('a price lowered after the deposit re-validates it; raised again, it is accepted with the same id', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      await reachSummaryWithDepositOpen(view);
      await typeAmount(view, '15');

      await expandService(view, 'Brushing 1');
      await act(async () => {
        fireEvent.changeText(view.getByLabelText('Prix de Brushing 1'), '12');
      });
      expect(view.getByTestId('creation-total').props.children).toBe(formatEuros(12));
      expect(view.getByTestId(ERROR).props.children).toBe(
        `L’acompte ne peut pas dépasser le reste à encaisser (${formatEuros(12)}).`,
      );
      expect(createButton(view)).toBeDisabled();

      await act(async () => {
        fireEvent.changeText(view.getByLabelText('Prix de Brushing 1'), '30');
      });
      expect(view.queryByTestId(ERROR)).toBeNull();
      expect(view.getByTestId('creation-deposit-remaining').props.children).toBe(formatEuros(15));
      expect(createButton(view)).toBeEnabled();

      await createAppointment(view);

      expect(storedDeposits(database)).toEqual([expect.objectContaining({ amountCents: 1500 })]);
      expect(view.getByTestId('appointments-probe').props.children).toContain('Brushing 1:30:30');
    });

    it('the draft survives the steps backward and forward, and a changed Client', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      await reachSummaryWithDepositOpen(view);
      await typeAmount(view, '15');
      await press(view, 'creation-deposit-method-cash');

      await press(view, 'edit-client');
      await tapClient(view, 'Léa Martin');
      await act(async () => {
        fireEvent.press(view.getByText('Continuer'));
      });
      await continueToSummary(view);

      expect(summaryText(view)).toBe(`${formatEuros(15)} · Espèces`);
      await press(view, 'edit-services');
      await continueToSummary(view);
      expect(summaryText(view)).toBe(`${formatEuros(15)} · Espèces`);

      await createAppointment(view);

      expect(view.getByTestId('last-appointment-client-id').props.children).toBe('client-agenda-lea');
      expect(storedDeposits(database)).toEqual([expect.objectContaining({ amountCents: 1500, paymentMethod: 'CASH' })]);
    });

    it('« Aucun acompte » removes the draft: the Appointment is created without one', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      await reachSummaryWithDepositOpen(view);
      await typeAmount(view, '15');
      mockSelectionHaptic.mockClear();

      await press(view, 'creation-deposit-clear');

      expect(summaryText(view)).toBe('Aucun');
      expect(view.getByTestId(AMOUNT).props.value).toBe('');
      expect(view.queryByTestId('creation-deposit-position')).toBeNull();
      expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);

      await createAppointment(view);

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(storedDeposits(database)).toEqual([]);
    });

    it('cancelling the creation writes nothing — no Appointment, no deposit', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      const before = loadAppointments(database).length;
      await reachSummaryWithDepositOpen(view);
      await typeAmount(view, '15');

      await act(async () => {
        fireEvent.press(view.getByLabelText('Annuler la création'));
      });

      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(loadAppointments(database)).toHaveLength(before);
      expect(storedDeposits(database)).toEqual([]);
      expect(view.getByTestId('deposits-probe').props.children).toBe('');
    });

    it('tapping « Créer le rendez-vous » twice creates ONE Appointment and ONE deposit', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      const before = loadAppointments(database).length;
      await reachSummaryWithDepositOpen(view);
      await typeAmount(view, '15');

      await act(async () => {
        fireEvent.press(createButton(view));
        fireEvent.press(createButton(view));
      });
      await createAppointment(view);

      expect(loadAppointments(database)).toHaveLength(before + 1);
      expect(storedDeposits(database)).toHaveLength(1);
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it('a failed write saves nothing, says so, and lets her try again with the same deposit', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      const before = loadAppointments(database).length;
      await reachSummaryWithDepositOpen(view);
      await typeAmount(view, '15');
      const failingWrite = jest.spyOn(depositStore, 'insertAppointmentDeposit').mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      await createAppointment(view);
      failingWrite.mockRestore();

      expect(mockAlert).toHaveBeenCalledWith(PERSISTENCE_FAILURE_TITLE, expect.any(String));
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockSuccessHaptic).not.toHaveBeenCalled();
      expect(loadAppointments(database)).toHaveLength(before);
      expect(storedDeposits(database)).toEqual([]);
      expect(view.getByTestId('deposits-probe').props.children).toBe('');
      // The draft is intact and the action available again.
      expect(summaryText(view)).toBe(`${formatEuros(15)} · Carte`);
      expect(createButton(view)).toBeEnabled();

      await createAppointment(view);

      expect(loadAppointments(database)).toHaveLength(before + 1);
      expect(storedDeposits(database)).toEqual([expect.objectContaining({ amountCents: 1500 })]);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('the no-show warning never fills the deposit in: it stays « Aucun » and creating writes none', async () => {
      const database = openTestDatabase();
      const view = await renderCreation(database);
      await press(view, 'sofia-no-show-1');
      await selectClientByName(view, 'Sofia Petit');
      await searchService(view, 'brushing 1');
      await selectService(view, 'Brushing 1');
      await continueToSummary(view);

      const warning = within(view.getByTestId('appointment-creation-actions')).getByTestId('appointment-no-show-warning');
      expect(within(warning).getByText('1 absence enregistrée. Pensez à demander un acompte.')).toBeTruthy();
      expect(within(warning).queryByRole('button')).toBeNull();
      expect(summaryText(view)).toBe('Aucun');
      expect(view.queryByTestId(AMOUNT)).toBeNull();
      expect(createButton(view)).toBeEnabled();

      await createAppointment(view);

      expect(view.getByTestId('deposits-probe').props.children).toBe('');
      expect(storedDeposits(database)).toEqual([]);
    });

    it('offers no deposit for an Appointment of a previous day: it is finalized on save', async () => {
      const database = openTestDatabase();
      const view = await render(creationTree(0, database, new Date(2026, 7, 9, 10, 0)));
      await selectClientBeyond60(view);
      await searchService(view, 'brushing 1');
      await selectService(view, 'Brushing 1');
      await continueToSummary(view);

      expect(view.getByTestId('appointment-discount')).toBeTruthy();
      expect(view.queryByTestId(DEPOSIT)).toBeNull();

      await createAppointment(view);

      const appointmentId = view.getByTestId('last-appointment-id').props.children as string;
      expect(loadAppointments(database).find((appointment) => appointment.id === appointmentId)?.status).toBe('COMPLETED');
      expect(storedDeposits(database)).toEqual([]);
    });
  });
});

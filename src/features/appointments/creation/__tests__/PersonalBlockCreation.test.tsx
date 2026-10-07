// BeautIzzy — Appointment creation: the « Client | Personnel » type choice
//
// The sheet still opens on the unchanged client flow. « Personnel » replaces it
// by ONE direct form that blocks the slot as unavailable — a Calendar Block:
// no client, no service, no price. Proves the two drafts never meet, and that
// a client Appointment cannot be created into a block of the same staff member.

import { act, fireEvent, render } from '@testing-library/react-native';

import type { CalendarBlock } from '@/domain/calendar-blocks';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import { loadAppointments } from '@/persistence/stores/appointments';
import { insertCalendarBlock, loadCalendarBlocks } from '@/persistence/stores/calendar-blocks';
import { loadSales } from '@/persistence/stores/sales';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { settleWheelOn } from '@/shared/ui/testing/wheels';

import { AppointmentCreationScreen } from '../AppointmentCreationScreen';

const mockBack = jest.fn();
const mockReducedMotion = false;
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
    useReducedMotion: () => mockReducedMotion,
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

// 25 août 2026, 14:30 — what a tap around 14:30 on the Agenda opens.
const startAt = new Date(2026, 7, 25, 14, 30);
const at = (hour: number, minute = 0) => new Date(2026, 7, 25, hour, minute);

type TestDatabase = ReturnType<typeof openTestDatabase>;
type Rendered = Awaited<ReturnType<typeof renderCreation>>;

/** A database that already went through the normal bootstrap, so rows can be added before the screen mounts. */
function openSeededDatabase(): TestDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, () => createDevelopmentSeed(new Date()));
  return database;
}

function existingBlock(overrides: Partial<CalendarBlock> = {}): CalendarBlock {
  return {
    id: 'block-existing',
    businessId: testBusiness.id,
    staffMemberId: 'staff-amelie',
    startAt: at(15),
    endAt: at(16, 30),
    reason: 'Déplacement',
    ...overrides,
  };
}

function renderCreation(database: TestDatabase = openSeededDatabase()) {
  return render(
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <ServiceCatalogProvider>
          <AppointmentSessionProvider>
            <CalendarBlockSessionProvider>
              <AppointmentCreationScreen startAt={startAt} />
            </CalendarBlockSessionProvider>
          </AppointmentSessionProvider>
        </ServiceCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

async function press(view: Rendered, element: ReturnType<Rendered['getByText']>) {
  await act(async () => {
    fireEvent.press(element);
  });
}

async function switchTo(view: Rendered, label: 'Rendez-vous client' | 'Rendez-vous personnel') {
  await press(view, view.getByRole('tab', { name: label }));
}

const timeOf = (view: Rendered, testID: string) =>
  view.getByTestId(`${testID}-value`).props.children as string;

/** Léa + Brushing 1, up to the Résumé of the client flow. */
async function reachClientSummary(view: Rendered) {
  await act(async () => {
    fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'Léa Martin');
  });
  await press(view, view.getByText('Léa Martin'));
  await press(view, view.getByText('Continuer'));
  await act(async () => {
    fireEvent.changeText(view.getByPlaceholderText('Rechercher une prestation'), 'brushing 1');
  });
  await press(view, view.getByRole('button', { name: /^Brushing 1, / }));
  await press(view, view.getByText('Continuer'));
}

// Pinned clock. The development seed places its fixture Appointments on the
// week of `now` (one of them on the first OTHER day of that week); on the
// real clock that day is already past from Tuesday on, so the Appointment
// session would auto-complete it at mount (status change + outbox rows) and
// the assertions would depend on the weekday the suite runs. A Monday 08:00
// leaves every seeded Appointment ahead, far from the dates used below.
const SEED_NOW = new Date(2026, 5, 1, 8, 0);

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.setSystemTime(SEED_NOW);
  mockBack.mockClear();
  mockSuccessHaptic.mockClear();
  mockSelectionHaptic.mockClear();
});

describe('creation type choice', () => {
  it('opens in the existing Client mode, unchanged', async () => {
    const view = await renderCreation();

    expect(view.getByRole('tab', { name: 'Rendez-vous client' }).props.accessibilityState).toEqual({ selected: true });
    expect(view.getByRole('tab', { name: 'Rendez-vous personnel' }).props.accessibilityState).toEqual({ selected: false });
    expect(view.getByRole('header', { name: 'Nouveau rendez-vous' })).toBeTruthy();
    expect(view.getByPlaceholderText('Rechercher un client')).toBeTruthy();
    expect(view.getByText('Prestations')).toBeTruthy();
    expect(view.getByText('Continuer')).toBeTruthy();
    expect(view.queryByTestId('calendar-block-form')).toBeNull();
    expect(view.queryByText('Bloquer le créneau')).toBeNull();
  });

  it('« Personnel » shows ONE direct form: no Client, Prestations or Résumé to walk through', async () => {
    const view = await renderCreation();
    await switchTo(view, 'Rendez-vous personnel');

    expect(view.getByTestId('calendar-block-form')).toBeTruthy();
    // Same header as the Client step: « Annuler » leading, one title.
    expect(view.getByRole('header', { name: 'Indisponible' })).toBeTruthy();
    expect(view.queryByText('CRÉNEAU PERSONNEL')).toBeNull();
    expect(view.getAllByText('Indisponible').length).toBeGreaterThan(0);
    expect(view.getByText('Bloquer le créneau')).toBeTruthy();
    // Every client / service / pricing control is gone.
    expect(view.queryByPlaceholderText('Rechercher un client')).toBeNull();
    expect(view.queryByText('Prestations')).toBeNull();
    expect(view.queryByText('Résumé')).toBeNull();
    expect(view.queryByText('Continuer')).toBeNull();
    expect(view.queryByText('Créer le rendez-vous')).toBeNull();
    expect(view.queryByText(/Réduction/)).toBeNull();
    expect(view.queryByText(/€/)).toBeNull();
    expect(view.queryByTestId('appointment-creation-actions')).toBeNull();
    // One switch = the shared SegmentedControl's own single selection haptic.
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
  });

  it('inherits the Agenda start time and proposes an end 30 minutes later, on that day', async () => {
    const view = await renderCreation();
    await switchTo(view, 'Rendez-vous personnel');

    expect(timeOf(view, 'calendar-block-start')).toBe('14:30');
    expect(timeOf(view, 'calendar-block-end')).toBe('15:00');
    expect(view.getByTestId('calendar-block-date-value').props.children).toBe('Mar. 25 août');
  });

  it('is fully labelled for assistive technologies', async () => {
    const view = await renderCreation();
    await switchTo(view, 'Rendez-vous personnel');

    // Date is information, never an action; Début / Fin are the two buttons.
    const date = view.getByLabelText('Date, mardi 25 août');
    expect(date.props.accessibilityRole).toBeUndefined();
    expect(view.getByRole('button', { name: 'Début, 14 heures 30' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Fin, 15 heures' })).toBeTruthy();
    expect(view.getByText('Motif')).toBeTruthy();
    expect(view.getAllByRole('radio').map((chip) => chip.props.accessibilityLabel)).toEqual([
      'Pause',
      'Personnel',
      'Déplacement',
      'Administratif',
      'Formation',
      'Autre',
    ]);
    expect(view.getByRole('button', { name: 'Bloquer le créneau' })).toBeTruthy();
  });
});

describe('blocking a slot', () => {
  it('a reason shortcut + save creates the block — and NO client Appointment, payment or Sale', async () => {
    const database = openSeededDatabase();
    const appointmentsBefore = loadAppointments(database);
    const view = await renderCreation(database);
    await switchTo(view, 'Rendez-vous personnel');
    mockSelectionHaptic.mockClear();

    await press(view, view.getByRole('radio', { name: 'Déplacement' }));
    expect(view.getByRole('radio', { name: 'Déplacement' }).props.accessibilityState).toEqual({ selected: true });
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
    // Re-tapping the chosen chip is not a new choice: no second tick.
    await press(view, view.getByRole('radio', { name: 'Déplacement' }));
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);

    await press(view, view.getByText('Bloquer le créneau'));

    expect(loadCalendarBlocks(database)).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        businessId: testBusiness.id,
        staffMemberId: 'staff-amelie',
        startAt: at(14, 30),
        endAt: at(15),
        reason: 'Déplacement',
      },
    ]);
    expect(loadAppointments(database)).toEqual(appointmentsBefore);
    expect(loadSales(database)).toEqual([]);
    expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('« Autre » opens a focused free-text field, and what is typed becomes the reason', async () => {
    const database = openSeededDatabase();
    const view = await renderCreation(database);
    await switchTo(view, 'Rendez-vous personnel');

    expect(view.queryByTestId('calendar-block-custom-reason')).toBeNull();
    await press(view, view.getByRole('radio', { name: 'Autre' }));
    const field = view.getByTestId('calendar-block-custom-reason');
    expect(field.props.autoFocus).toBe(true);
    expect(field.props.accessibilityLabel).toBe('Motif');

    await act(async () => {
      fireEvent.changeText(field, '  Rendez-vous   médical ');
    });
    await press(view, view.getByText('Bloquer le créneau'));

    expect(loadCalendarBlocks(database).map((block) => block.reason)).toEqual(['Rendez-vous médical']);
  });

  it('asks for a reason inline — no dialog, nothing saved, no empty reason', async () => {
    const database = openSeededDatabase();
    const view = await renderCreation(database);
    await switchTo(view, 'Rendez-vous personnel');

    expect(view.queryByText('Indiquez un motif pour ce créneau.')).toBeNull();
    await press(view, view.getByText('Bloquer le créneau'));

    expect(view.getByText('Indiquez un motif pour ce créneau.')).toBeTruthy();
    expect(loadCalendarBlocks(database)).toEqual([]);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockSuccessHaptic).not.toHaveBeenCalled();

    // « Autre » left blank is still no reason.
    await press(view, view.getByRole('radio', { name: 'Autre' }));
    await press(view, view.getByText('Bloquer le créneau'));
    expect(view.getByText('Indiquez un motif pour ce créneau.')).toBeTruthy();
    expect(loadCalendarBlocks(database)).toEqual([]);

    // Choosing a suggestion clears it.
    await press(view, view.getByRole('radio', { name: 'Pause' }));
    expect(view.queryByText('Indiquez un motif pour ce créneau.')).toBeNull();
  });

  it('chooses start and end on the shared 5-minute wheels; the end follows a moved start', async () => {
    const database = openSeededDatabase();
    const view = await renderCreation(database);
    await switchTo(view, 'Rendez-vous personnel');

    await press(view, view.getByTestId('calendar-block-start'));
    await settleWheelOn(view, 'calendar-block-start-wheel-hour', '10');
    await settleWheelOn(view, 'calendar-block-start-wheel-minute', '10');
    expect(timeOf(view, 'calendar-block-start')).toBe('10:10');
    expect(timeOf(view, 'calendar-block-end')).toBe('10:40');

    await press(view, view.getByTestId('calendar-block-end'));
    await settleWheelOn(view, 'calendar-block-end-wheel-hour', '11');
    await settleWheelOn(view, 'calendar-block-end-wheel-minute', '25');
    await press(view, view.getByTestId('calendar-block-time-done'));
    expect(view.queryByTestId('calendar-block-end-wheel')).toBeNull();

    await press(view, view.getByRole('radio', { name: 'Pause' }));
    await press(view, view.getByText('Bloquer le créneau'));

    expect(loadCalendarBlocks(database)).toEqual([
      expect.objectContaining({ startAt: at(10, 10), endAt: at(11, 25), reason: 'Pause' }),
    ]);
  });

  it('refuses an end that is not after the start, inline, and disables the save', async () => {
    const database = openSeededDatabase();
    const view = await renderCreation(database);
    await switchTo(view, 'Rendez-vous personnel');
    await press(view, view.getByRole('radio', { name: 'Pause' }));

    await press(view, view.getByTestId('calendar-block-end'));
    await settleWheelOn(view, 'calendar-block-end-wheel-hour', '13');

    expect(view.getByText("L'heure de fin doit être après l'heure de début.")).toBeTruthy();
    expect(timeOf(view, 'calendar-block-start')).toBe('14:30'); // never silently moved
    expect(view.getByTestId('calendar-block-submit').props.accessibilityState).toMatchObject({ disabled: true });
    await press(view, view.getByText('Bloquer le créneau'));
    expect(loadCalendarBlocks(database)).toEqual([]);
  });
});

describe('schedule conflicts while blocking a slot', () => {
  it('refuses a block overlapping another block of the same professional, with the reason in the way', async () => {
    const database = openSeededDatabase();
    insertCalendarBlock(database, existingBlock({ startAt: at(14), endAt: at(15) }));
    const view = await renderCreation(database);
    await switchTo(view, 'Rendez-vous personnel');
    await press(view, view.getByRole('radio', { name: 'Pause' }));

    expect(view.getByText('Ce créneau est marqué comme indisponible de 14:00 à 15:00.')).toBeTruthy();
    expect(view.getByText('Indisponible — Déplacement')).toBeTruthy();
    expect(view.getByTestId('calendar-block-submit').props.accessibilityState).toMatchObject({ disabled: true });
    await press(view, view.getByText('Bloquer le créneau'));
    expect(loadCalendarBlocks(database)).toHaveLength(1);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('accepts an adjacent block: 14:30 right after one ending at 14:30', async () => {
    const database = openSeededDatabase();
    insertCalendarBlock(database, existingBlock({ startAt: at(13, 30), endAt: at(14, 30) }));
    const view = await renderCreation(database);
    await switchTo(view, 'Rendez-vous personnel');
    await press(view, view.getByRole('radio', { name: 'Pause' }));

    expect(view.queryByTestId('calendar-block-conflict')).toBeNull();
    await press(view, view.getByText('Bloquer le créneau'));
    expect(loadCalendarBlocks(database)).toHaveLength(2);
  });

  it('ignores the block of ANOTHER staff member', async () => {
    const database = openSeededDatabase();
    insertCalendarBlock(database, existingBlock({ staffMemberId: 'staff-other', startAt: at(14), endAt: at(16) }));
    const view = await renderCreation(database);
    await switchTo(view, 'Rendez-vous personnel');

    expect(view.queryByTestId('calendar-block-conflict')).toBeNull();
  });
});

describe('data separation between the two modes', () => {
  it('Personnel → Client: no personal reason or interval reaches the client Appointment, and no block is created', async () => {
    const database = openSeededDatabase();
    const appointmentsBefore = loadAppointments(database).length;
    const view = await renderCreation(database);

    await switchTo(view, 'Rendez-vous personnel');
    await press(view, view.getByRole('radio', { name: 'Autre' }));
    await act(async () => {
      fireEvent.changeText(view.getByTestId('calendar-block-custom-reason'), 'Dentiste');
    });
    await switchTo(view, 'Rendez-vous client');
    expect(view.queryByText('Dentiste')).toBeNull();

    await reachClientSummary(view);
    await press(view, view.getByText('Créer le rendez-vous'));

    const created = loadAppointments(database).at(-1);
    expect(loadAppointments(database)).toHaveLength(appointmentsBefore + 1);
    // (A past test date is finalized by the usual previous-day reconciliation: the status is not asserted.)
    expect(created).toMatchObject({ clientId: 'client-agenda-lea', startAt });
    expect(created?.notes).toBeUndefined();
    expect(JSON.stringify(created)).not.toMatch(/Dentiste|Indisponible/);
    expect(loadCalendarBlocks(database)).toEqual([]);
  });

  it('Client → Personnel: a chosen client, service and discount never reach the block', async () => {
    const database = openSeededDatabase();
    const appointmentsBefore = loadAppointments(database);
    const view = await renderCreation(database);

    await reachClientSummary(view);
    await switchTo(view, 'Rendez-vous personnel');
    await press(view, view.getByRole('radio', { name: 'Formation' }));
    await press(view, view.getByText('Bloquer le créneau'));

    expect(loadAppointments(database)).toEqual(appointmentsBefore);
    const [block] = loadCalendarBlocks(database);
    expect(Object.keys(block ?? {}).sort()).toEqual(['businessId', 'endAt', 'id', 'reason', 'staffMemberId', 'startAt']);
    expect(database.getAllSync('SELECT * FROM calendar_blocks')).toEqual([
      expect.not.objectContaining({ client_id: expect.anything() }),
    ]);
  });

  it('switching back to Client restores the untouched client flow, draft included', async () => {
    const view = await renderCreation();
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'Léa Martin');
    });
    await press(view, view.getByText('Léa Martin'));

    await switchTo(view, 'Rendez-vous personnel');
    await switchTo(view, 'Rendez-vous client');

    expect(view.getByPlaceholderText('Rechercher un client')).toBeTruthy();
    expect(view.getAllByText('Léa Martin').length).toBeGreaterThan(0);
    expect(view.getByText('Continuer')).toBeTruthy();
  });
});

describe('a client Appointment cannot be created into a Calendar Block', () => {
  it('explains the block inline on the Résumé and disables the creation until it is resolved', async () => {
    const database = openSeededDatabase();
    const appointmentsBefore = loadAppointments(database).length;
    // Brushing 1 at 14:30 runs into a block starting at 14:40.
    insertCalendarBlock(database, existingBlock({ startAt: at(14, 40), endAt: at(16) }));
    const view = await renderCreation(database);

    await reachClientSummary(view);

    expect(view.getByText('Ce créneau est marqué comme indisponible de 14:40 à 16:00.')).toBeTruthy();
    expect(view.getByText('Indisponible — Déplacement')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Créer le rendez-vous' }).props.accessibilityState).toMatchObject({ disabled: true });
    await press(view, view.getByText('Créer le rendez-vous'));
    expect(loadAppointments(database)).toHaveLength(appointmentsBefore);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('never blocks a slot that belongs to another staff member or another day', async () => {
    const database = openSeededDatabase();
    insertCalendarBlock(database, existingBlock({ id: 'other-staff', staffMemberId: 'staff-other', startAt: at(14), endAt: at(16) }));
    insertCalendarBlock(database, existingBlock({ id: 'other-day', startAt: new Date(2026, 7, 26, 14), endAt: new Date(2026, 7, 26, 16) }));
    const view = await renderCreation(database);

    await reachClientSummary(view);

    expect(view.queryByTestId('appointment-calendar-block-conflict')).toBeNull();
    expect(view.getByRole('button', { name: 'Créer le rendez-vous' }).props.accessibilityState).not.toMatchObject({ disabled: true });
  });
});

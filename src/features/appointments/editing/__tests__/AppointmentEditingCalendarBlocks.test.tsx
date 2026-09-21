// Souris — Appointment editing vs Calendar Blocks
//
// A client Appointment cannot be MOVED into personal unavailability of its
// staff member — judged on the staff-required phases only — while an edit that
// leaves the schedule alone is never held back.

import { act, fireEvent, render } from '@testing-library/react-native';

import type { CalendarBlock } from '@/domain/calendar-blocks';
import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import { loadAppointments } from '@/persistence/stores/appointments';
import { insertCalendarBlock } from '@/persistence/stores/calendar-blocks';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { settleWheelOn } from '@/shared/ui/testing/wheels';

import { AppointmentEditingScreen } from '../AppointmentEditingScreen';

const mockBack = jest.fn();
jest.spyOn(haptics, 'success').mockImplementation();
jest.spyOn(haptics, 'selection').mockImplementation();

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
    Extrapolation: { CLAMP: 'clamp' },
    SlideOutRight: createAnimationBuilder(),
    interpolate: (value: number, input: number[], output: number[]) =>
      value <= input[0] ? output[0] : output[output.length - 1],
    useAnimatedStyle: (style: () => object) => style(),
    // Runs the reaction on every render with the current shared values.
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (value: unknown, previous: unknown) => void,
    ) => react(prepare(), null),
    useEvent: () => () => undefined,
    useReducedMotion: () => false,
    // Stable across renders, like the real hook.
    useSharedValue: (init: unknown) => {
      const [shared] = React.useState(() => {
        const holder = {
          value: init,
          get: () => holder.value,
          set: (next: unknown) => {
            holder.value = next;
          },
        };
        return holder;
      });
      return shared;
    },
    withTiming: (value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withDelay: (_delay: number, value: unknown) => value,
    cancelAnimation: () => undefined,
  };
});

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  jest.requireActual('@/shared/ui/testing/mock-reanimated-swipeable'),
);

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    DateTimePicker: (props: {
      readonly onValueChange?: (event: unknown, date: Date) => void;
      readonly value: Date;
    }) =>
      React.createElement(
        Pressable,
        {
          testID: 'mock-date-picker',
          onPress: () => {
            const nextDate = new Date(props.value);
            nextDate.setDate(nextDate.getDate() + 1);
            props.onValueChange?.({}, nextDate);
          },
        },
      ),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View: NativeView } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(NativeView, props, children),
  };
});

type TestDatabase = ReturnType<typeof openTestDatabase>;

// agenda-sofia (development seed): 14:00 — Application 30 min (staff),
// Temps de pose 55 min (unattended), Patine & finition 30 min (staff).
//   busy 14:00–14:30 · free 14:30–15:25 · busy 15:25–15:55
function openDatabaseWithBlock(
  interval: (day: Date) => Pick<CalendarBlock, 'startAt' | 'endAt'>,
  staffMemberId = 'staff-amelie',
) {
  const database = openTestDatabase();
  bootstrapPersistence(database, () => createDevelopmentSeed(new Date()));
  const sofia = loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia');
  if (!sofia) throw new Error('fixture agenda-sofia missing');
  insertCalendarBlock(database, {
    id: 'block-pause',
    businessId: testBusiness.id,
    staffMemberId,
    reason: 'Pause',
    ...interval(sofia.startAt),
  });
  return { database, sofiaStartAt: sofia.startAt };
}

const onDay = (day: Date, hour: number, minute: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);

/** A pause taken entirely inside Sofia's processing time: legitimate. */
const duringProcessing = (day: Date) => ({ startAt: onDay(day, 14, 35), endAt: onDay(day, 15, 20) });

function renderEditor(database: TestDatabase) {
  return render(
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <ServiceCatalogProvider>
          <AppointmentSessionProvider>
            <CalendarBlockSessionProvider>
              <AppointmentEditingScreen appointmentId="agenda-sofia" />
            </CalendarBlockSessionProvider>
          </AppointmentSessionProvider>
        </ServiceCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

type Rendered = Awaited<ReturnType<typeof renderEditor>>;

async function moveStartTo(view: Rendered, hour: string, minute: string) {
  await act(async () => {
    fireEvent.press(view.getByLabelText("Changer l'heure"));
  });
  await settleWheelOn(view, 'start-time-wheel-hour', hour);
  await settleWheelOn(view, 'start-time-wheel-minute', minute);
}

const saveState = (view: Rendered) => view.getByTestId('save-appointment-edit').props.accessibilityState;

beforeEach(() => mockBack.mockClear());

describe('Appointment editing vs Calendar Blocks', () => {
  it('lets processing time cross a block: only staff-required phases count', async () => {
    const { database } = openDatabaseWithBlock(duringProcessing);
    const view = await renderEditor(database);

    // 13:55 → busy 13:55–14:25 · free 14:25–15:20 · busy 15:20–15:50: the
    // 14:35–15:20 pause still sits inside the unattended phase.
    await moveStartTo(view, '13', '55');

    expect(view.queryByTestId('appointment-calendar-block-conflict')).toBeNull();
    expect(saveState(view).disabled).toBe(false);
  });

  it('refuses to move a staff-required phase into the block, inline, and disables the save', async () => {
    const { database, sofiaStartAt } = openDatabaseWithBlock(duringProcessing);
    const view = await renderEditor(database);

    // 14:10 → Application 14:10–14:40 runs into the 14:35 pause.
    await moveStartTo(view, '14', '10');

    expect(view.getByText('Ce créneau est marqué comme indisponible de 14:35 à 15:20.')).toBeTruthy();
    expect(view.getByText('Indisponible — Pause')).toBeTruthy();
    expect(saveState(view).disabled).toBe(true);
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });
    expect(loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia')?.startAt).toEqual(sofiaStartAt);
    expect(mockBack).not.toHaveBeenCalled();

    // Resolving the conflict re-enables the save.
    await settleWheelOn(view, 'start-time-wheel-minute', '0');
    await settleWheelOn(view, 'start-time-wheel-hour', '16');
    expect(view.queryByTestId('appointment-calendar-block-conflict')).toBeNull();
    expect(saveState(view).disabled).toBe(false);
  });

  it('never holds back an edit that leaves the schedule alone, even over a pre-existing overlap', async () => {
    // A block another device created right over Sofia's Application phase.
    const { database } = openDatabaseWithBlock((day) => ({ startAt: onDay(day, 14, 0), endAt: onDay(day, 14, 20) }));
    const view = await renderEditor(database);

    expect(view.queryByTestId('appointment-calendar-block-conflict')).toBeNull();
    expect(saveState(view).disabled).toBe(true); // nothing changed yet

    // A price-only edit moves nothing on the schedule: it saves.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage'), '90');
    });
    expect(view.queryByTestId('appointment-calendar-block-conflict')).toBeNull();
    expect(saveState(view).disabled).toBe(false);
    await act(async () => {
      fireEvent.press(view.getByTestId('save-appointment-edit'));
    });
    expect(
      loadAppointments(database).find((appointment) => appointment.id === 'agenda-sofia')?.items[0]?.price,
    ).toBe(90);
  });

  it('judges the staff-required intervals themselves: moving them is refused, restoring them lifts the check', async () => {
    // The block covers Sofia's Application; her final phase is staff-required,
    // so shortening the unattended Pose DOES move it — and is refused…
    const { database } = openDatabaseWithBlock((day) => ({ startAt: onDay(day, 14, 0), endAt: onDay(day, 14, 20) }));
    const view = await renderEditor(database);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Développer Balayage'));
    });

    await act(async () => {
      fireEvent.press(view.getByTestId('phase-duration-sofia-processing-decrement'));
    });
    expect(view.getByTestId('appointment-calendar-block-conflict')).toBeTruthy();
    expect(saveState(view).disabled).toBe(true);

    // …while putting it back restores identical intervals: nothing to check, even over that overlap.
    await act(async () => {
      fireEvent.press(view.getByTestId('phase-duration-sofia-processing-increment'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prix de Balayage'), '90');
    });
    expect(view.queryByTestId('appointment-calendar-block-conflict')).toBeNull();
    expect(saveState(view).disabled).toBe(false);
  });

  it('ignores the block of another staff member', async () => {
    const { database } = openDatabaseWithBlock(duringProcessing, 'staff-other');
    const view = await renderEditor(database);

    await moveStartTo(view, '14', '10');

    expect(view.queryByTestId('appointment-calendar-block-conflict')).toBeNull();
    expect(saveState(view).disabled).toBe(false);
  });
});

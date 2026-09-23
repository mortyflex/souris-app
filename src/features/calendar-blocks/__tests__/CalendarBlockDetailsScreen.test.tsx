// Souris — Calendar Block details, editing and deletion
//
// The dedicated sheet a tap on an « Indisponible » block opens: reason, date,
// time — « ••• » (Modifier, Supprimer) and × — and nothing a client
// Appointment has.

import { act, fireEvent, render, within } from "@testing-library/react-native";
import { Alert } from "react-native";

import type { CalendarBlock } from "@/domain/calendar-blocks";
import { AppointmentSessionProvider } from "@/features/appointments/session/AppointmentSessionProvider";
import { bootstrapPersistence } from "@/persistence/bootstrap";
import { loadAppointments } from "@/persistence/stores/appointments";
import { bindLocalDatabaseToBusiness } from "@/persistence/stores/business-profile";
import { insertCalendarBlock, loadCalendarBlocks } from "@/persistence/stores/calendar-blocks";
import { loadSyncOutbox } from "@/persistence/sync/outbox";
import { remoteBusinessProfile, REMOTE_BUSINESS_ID } from "@/persistence/testing/fixtures";
import { openTestDatabase } from "@/persistence/testing/node-sqlite-database";
import { createDevelopmentSeed } from "@/providers/development-seed";
import { TestPersistenceProvider } from "@/providers/testing/TestPersistenceProvider";
import { haptics } from "@/shared/lib/haptics";
import { settleSheetTransition } from "@/shared/ui/testing/sheet-transitions";
import { settleWheelOn } from "@/shared/ui/testing/wheels";

import { CalendarBlockDetailsScreen } from "../details/CalendarBlockDetailsScreen";
import { CalendarBlockSessionProvider } from "../session/CalendarBlockSessionProvider";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockWarningHaptic = jest.spyOn(haptics, "warning").mockImplementation();
const mockSuccessHaptic = jest.spyOn(haptics, "success").mockImplementation();
jest.spyOn(haptics, "selection").mockImplementation();
const mockAlert = jest.spyOn(Alert, "alert").mockImplementation();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));

// SheetScreen (content fit) holds the route's removal while the sheet slides down.
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));

// The preset Modal mock never reports dismissal; this one mirrors the iOS
// contract (onDismiss once `visible` has dropped), so the « ••• » action list
// chains its action exactly as on device.
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual("react-native") as typeof import("react-native");

  interface MockModalProps {
    readonly visible?: boolean;
    readonly onDismiss?: () => void;
    readonly children?: React.ReactNode;
  }

  class MockModal extends React.Component<MockModalProps> {
    componentDidUpdate(previous: MockModalProps) {
      if (previous.visible && !this.props.visible) this.props.onDismiss?.();
    }

    render() {
      return this.props.visible ? React.createElement(View, null, this.props.children) : null;
    }
  }

  return { __esModule: true, default: MockModal };
});

jest.mock("react-native-reanimated", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View: NativeView } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");

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
    SlideOutRight: createAnimationBuilder(),
    Extrapolation: { CLAMP: "clamp" },
    useAnimatedStyle: (style: () => object) => style(),
    // Runs the reaction on every render with the current shared values.
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (value: unknown, previous: unknown) => void,
    ) => react(prepare(), null),
    useEvent: () => () => undefined,
    useReducedMotion: () => false,
    // Stable across renders, like the real hook; readable as `.value` too.
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

jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) => fn(...args),
}));

jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () =>
  jest.requireActual("@/shared/ui/testing/mock-reanimated-swipeable"),
);

jest.mock("expo-symbols", () => ({
  SymbolView: () => null,
}));

jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View: NativeView } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");
  return {
    SafeAreaView: ({
      children,
      ...props
    }: {
      readonly children?: React.ReactNode;
    }) => React.createElement(NativeView, props, children),
  };
});

// A fixed Monday far from the development seed, whose fixture Appointments
// live on the day the suite runs (they would be real schedule conflicts).
const at = (hour: number, minute = 0) => new Date(2027, 2, 15, hour, minute);

const travel: CalendarBlock = {
  id: "block-travel",
  businessId: REMOTE_BUSINESS_ID,
  staffMemberId: "staff-amelie",
  startAt: at(10),
  endAt: at(11, 30),
  reason: "Déplacement",
};

type TestDatabase = ReturnType<typeof openTestDatabase>;

/** A BOUND device (so deletions leave their outbox tombstone intent), seeded, holding `blocks`. */
function openDatabase(blocks: readonly CalendarBlock[] = [travel]): TestDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, () => createDevelopmentSeed(new Date()));
  bindLocalDatabaseToBusiness(database, remoteBusinessProfile);
  for (const block of blocks) insertCalendarBlock(database, block);
  database.runSync("DELETE FROM sync_outbox");
  return database;
}

function renderDetails(database: TestDatabase, calendarBlockId: string | undefined = travel.id) {
  return render(
    <TestPersistenceProvider database={database}>
      <AppointmentSessionProvider>
        <CalendarBlockSessionProvider>
          <CalendarBlockDetailsScreen calendarBlockId={calendarBlockId} />
        </CalendarBlockSessionProvider>
      </AppointmentSessionProvider>
    </TestPersistenceProvider>,
  );
}

type Rendered = Awaited<ReturnType<typeof renderDetails>>;

async function press(view: Rendered, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

/** Opens « ••• », chooses one action and lets the list close so the action runs. */
async function chooseAction(view: Rendered, testID: string) {
  await press(view, "open-calendar-block-actions");
  await settleSheetTransition();
  await press(view, testID);
  await settleSheetTransition();
}

const timeOf = (view: Rendered, testID: string) =>
  view.getByTestId(`${testID}-value`).props.children as string;

// Pinned clock. The development seed places its fixture Appointments on the
// week of `now` (one of them on the first OTHER day of that week); on the
// real clock that day is already past from Tuesday on, so the Appointment
// session would auto-complete it at mount (status change + outbox rows) and
// the assertions would depend on the weekday the suite runs. A Monday 08:00
// leaves every seeded Appointment ahead, far from the dates used below.
const SEED_NOW = new Date(2026, 5, 1, 8, 0);

beforeAll(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  jest.setSystemTime(SEED_NOW);
  mockPush.mockClear();
  mockBack.mockClear();
  mockWarningHaptic.mockClear();
  mockSuccessHaptic.mockClear();
  mockAlert.mockClear();
});

describe("Calendar Block details", () => {
  it("states that the slot is unavailable, with its reason, date and time", async () => {
    const view = await renderDetails(openDatabase());

    expect(view.getByRole("header", { name: "Indisponible" })).toBeTruthy();
    expect(view.getByText("Motif")).toBeTruthy();
    expect(view.getByText("Déplacement")).toBeTruthy();
    expect(view.getByText("Lundi 15 mars")).toBeTruthy();
    expect(view.getByText("10:00 – 11:30")).toBeTruthy();
    expect(
      view.getByLabelText("Indisponible, Déplacement, de 10 heures à 11 heures 30, Lundi 15 mars"),
    ).toBeTruthy();
  });

  it("uses the detail header of Appointment Details: « Indisponible » leading, then « ••• » and ×", async () => {
    const view = await renderDetails(openDatabase());

    const header = within(view.getByTestId("calendar-block-detail-header"));
    expect(header.getByRole("header", { name: "Indisponible" })).toBeTruthy();
    expect(header.getByTestId("open-calendar-block-actions").props.accessibilityLabel).toBe("Actions");
    expect(header.getByTestId("close-calendar-block-details").props.accessibilityLabel).toBe("Fermer");
    expect(view.queryByText("Fermer")).toBeNull();
    expect(view.queryByText("CRÉNEAU PERSONNEL")).toBeNull();
  });

  it("keeps Modifier and Supprimer behind « ••• » — and offers no client, checkout, discount or sale action", async () => {
    const view = await renderDetails(openDatabase());

    // The sheet body is the card alone: no large action below it.
    expect(view.queryByTestId("modify-calendar-block")).toBeNull();
    expect(view.queryByTestId("open-calendar-block-deletion")).toBeNull();
    for (const absent of [/Encaisser/, /Réduction/, /Revente/, /Vendre/, /Absence/, /Annuler/, /Prestations/, /Total/, /€/]) {
      expect(view.queryByText(absent)).toBeNull();
    }
    expect(view.queryByTestId("checkout-appointment")).toBeNull();
    expect(view.queryByTestId("appointment-actions")).toBeNull();

    await press(view, "open-calendar-block-actions");
    await settleSheetTransition();
    const actions = within(view.getByTestId("calendar-block-actions-sheet"));
    expect(within(actions.getByTestId("modify-calendar-block")).getByText("Modifier")).toBeTruthy();
    expect(within(actions.getByTestId("open-calendar-block-deletion")).getByText("Supprimer")).toBeTruthy();
  });

  it("× leaves the sheet, without any haptic", async () => {
    const view = await renderDetails(openDatabase());

    await press(view, "close-calendar-block-details");

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockWarningHaptic).not.toHaveBeenCalled();
    expect(mockSuccessHaptic).not.toHaveBeenCalled();
  });

  it("keeps the shared sheet dismissal: the outside tap (and the swipe it shares its policy with) closes it", async () => {
    const view = await renderDetails(openDatabase());
    const scrim = view.getByTestId("sheet-screen-scrim");

    expect(scrim.props.accessibilityState?.disabled).not.toBe(true);
    await press(view, "sheet-screen-scrim");

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("shows a calm state for a block that no longer exists", async () => {
    const view = await renderDetails(openDatabase(), "gone");

    expect(view.getByText("Créneau introuvable")).toBeTruthy();
    expect(view.getByText("Fermer")).toBeTruthy();
  });
});

describe("Calendar Block editing", () => {
  it("opens the same simple form, prefilled, and saves a new start, end and reason", async () => {
    const database = openDatabase();
    const view = await renderDetails(database);

    await chooseAction(view, "modify-calendar-block");

    expect(view.getByRole("header", { name: "Modifier le créneau" })).toBeTruthy();
    expect(timeOf(view, "calendar-block-start")).toBe("10:00");
    expect(timeOf(view, "calendar-block-end")).toBe("11:30");
    expect(view.getByRole("radio", { name: "Déplacement" }).props.accessibilityState).toEqual({ selected: true });
    // Nothing changed yet: nothing to save.
    expect(view.getByTestId("calendar-block-submit").props.accessibilityState).toMatchObject({ disabled: true });
    expect(view.getByText("Enregistrer les modifications")).toBeTruthy();
    expect(view.queryByText(/€|Réduction|Cliente|Prestations/)).toBeNull();

    await press(view, "calendar-block-start");
    await settleWheelOn(view, "calendar-block-start-wheel-hour", "14");
    await press(view, "calendar-block-end");
    await settleWheelOn(view, "calendar-block-end-wheel-hour", "16");
    await settleWheelOn(view, "calendar-block-end-wheel-minute", "0");
    await press(view, "calendar-block-reason-Formation");
    await press(view, "calendar-block-submit");

    expect(loadCalendarBlocks(database)).toEqual([
      { ...travel, startAt: at(14), endAt: at(16), reason: "Formation" },
    ]);
    expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    // Back on the details, showing the saved values.
    expect(view.getByRole("header", { name: "Indisponible" })).toBeTruthy();
    expect(view.getByText("Formation")).toBeTruthy();
    expect(view.getByText("14:00 – 16:00")).toBeTruthy();
    expect(loadSyncOutbox(database, REMOTE_BUSINESS_ID)).toEqual([
      expect.objectContaining({ aggregateType: "CALENDAR_BLOCK", aggregateId: travel.id, operation: "UPSERT" }),
    ]);
  });

  it("reopens a custom reason behind « Autre » without taking the keyboard", async () => {
    const view = await renderDetails(openDatabase([{ ...travel, reason: "Chercher les enfants" }]));

    await chooseAction(view, "modify-calendar-block");

    expect(view.getByRole("radio", { name: "Autre" }).props.accessibilityState).toEqual({ selected: true });
    const field = view.getByTestId("calendar-block-custom-reason");
    expect(field.props.value).toBe("Chercher les enfants");
    expect(field.props.autoFocus).toBe(false);
  });

  it("protects the draft: no outside-tap or swipe dismissal while editing; « Annuler » returns to the details unchanged", async () => {
    const database = openDatabase();
    const view = await renderDetails(database);
    await chooseAction(view, "modify-calendar-block");
    await press(view, "calendar-block-reason-Pause");

    expect(view.getByTestId("sheet-screen-scrim").props.accessibilityState?.disabled).toBe(true);
    await press(view, "cancel-calendar-block-edit");

    expect(view.getByText("Déplacement")).toBeTruthy();
    expect(loadCalendarBlocks(database)).toEqual([travel]);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("never conflicts with itself, but refuses to move onto another block", async () => {
    const database = openDatabase([
      travel,
      { ...travel, id: "block-lunch", startAt: at(12), endAt: at(13), reason: "Pause" },
    ]);
    const view = await renderDetails(database);
    await chooseAction(view, "modify-calendar-block");

    // Shrinking inside its own interval is free.
    await press(view, "calendar-block-end");
    await settleWheelOn(view, "calendar-block-end-wheel-hour", "11");
    await settleWheelOn(view, "calendar-block-end-wheel-minute", "0");
    expect(view.queryByTestId("calendar-block-conflict")).toBeNull();

    // Growing into the lunch block is not.
    await settleWheelOn(view, "calendar-block-end-wheel-hour", "12");
    await settleWheelOn(view, "calendar-block-end-wheel-minute", "30");
    expect(view.getByText("Ce créneau est marqué comme indisponible de 12:00 à 13:00.")).toBeTruthy();
    expect(view.getByText("Indisponible — Pause")).toBeTruthy();
    expect(view.getByTestId("calendar-block-submit").props.accessibilityState).toMatchObject({ disabled: true });

    // Adjacent is fine: ending exactly when lunch starts.
    await settleWheelOn(view, "calendar-block-end-wheel-hour", "12");
    await settleWheelOn(view, "calendar-block-end-wheel-minute", "0");
    expect(view.queryByTestId("calendar-block-conflict")).toBeNull();
  });
});

describe("Calendar Block deletion", () => {
  it("asks for confirmation, then removes the block locally and queues its tombstone", async () => {
    const database = openDatabase();
    const appointmentsBefore = loadAppointments(database);
    const view = await renderDetails(database);

    await chooseAction(view, "open-calendar-block-deletion");
    expect(view.getByText("Supprimer ce créneau ?")).toBeTruthy();
    expect(loadCalendarBlocks(database)).toHaveLength(1);

    await press(view, "confirm-calendar-block-deletion");

    expect(loadCalendarBlocks(database)).toEqual([]);
    expect(loadSyncOutbox(database, REMOTE_BUSINESS_ID)).toEqual([
      expect.objectContaining({ aggregateType: "CALENDAR_BLOCK", aggregateId: travel.id, operation: "DELETE" }),
    ]);
    expect(loadAppointments(database)).toEqual(appointmentsBefore);
    expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
    // The sheet keeps its content while it slides away — no « introuvable » flash.
    expect(view.queryByText("Créneau introuvable")).toBeNull();
  });

  it("« Retour » keeps the block", async () => {
    const database = openDatabase();
    const view = await renderDetails(database);

    await chooseAction(view, "open-calendar-block-deletion");
    await press(view, "cancel-calendar-block-deletion");

    expect(loadCalendarBlocks(database)).toEqual([travel]);
    expect(mockBack).not.toHaveBeenCalled();
  });
});

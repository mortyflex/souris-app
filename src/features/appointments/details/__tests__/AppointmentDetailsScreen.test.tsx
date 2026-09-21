import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  userEvent,
  within,
} from "@testing-library/react-native";
import { Alert, Pressable, StyleSheet, Text } from "react-native";
import { State, type PanGesture } from "react-native-gesture-handler";
import {
  fireGestureHandler,
  getByGestureTestId,
} from "react-native-gesture-handler/jest-utils";

import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from "@/features/appointments/session/AppointmentSessionProvider";
import { CalendarBlockSessionProvider } from "@/features/calendar-blocks/session/CalendarBlockSessionProvider";
import {
  ClientSessionProvider,
  useClientSession,
} from "@/features/clients/session/ClientSessionProvider";
import {
  ProductCatalogProvider,
  useProductCatalog,
} from "@/features/products/session/ProductCatalogProvider";
import {
  SaleSessionProvider,
  useSaleSession,
} from "@/features/sales/session/SaleSessionProvider";
import {
  ServiceCatalogProvider,
  useServiceCatalog,
} from "@/features/services/session/ServiceCatalogProvider";
import type { AppointmentItem } from "@/domain/appointments";
import { getCashRegisterDaySummary } from "@/domain/cash-register";
import { getClientSales } from "@/features/sales/presentation";
import { bootstrapPersistence } from "@/persistence/bootstrap";
import { insertAppointment, loadAppointments } from "@/persistence/stores/appointments";
import { insertCalendarBlock } from "@/persistence/stores/calendar-blocks";
import { findProduct, setProductStock } from "@/persistence/stores/products";
import { completeSale, loadSales } from "@/persistence/stores/sales";
import { openTestDatabase } from "@/persistence/testing/node-sqlite-database";
import { createDevelopmentSeed } from "@/providers/development-seed";
import { haptics } from "@/shared/lib/haptics";
import { formatEuroCents, formatEuros } from "@/shared/lib/money";
import { getAppTextStyle } from "@/shared/ui/AppText";

import { AppointmentDetailsScreen } from "../AppointmentDetailsScreen";
import { TestPersistenceProvider } from "@/providers/testing/TestPersistenceProvider";
import { settleSheetTransition } from "@/shared/ui/testing/sheet-transitions";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockWarningHaptic = jest.spyOn(haptics, "warning").mockImplementation();
const mockSuccessHaptic = jest.spyOn(haptics, "success").mockImplementation();
const mockSelectionHaptic = jest.spyOn(haptics, "selection").mockImplementation();
const mockAlert = jest.spyOn(Alert, "alert").mockImplementation();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useNavigation: () => ({ dispatch: jest.fn() }),
}));

// SheetScreen (content fit) holds the route's removal while the sheet slides down.
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));

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

// Real legacy catalog identities of the development seed.
const MASQUE_ID = "6974bff937a5d89c2d9afbd0"; // Masque réparateur 5 min · 50 €
const CONCENTRATE_ID = "68d802c055b09988d663415f"; // Acidic bonding concentrate · 12 €

function ClientLifecycleProbe() {
  const { archiveClient } = useClientSession();
  return (
    <Pressable
      testID="archive-sofia"
      onPress={() => archiveClient("client-agenda-sofia")}
    />
  );
}

/** Sets Sofia's birthday relative to the local day of HER Appointment (agenda-sofia). */
function BirthdayProbe() {
  const { updateClient } = useClientSession();
  const { getAppointmentById, updateAppointment } = useAppointmentSession();
  const entry = getAppointmentById("agenda-sofia");
  const giveBirthday = (dayOffset: number) => {
    if (!entry) return;
    const day = new Date(entry.appointment.startAt);
    day.setDate(day.getDate() + dayOffset);
    updateClient({
      id: "client-agenda-sofia",
      firstName: "Sofia",
      lastName: "Petit",
      birthday: { month: day.getMonth() + 1, day: day.getDate() },
    });
  };
  return (
    <>
      <Pressable testID="give-sofia-appointment-day-birthday" onPress={() => giveBirthday(0)} />
      <Pressable testID="give-sofia-next-day-birthday" onPress={() => giveBirthday(1)} />
      <Pressable
        testID="complete-sofia-appointment"
        onPress={() => {
          if (!entry) return;
          updateAppointment({ appointment: { ...entry.appointment, status: "COMPLETED" } });
        }}
      />
      <Pressable
        testID="cancel-sofia-appointment"
        onPress={() => {
          if (!entry) return;
          updateAppointment({
            appointment: {
              ...entry.appointment,
              status: "CANCELLED",
              cancellation: { cancelledAt: new Date(), cancelledBy: "CLIENT" },
            },
          });
        }}
      />
    </>
  );
}

function AppointmentPresence({
  appointmentId,
}: {
  readonly appointmentId: string;
}) {
  const { getAppointmentById } = useAppointmentSession();
  const entry = getAppointmentById(appointmentId);
  return (
    <>
      <Text testID="appointment-presence">{entry ? "present" : "missing"}</Text>
      <Text testID="appointment-status">{entry?.appointment.status ?? "none"}</Text>
      <Text testID="appointment-payment-probe">
        {entry?.appointment.payment
          ? `${entry.appointment.payment.cardAmountCents}/${entry.appointment.payment.cashAmountCents}`
          : "none"}
      </Text>
    </>
  );
}

/** Completes Sales through the canonical session: two linked to Sofia's appointment, one not. */
function SaleProbe() {
  const { getProductById, setProductStock } = useProductCatalog();
  const { completeSale, sales } = useSaleSession();
  const { appointments } = useAppointmentSession();
  const completedAt = new Date(2026, 7, 29, 14, 30);
  const caisse = getCashRegisterDaySummary(
    { appointments: appointments.map(({ appointment }) => appointment), sales },
    new Date(2026, 7, 29, 12, 0),
  );
  return (
    <>
      <Text testID="stock-masque">{getProductById(MASQUE_ID)?.stockQuantity ?? "gone"}</Text>
      <Text testID="stock-concentrate">{getProductById(CONCENTRATE_ID)?.stockQuantity ?? "gone"}</Text>
      <Text testID="sale-ids">{sales.map((sale) => sale.id).join(",")}</Text>
      <Text testID="sofia-purchases">
        {getClientSales(sales, "client-agenda-sofia").map((sale) => sale.id).join(",")}
      </Text>
      <Text testID="caisse-day-total">{caisse.totalCents}</Text>
      <Pressable
        testID="stock-products"
        onPress={() => {
          setProductStock(MASQUE_ID, 5);
          setProductStock(CONCENTRATE_ID, 3);
        }}
      />
      <Pressable
        testID="sell-linked-shampoo"
        onPress={() => {
          completeSale({
            id: "sale-linked-a",
            businessId: "business-test",
            clientId: "client-agenda-sofia",
            appointmentId: "agenda-sofia",
            completedAt,
            lines: [{ id: "sale-linked-a-1", productId: MASQUE_ID, quantity: 2 }],
          });
        }}
      />
      <Pressable
        testID="sell-linked-serum"
        onPress={() => {
          completeSale({
            id: "sale-linked-b",
            businessId: "business-test",
            clientId: "client-agenda-sofia",
            appointmentId: "agenda-sofia",
            completedAt,
            lines: [{ id: "sale-linked-b-1", productId: CONCENTRATE_ID, quantity: 1 }],
          });
        }}
      />
      <Pressable
        testID="sell-unlinked"
        onPress={() => {
          completeSale({
            id: "sale-unlinked",
            businessId: "business-test",
            clientId: "client-agenda-sofia",
            completedAt,
            lines: [{ id: "sale-unlinked-1", productId: CONCENTRATE_ID, quantity: 1 }],
          });
        }}
      />
      <Pressable
        testID="sell-linked-mixed"
        onPress={() => {
          completeSale({
            id: "sale-linked-mixed",
            businessId: "business-test",
            clientId: "client-agenda-sofia",
            appointmentId: "agenda-sofia",
            completedAt,
            lines: [
              { id: "sale-linked-mixed-1", productId: MASQUE_ID, quantity: 1 },
              { id: "sale-linked-mixed-2", productId: CONCENTRATE_ID, quantity: 1 },
            ],
          });
        }}
      />
      <Pressable
        testID="sell-linked-shampoo-once"
        onPress={() => {
          completeSale({
            id: "sale-linked-c",
            businessId: "business-test",
            clientId: "client-agenda-sofia",
            appointmentId: "agenda-sofia",
            completedAt: new Date(2026, 7, 29, 14, 45),
            lines: [{ id: "sale-linked-c-1", productId: MASQUE_ID, quantity: 1 }],
          });
        }}
      />
    </>
  );
}

/**
 * Drives THE session discount action on « agenda-sofia » (Balayage 95 €) the
 * way any surface proposing a discount will, and reports a refused write.
 */
function DiscountProbe() {
  const { getAppointmentById, setAppointmentDiscount } = useAppointmentSession();
  const [refused, setRefused] = useState(false);
  const apply = (discount: Parameters<typeof setAppointmentDiscount>[1]) => {
    try {
      setAppointmentDiscount("agenda-sofia", discount);
    } catch {
      setRefused(true);
    }
  };
  return (
    <>
      <Text testID="discount-probe">
        {JSON.stringify(getAppointmentById("agenda-sofia")?.appointment.discount ?? null)}
      </Text>
      <Text testID="discount-refused">{String(refused)}</Text>
      <Pressable testID="apply-percent-discount" onPress={() => apply({ type: "PERCENT", percent: 20 })} />
      <Pressable testID="apply-fixed-discount" onPress={() => apply({ type: "FIXED", amountCents: 1500 })} />
      <Pressable testID="apply-oversized-discount" onPress={() => apply({ type: "FIXED", amountCents: 50000 })} />
      <Pressable testID="clear-discount" onPress={() => apply(undefined)} />
    </>
  );
}

/** Fingerprint of every catalog phase duration: must never move from Details. */
function CatalogProbe() {
  const { services } = useServiceCatalog();
  return (
    <Text testID="catalog-durations">
      {services
        .map((service) => `${service.id}=${service.phases.map((phase) => phase.durationMinutes).join("/")}`)
        .join("|")}
    </Text>
  );
}

/** A future Appointment with two services so item isolation can be observed. */
function MultiServiceProbe() {
  const { addAppointment, getAppointmentById } = useAppointmentSession();
  const entry = getAppointmentById("multi-service-appointment");
  return (
    <>
      <Text testID="multi-service-items">
        {(entry?.appointment.items ?? [])
          .map(
            (item) =>
              `${item.id}:${item.phases.map((phase) => `${phase.id}=${phase.durationMinutes}`).join(",")}`,
          )
          .join("|")}
      </Text>
      <Pressable
        testID="add-multi-service-appointment"
        onPress={() =>
          addAppointment({
            appointment: {
              id: "multi-service-appointment",
              businessId: "business-test",
              clientId: "client-agenda-sofia",
              staffMemberId: "staff-amelie",
              startAt: new Date(2026, 7, 31, 10, 0),
              status: "SCHEDULED",
              items: [
                {
                  id: "ms-coupe",
                  serviceId: "service-cut",
                  order: 0,
                  serviceName: "Coupe",
                  serviceType: "SERVICE",
                  price: 40,
                  phases: [{ id: "ms-coupe-phase", name: "Coupe", durationMinutes: 30, requiresStaff: true }],
                },
                {
                  id: "ms-balayage",
                  serviceId: "service-highlights",
                  order: 1,
                  serviceName: "Balayage",
                  serviceType: "TECHNIQUE",
                  price: 95,
                  phases: [
                    { id: "ms-application", name: "Application", durationMinutes: 45, requiresStaff: true },
                    { id: "ms-pose", name: "Temps de pose", durationMinutes: 40, requiresStaff: false },
                  ],
                },
              ],
            },
          })
        }
      />
    </>
  );
}

/** Coupe 30 € · Balayage 50 € · Brushing 20 €, plus a Concentrate (12 €) Revente probe. */
function ThreeServiceProbe() {
  const { addAppointment, getAppointmentById } = useAppointmentSession();
  const { completeSale } = useSaleSession();
  const entry = getAppointmentById("three-service-appointment");
  return (
    <>
      <Text testID="three-service-items">
        {(entry?.appointment.items ?? [])
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((item) => `${item.id}:${item.order}:${item.phases.map((phase) => phase.durationMinutes).join("/")}`)
          .join("|")}
      </Text>
      <Pressable
        testID="add-three-service-appointment"
        onPress={() =>
          addAppointment({
            appointment: {
              id: "three-service-appointment",
              businessId: "business-test",
              clientId: "client-agenda-sofia",
              staffMemberId: "staff-amelie",
              startAt: new Date(2026, 7, 31, 10, 0),
              status: "SCHEDULED",
              items: [
                {
                  id: "ts-coupe",
                  serviceId: "service-cut",
                  order: 0,
                  serviceName: "Coupe",
                  serviceType: "SERVICE",
                  price: 30,
                  phases: [{ id: "ts-coupe-phase", name: "Coupe", durationMinutes: 30, requiresStaff: true }],
                },
                {
                  id: "ts-balayage",
                  serviceId: "service-highlights",
                  order: 1,
                  serviceName: "Balayage",
                  serviceType: "TECHNIQUE",
                  price: 50,
                  phases: [
                    { id: "ts-application", name: "Application", durationMinutes: 45, requiresStaff: true },
                    { id: "ts-pose", name: "Temps de pose", durationMinutes: 40, requiresStaff: false },
                  ],
                },
                {
                  id: "ts-brushing",
                  serviceId: "service-brushing",
                  order: 2,
                  serviceName: "Brushing",
                  serviceType: "SERVICE",
                  price: 20,
                  phases: [{ id: "ts-brushing-phase", name: "Brushing", durationMinutes: 20, requiresStaff: true }],
                },
              ],
            },
          })
        }
      />
      <Pressable
        testID="sell-concentrate-three-service"
        onPress={() =>
          completeSale({
            id: "sale-three-service",
            businessId: "business-test",
            clientId: "client-agenda-sofia",
            appointmentId: "three-service-appointment",
            completedAt: new Date(2026, 7, 31, 11, 0),
            lines: [{ id: "sale-three-service-1", productId: CONCENTRATE_ID, quantity: 1 }],
          })
        }
      />
    </>
  );
}

/** Drives the shared reorder handle of one Service row: long-press pan, then release. */
function dragServiceRow(itemId: string, translationY: number) {
  fireGestureHandler<PanGesture>(getByGestureTestId(`reorder-${itemId}`), [
    { state: State.BEGAN },
    { state: State.ACTIVE, translationY },
    { translationY },
    { state: State.END, translationY },
  ]);
}

function detailsTree(
  appointmentId: string,
  probes?: React.ReactNode,
  database?: ReturnType<typeof openTestDatabase>,
) {
  return (
    <TestPersistenceProvider database={database}>
      <ClientSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <ServiceCatalogProvider>
              <AppointmentSessionProvider>
                <CalendarBlockSessionProvider>
                  <AppointmentDetailsScreen appointmentId={appointmentId} />
                  <AppointmentPresence appointmentId={appointmentId} />
                  <SaleProbe />
                  <CatalogProbe />
                  {probes}
                </CalendarBlockSessionProvider>
              </AppointmentSessionProvider>
            </ServiceCatalogProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>
  );
}

function renderDetails(
  appointmentId = "agenda-sofia",
  probes?: React.ReactNode,
  database?: ReturnType<typeof openTestDatabase>,
) {
  return render(detailsTree(appointmentId, probes, database));
}

/**
 * Seeds the database and persists one linked Sale (×1) per Product BEFORE
 * the screen renders, so a test can open Details on an Appointment that
 * already has sold Products — the way a real screen instance opens.
 */
function persistLinkedSales(db: ReturnType<typeof openTestDatabase>, productIds: readonly string[]) {
  bootstrapPersistence(db, () => createDevelopmentSeed(new Date()));
  setProductStock(db, MASQUE_ID, 5);
  setProductStock(db, CONCENTRATE_ID, 3);
  const names: Record<string, string> = {
    [MASQUE_ID]: "Masque réparateur 5 min",
    [CONCENTRATE_ID]: "Acidic bonding concentrate",
  };
  productIds.forEach((productId, index) => {
    completeSale(
      db,
      {
        id: `sale-seeded-${index}`,
        businessId: "business-test",
        clientId: "client-agenda-sofia",
        appointmentId: "agenda-sofia",
        completedAt: new Date(2026, 7, 29, 14, 30 + index),
        items: [
          {
            id: `sale-seeded-${index}-1`,
            productId,
            productName: names[productId] ?? productId,
            unitPrice: productId === MASQUE_ID ? 50 : 12,
            quantity: 1,
          },
        ],
      },
      [{ productId, quantity: 1 }],
    );
  });
}

async function stepPose(view: Awaited<ReturnType<typeof render>>, phaseId: string, times: number) {
  const action = times < 0 ? "decrement" : "increment";
  for (let index = 0; index < Math.abs(times); index += 1) {
    await press(view, `phase-duration-${phaseId}-${action}`);
  }
}

function phaseValue(view: Awaited<ReturnType<typeof render>>, phaseId: string): string {
  return view.getByTestId(`phase-duration-${phaseId}-value`).props.children as string;
}

async function press(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

async function typeAmount(
  view: Awaited<ReturnType<typeof render>>,
  method: "card" | "cash",
  text: string,
) {
  await act(async () => {
    fireEvent.changeText(view.getByTestId(`checkout-amount-${method}`), text);
  });
}

describe("AppointmentDetailsScreen", () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 7, 29, 8, 0));
    mockPush.mockClear();
    mockBack.mockClear();
    mockWarningHaptic.mockClear();
    mockSuccessHaptic.mockClear();
    mockSelectionHaptic.mockClear();
    mockAlert.mockClear();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("moves Modifier from the identity header to the rightmost normal action", async () => {
    const view = await renderDetails();

    expect(view.getByText("Sofia Petit")).toBeTruthy();
    expect(
      within(view.getByTestId("appointment-identity-header")).queryByTestId(
        "modify-appointment",
      ),
    ).toBeNull();
    expect(
      within(view.getByTestId("appointment-normal-actions"))
        .getAllByRole("button")
        .map(({ props }) => props.testID),
    ).toEqual(["open-cancellation", "modify-appointment"]);
    expect(view.queryByText("Actions")).toBeNull();
    expect(view.queryByText("Actions secondaires")).toBeNull();

    await press(view, "modify-appointment");

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/appointments/edit/[appointmentId]",
      params: { appointmentId: "agenda-sofia" },
    });
  });

  it("offers the visible « Fermer » text action of every sheet in the identity header", async () => {
    const view = await renderDetails();

    const header = within(view.getByTestId("appointment-identity-header"));
    const close = header.getByRole("button", { name: "Fermer" });
    expect(close.props.testID).toBe("close-appointment-details");
    // A worded action, not an icon-only control.
    expect(header.getByText("Fermer")).toBeTruthy();
    expect(
      within(close).queryByTestId("glass-surface", { includeHiddenElements: true }),
    ).toBeNull();

    await press(view, "close-appointment-details");

    // The same single way out as the swipe and the outside tap; a plain
    // dismissal carries no haptic.
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockWarningHaptic).not.toHaveBeenCalled();
    expect(mockSuccessHaptic).not.toHaveBeenCalled();
    expect(mockSelectionHaptic).not.toHaveBeenCalled();
  });

  it("keeps the outside-tap dismissal next to « Fermer »", async () => {
    const view = await renderDetails();

    const scrim = view.getByTestId("sheet-screen-scrim");
    expect(scrim.props.accessibilityState?.disabled).not.toBe(true);

    await press(view, "sheet-screen-scrim");

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("offers cancellation for a future appointment and records its actor and reason", async () => {
    const user = userEvent.setup({
      advanceTimers: (delay) => jest.advanceTimersByTime(delay),
    });
    const view = await renderDetails();

    expect(view.getByTestId("modify-appointment")).toBeTruthy();
    expect(view.getByTestId("open-cancellation")).toBeTruthy();
    expect(view.getByTestId("open-permanent-deletion")).toBeTruthy();
    expect(view.queryByTestId("checkout-appointment")).toBeNull();
    expect(view.queryByText("Terminer")).toBeNull();
    expect(view.queryByTestId("open-no-show")).toBeNull();

    await user.press(view.getByTestId("open-cancellation"));

    expect(view.getByText("Annuler ce rendez-vous ?")).toBeTruthy();
    expect(
      view.getByTestId("confirm-cancellation").props.accessibilityState
        .disabled,
    ).toBe(true);

    await user.press(view.getByTestId("cancellation-actor-client"));
    await user.type(
      view.getByLabelText("Motif de l’annulation"),
      "Empêchement",
    );
    expect(
      view.getByTestId("confirm-cancellation").props.accessibilityState
        .disabled,
    ).toBe(false);

    await user.press(view.getByTestId("confirm-cancellation"));

    expect(view.getByText("Annulé")).toBeTruthy();
    expect(view.getByText("Annulé par la cliente")).toBeTruthy();
    expect(view.getByText("Empêchement")).toBeTruthy();
    expect(view.queryByTestId("modify-appointment")).toBeNull();
    expect(view.queryByTestId("open-cancellation")).toBeNull();
    expect(view.queryByTestId("checkout-appointment")).toBeNull();
  });

  it("shows Revente and Encaisser side by side, above the lifecycle actions, and links the Sale to the Appointment", async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    const view = await renderDetails();

    expect(view.queryByText("Terminer")).toBeNull();
    expect(view.queryByTestId("complete-appointment")).toBeNull();
    const primaryRow = within(view.getByTestId("appointment-primary-actions"));
    expect(
      primaryRow.getAllByRole("button").map(({ props }) => props.testID),
    ).toEqual(["sell-product", "checkout-appointment"]);
    expect(primaryRow.getByText("Revente")).toBeTruthy();
    expect(primaryRow.getByText("Encaisser")).toBeTruthy();
    expect(
      within(view.getByTestId("appointment-normal-actions")).queryByTestId("sell-product"),
    ).toBeNull();
    const actionOrder = within(view.getByTestId("appointment-actions"))
      .getAllByRole("button")
      .map(({ props }) => props.testID);
    expect(actionOrder.indexOf("checkout-appointment")).toBeLessThan(
      actionOrder.indexOf("open-no-show"),
    );

    await press(view, "sell-product");
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/sales/new",
      params: { clientId: "client-agenda-sofia", appointmentId: "agenda-sofia" },
    });
  });

  it("checks out a started same-day appointment by card and shows the recorded payment", async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    const view = await renderDetails();

    expect(view.getByTestId("checkout-appointment")).toBeTruthy();
    expect(view.getByTestId("open-no-show")).toBeTruthy();
    expect(view.getByTestId("open-cancellation")).toBeTruthy();
    expect(view.queryByText("Démarrer")).toBeNull();
    expect(
      within(view.getByTestId("appointment-normal-actions"))
        .getAllByRole("button")
        .map(({ props }) => props.testID),
    ).toEqual(["open-no-show", "open-cancellation", "modify-appointment"]);

    await press(view, "checkout-appointment");

    expect(view.getByTestId("checkout-sheet")).toBeTruthy();
    expect(view.getByText("ENCAISSEMENT")).toBeTruthy();
    expect(view.getByText("Encaisser le rendez-vous")).toBeTruthy();
    expect(view.getByTestId("checkout-amount-card").props.autoFocus).toBeFalsy();
    expect(view.getByTestId("checkout-amount-cash").props.autoFocus).toBeFalsy();
    expect(view.getByTestId("checkout-services-total").props.children).toBe(formatEuroCents(9500));
    expect(view.queryByTestId("checkout-products-total")).toBeNull();
    expect(view.getByTestId("checkout-expected-total").props.children).toBe(formatEuroCents(9500));
    expect(view.getByTestId("confirm-checkout").props.accessibilityState.disabled).toBe(true);
    expect(view.getByTestId("appointment-status").props.children).toBe("SCHEDULED");

    await typeAmount(view, "card", "95");
    expect(view.getByTestId("checkout-entered-total").props.children).toBe(formatEuroCents(9500));
    expect(view.queryByTestId("checkout-difference")).toBeNull();
    expect(view.getByTestId("confirm-checkout").props.accessibilityState.disabled).toBe(false);

    await press(view, "confirm-checkout");
    await settleSheetTransition();

    expect(view.getByText("Terminé")).toBeTruthy();
    expect(view.getByTestId("appointment-status").props.children).toBe("COMPLETED");
    expect(view.getByTestId("appointment-payment-probe").props.children).toBe("9500/0");
    expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("checkout-sheet")).toBeNull();
    expect(view.queryByTestId("checkout-appointment")).toBeNull();
    expect(view.queryByTestId("open-no-show")).toBeNull();
    expect(view.queryByTestId("open-cancellation")).toBeNull();
    expect(view.queryByTestId("modify-appointment")).toBeNull();
    expect(view.getByTestId("sell-product")).toBeTruthy();

    const payment = within(view.getByTestId("appointment-payment"));
    expect(payment.getByText("Encaissement")).toBeTruthy();
    expect(view.getByTestId("appointment-payment-total").props.children).toBe(formatEuroCents(9500));
    expect(view.getByTestId("appointment-payment-card")).toBeTruthy();
    expect(view.queryByTestId("appointment-payment-cash")).toBeNull();
    expect(view.getByTestId("edit-payment")).toBeTruthy();
  });

  it("records a mixed card + cash checkout and lets the split be corrected without a second record", async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    const view = await renderDetails();

    await press(view, "checkout-appointment");
    await typeAmount(view, "card", "50");
    await typeAmount(view, "cash", "25");
    expect(view.getByTestId("checkout-entered-total").props.children).toBe(formatEuroCents(7500));
    expect(view.getByTestId("checkout-difference").props.children).toEqual([
      "Écart : ",
      `-${formatEuroCents(2000)}`,
    ]);
    await press(view, "confirm-checkout");
    await settleSheetTransition();

    expect(view.getByTestId("appointment-payment-probe").props.children).toBe("5000/2500");
    expect(view.getByTestId("appointment-payment-total").props.children).toBe(formatEuroCents(7500));
    expect(within(view.getByTestId("appointment-payment-card")).getByText(formatEuroCents(5000))).toBeTruthy();
    expect(within(view.getByTestId("appointment-payment-cash")).getByText(formatEuroCents(2500))).toBeTruthy();

    await press(view, "edit-payment");
    expect(view.getByRole("header", { name: "Modifier l’encaissement" })).toBeTruthy();
    expect(view.getByTestId("checkout-amount-card").props.value).toBe("50,00");
    expect(view.getByTestId("checkout-amount-cash").props.value).toBe("25,00");
    await typeAmount(view, "card", "30");
    await typeAmount(view, "cash", "45");
    await press(view, "confirm-checkout");
    await settleSheetTransition();

    expect(view.getByTestId("appointment-status").props.children).toBe("COMPLETED");
    expect(view.getByTestId("appointment-payment-probe").props.children).toBe("3000/4500");
    expect(view.getByTestId("appointment-payment-total").props.children).toBe(formatEuroCents(7500));
    expect(view.getAllByTestId("appointment-payment")).toHaveLength(1);
  });

  it("offers to record a checkout on an automatically completed appointment without changing its status", async () => {
    const view = await renderDetails("agenda-anais");

    expect(view.getByTestId("appointment-status").props.children).toBe("COMPLETED");
    expect(view.getByTestId("appointment-payment-probe").props.children).toBe("none");
    expect(view.queryByTestId("appointment-payment-total")).toBeNull();
    expect(view.getByText("Enregistrer un encaissement")).toBeTruthy();

    await press(view, "checkout-appointment");
    await typeAmount(view, "cash", "42");
    await press(view, "confirm-checkout");
    await settleSheetTransition();

    expect(view.getByTestId("appointment-status").props.children).toBe("COMPLETED");
    expect(view.getByTestId("appointment-payment-probe").props.children).toBe("0/4200");
    expect(view.queryByTestId("checkout-appointment")).toBeNull();
  });

  it("makes start-time actions available on the next wall-clock minute", async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 13, 59, 30));
    const view = await renderDetails();

    expect(view.queryByTestId("checkout-appointment")).toBeNull();
    expect(view.queryByTestId("open-no-show")).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    expect(view.getByTestId("checkout-appointment")).toBeTruthy();
    expect(view.getByTestId("open-no-show")).toBeTruthy();
  });

  it("confirms and preserves a started same-day no-show", async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    const view = await renderDetails();

    await press(view, "open-no-show");
    expect(view.getByText("Marquer comme absence ?")).toBeTruthy();

    await press(view, "confirm-no-show");

    expect(view.getByText("Absence")).toBeTruthy();
    expect(view.queryByTestId("checkout-appointment")).toBeNull();
    expect(view.queryByTestId("open-no-show")).toBeNull();
    expect(view.queryByTestId("open-cancellation")).toBeNull();
    expect(view.getByTestId("appointment-payment-probe").props.children).toBe("none");
  });

  it("lets previous-local-day completion win over a stale cancellation sheet, without any payment", async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 23, 59, 30));
    const user = userEvent.setup({
      advanceTimers: (delay) => jest.advanceTimersByTime(delay),
    });
    const view = await renderDetails();

    await user.press(view.getByTestId("open-cancellation"));
    await user.press(view.getByTestId("cancellation-actor-client"));
    jest.setSystemTime(new Date(2026, 7, 30, 0, 0, 1));

    await user.press(view.getByTestId("confirm-cancellation"));
    await settleSheetTransition();

    expect(view.getByText("Terminé")).toBeTruthy();
    expect(view.queryByText("Annulé par la cliente")).toBeNull();
    expect(view.queryByTestId("cancellation-sheet")).toBeNull();
    expect(view.getByTestId("appointment-payment-probe").props.children).toBe("none");
  });

  it("requires a focused confirmation and lets Retour preserve the appointment", async () => {
    const view = await renderDetails();

    const deleteAction = view.getByTestId("open-permanent-deletion");
    expect(deleteAction.props.accessibilityRole).toBe("button");
    expect(deleteAction.props.accessibilityState.disabled).toBeUndefined();
    expect(view.queryByText("Actions")).toBeNull();
    expect(view.queryByText("Actions secondaires")).toBeNull();
    expect(view.getByTestId("appointment-presence").props.children).toBe(
      "present",
    );

    await press(view, "open-permanent-deletion");

    expect(view.getByTestId("permanent-deletion-dialog")).toBeTruthy();
    expect(view.getByText("SUPPRESSION")).toBeTruthy();
    expect(view.getByText("Supprimer ce rendez-vous ?")).toBeTruthy();
    expect(
      view.getByText(/supprimé de l’agenda et de l’historique de la cliente/),
    ).toBeTruthy();
    expect(view.getByText("Retour")).toBeTruthy();
    expect(view.getByTestId("appointment-presence").props.children).toBe(
      "present",
    );
    expect(mockWarningHaptic).not.toHaveBeenCalled();

    await press(view, "cancel-permanent-deletion");

    expect(view.queryByTestId("permanent-deletion-dialog")).toBeNull();
    expect(view.getByTestId("appointment-presence").props.children).toBe(
      "present",
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("permanently deletes the appointment, triggers warning haptics, and closes Details", async () => {
    const view = await renderDetails();

    await press(view, "open-permanent-deletion");
    expect(view.getByTestId("appointment-presence").props.children).toBe(
      "present",
    );

    await press(view, "confirm-permanent-deletion");

    expect(view.getByTestId("appointment-presence").props.children).toBe(
      "missing",
    );
    expect(view.queryByText("Rendez-vous introuvable")).toBeNull();
    expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("keeps permanent deletion available after cancellation", async () => {
    const user = userEvent.setup({
      advanceTimers: (delay) => jest.advanceTimersByTime(delay),
    });
    const view = await renderDetails();

    await user.press(view.getByTestId("open-cancellation"));
    await user.press(view.getByTestId("cancellation-actor-client"));
    await user.press(view.getByTestId("confirm-cancellation"));

    expect(view.getByText("Annulé")).toBeTruthy();
    expect(view.getByTestId("open-permanent-deletion")).toBeTruthy();
    expect(view.queryByTestId("open-cancellation")).toBeNull();
    mockWarningHaptic.mockClear();

    await user.press(view.getByTestId("open-permanent-deletion"));
    await user.press(view.getByTestId("confirm-permanent-deletion"));

    expect(view.getByTestId("appointment-presence").props.children).toBe(
      "missing",
    );
    expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("blocks permanent deletion of a paid appointment with an explanation instead of a confirmation", async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    const view = await renderDetails();
    await press(view, "checkout-appointment");
    await typeAmount(view, "card", "95");
    await press(view, "confirm-checkout");
    await settleSheetTransition();

    await press(view, "open-permanent-deletion");

    expect(view.queryByTestId("permanent-deletion-dialog")).toBeNull();
    expect(view.getByTestId("appointment-deletion-blocked")).toBeTruthy();
    expect(view.getByText("Suppression impossible")).toBeTruthy();
    expect(view.getByText(/encaissement enregistré/)).toBeTruthy();
    expect(view.queryByTestId("confirm-permanent-deletion")).toBeNull();

    await press(view, "close-appointment-deletion-blocked");

    expect(view.queryByTestId("appointment-deletion-blocked")).toBeNull();
    expect(view.getByTestId("appointment-presence").props.children).toBe("present");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("blocks permanent deletion of an appointment linked to a Product Sale and keeps the Sale", async () => {
    const view = await renderDetails();
    await press(view, "stock-products");
    await press(view, "sell-linked-shampoo");

    await press(view, "open-permanent-deletion");

    expect(view.getByTestId("appointment-deletion-blocked")).toBeTruthy();
    expect(view.queryByTestId("permanent-deletion-dialog")).toBeNull();
    expect(view.getByTestId("appointment-presence").props.children).toBe("present");
    expect(view.getByTestId("appointment-products")).toBeTruthy();
  });

  it("removes the active / processing time breakdown but keeps Durée totale and the service phases", async () => {
    const view = await renderDetails();

    expect(view.getByText("Durée totale")).toBeTruthy();
    expect(view.getByText("1 h 55 min")).toBeTruthy();
    expect(view.queryByText("Temps actif")).toBeNull();
    expect(view.queryByText("Temps")).toBeNull();
    expect(view.queryByText("Temps de pose")).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByLabelText(/Balayage, commence à/));
    });

    expect(view.getAllByText("Temps de pose")).toHaveLength(1);
    expect(view.queryByText("Temps actif")).toBeNull();
    expect(view.queryByText("Professionnelle disponible")).toBeNull();
    expect(view.queryByText("Professionnelle occupée")).toBeNull();
  });

  it("lists the Products sold during the appointment as aggregated Product rows, not Sale cards nor the Client's other Sales", async () => {
    const view = await renderDetails();
    expect(view.queryByTestId("appointment-products")).toBeNull();
    // Before any Revente the ticket total is simply the Prestations total — never hidden.
    expect(view.getByTestId("appointment-services-total").props.children).toBe(formatEuros(95));
    expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(9500));

    await press(view, "stock-products");
    await press(view, "sell-linked-shampoo");
    await press(view, "sell-linked-serum");
    await press(view, "sell-unlinked");
    // A later separate Revente of the SAME Product snapshot: one row, quantity summed.
    await press(view, "sell-linked-shampoo-once");

    const products = within(view.getByTestId("appointment-products"));
    expect(products.getByText("Produits vendus")).toBeTruthy();
    const lines = products.getAllByTestId("appointment-product-line");
    expect(lines).toHaveLength(2);
    expect(within(lines[0]!).getByText("Masque réparateur 5 min")).toBeTruthy();
    expect(within(lines[0]!).getByText(`×3 · ${formatEuros(50)}`)).toBeTruthy();
    expect(within(lines[0]!).getByText(formatEuroCents(15000))).toBeTruthy();
    expect(within(lines[1]!).getByText("Acidic bonding concentrate")).toBeTruthy();
    expect(within(lines[1]!).getByText(`×1 · ${formatEuros(12)}`)).toBeTruthy();
    // No Sale-level presentation and no permanently visible delete control.
    expect(products.queryByText(/Revente/)).toBeNull();
    expect(products.queryByText("Supprimer")).toBeNull();
    // The badge counts TOTAL UNITS (3 + 1), not unique Products.
    expect(products.getByText("4")).toBeTruthy();
    expect(view.getByTestId("sale-ids").props.children).toBe("sale-linked-a,sale-linked-b,sale-unlinked,sale-linked-c");

    // The ticket total recomputed immediately: services + linked Products only.
    expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(25700));

    // The checkout expectation is the SAME derivation: linked Products, not the unlinked Sale.
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await press(view, "checkout-appointment");
    expect(view.getByTestId("checkout-services-total").props.children).toBe(formatEuroCents(9500));
    expect(view.getByTestId("checkout-products-total").props.children).toBe(formatEuroCents(16200));
    expect(view.getByTestId("checkout-expected-total").props.children).toBe(formatEuroCents(25700));
  });

  describe("Product swipe-to-delete", () => {
    const masqueRow = `appointment-product-${MASQUE_ID}`;
    const concentrateRow = `appointment-product-${CONCENTRATE_ID}`;

    it("plays the swipe hint once, on the first Product row present when the screen opens, never on rows added later", async () => {
      const db = openTestDatabase();
      // The screen opens with one sold Product already persisted.
      const view = await renderDetails("agenda-sofia", undefined, db);
      await press(view, "stock-products");
      await press(view, "sell-linked-serum");
      // No hint yet: the screen settles first.
      expect(view.queryByTestId(`${concentrateRow}-hint`)).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      // The Products section mounted with no row, so it has no hint target; a
      // Product sold during this screen instance never plays the hint.
      expect(view.queryByTestId(`${concentrateRow}-hint`)).toBeNull();
    });

    it("hints the first Product row of a screen that opens with sold Products, and only that row", async () => {
      const db = openTestDatabase();
      persistLinkedSales(db, [MASQUE_ID, CONCENTRATE_ID]);

      const view = await renderDetails("agenda-sofia", undefined, db);
      expect(view.getAllByTestId("appointment-product-line")).toHaveLength(2);
      expect(view.queryByTestId(`${masqueRow}-hint`)).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(view.getByTestId(`${masqueRow}-hint`)).toBeTruthy();
      expect(view.queryByTestId(`${concentrateRow}-hint`)).toBeNull();
      expect(mockSelectionHaptic).not.toHaveBeenCalled();

      // Reveal + hold: the trash stays readable for a while before the return.
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(view.getByTestId(`${masqueRow}-hint`)).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(view.queryByTestId(`${masqueRow}-hint`)).toBeNull();

      // Once played it never replays, and the promoted row never inherits it.
      await press(view, `${masqueRow}-swipe-full`);
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(view.queryByTestId(`${concentrateRow}-hint`)).toBeNull();
    });

    it("cancels a pending hint when the user touches the row first", async () => {
      const db = openTestDatabase();
      persistLinkedSales(db, [CONCENTRATE_ID]);

      const view = await renderDetails("agenda-sofia", undefined, db);
      await act(async () => {
        fireEvent(view.getByTestId(concentrateRow), "touchStart");
      });
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(view.queryByTestId(`${concentrateRow}-hint`)).toBeNull();
    });

    it("reveals the trash on a partial swipe, keeps the Product until the trash is tapped, then deletes the aggregated row", async () => {
      jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
      const db = openTestDatabase();
      const view = await renderDetails("agenda-sofia", undefined, db);
      await press(view, "stock-products");
      // Two separate Reventes of the same Product: ONE row, ×3, restored together.
      await press(view, "sell-linked-shampoo");
      await press(view, "sell-linked-shampoo-once");
      expect(view.getByTestId("stock-masque").props.children).toBe(2);
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(24500));
      expect(view.getAllByTestId("appointment-product-line")).toHaveLength(1);

      // Checkout and Details agree before the deletion.
      await press(view, "checkout-appointment");
      expect(view.getByTestId("checkout-expected-total").props.children).toBe(formatEuroCents(24500));
      await act(async () => {
        fireEvent.press(view.getByLabelText("Annuler l’encaissement"));
      });
      await settleSheetTransition();

      // Partial swipe: the destructive action is revealed, nothing is deleted.
      const trash = view.getByLabelText("Supprimer Masque réparateur 5 min des produits vendus");
      expect(trash.props.accessibilityRole).toBe("button");
      await press(view, `${masqueRow}-swipe-partial`);
      expect(view.getByTestId(`${masqueRow}-translation`).props.children).toBe("90");
      expect(view.getByTestId("appointment-product-line")).toBeTruthy();
      expect(view.getByTestId("stock-masque").props.children).toBe(2);
      expect(mockWarningHaptic).not.toHaveBeenCalled();
      expect(mockSelectionHaptic).not.toHaveBeenCalled();

      // Tapping the trash deletes the displayed row: both sold lines, stock +3.
      await press(view, `delete-appointment-product-${MASQUE_ID}`);

      expect(view.queryByTestId("appointment-products")).toBeNull();
      expect(view.getByTestId("stock-masque").props.children).toBe(5);
      expect(view.getByTestId("sale-ids").props.children).toBe("");
      expect(view.getByTestId("sofia-purchases").props.children).toBe("");
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(9500));
      expect(view.getByTestId("appointment-presence").props.children).toBe("present");
      expect(view.getByTestId("appointment-payment-probe").props.children).toBe("none");
      expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
      expect(mockAlert).not.toHaveBeenCalled();

      await press(view, "checkout-appointment");
      expect(view.queryByTestId("checkout-products-total")).toBeNull();
      expect(view.getByTestId("checkout-expected-total").props.children).toBe(formatEuroCents(9500));

      // Restart: SQLite no longer holds any line and holds the restored stock.
      expect(loadSales(db)).toEqual([]);
      expect(findProduct(db, MASQUE_ID)?.stockQuantity).toBe(5);
    });

    it("commits exactly once on a full swipe release, with one selection tick when the threshold is crossed", async () => {
      const view = await renderDetails();
      await press(view, "stock-products");
      await press(view, "sell-linked-serum");
      expect(view.getByTestId("stock-concentrate").props.children).toBe(2);

      await press(view, `${concentrateRow}-swipe-full`);

      expect(view.queryByTestId("appointment-products")).toBeNull();
      expect(view.getByTestId("stock-concentrate").props.children).toBe(3);
      expect(view.getByTestId("sale-ids").props.children).toBe("");
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(9500));
      expect(mockSelectionHaptic).toHaveBeenCalled();
      expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
    });

    it("deletes the aggregated Product across a mixed Sale and a single Sale, keeping the other Product and its Sale", async () => {
      const view = await renderDetails();
      await press(view, "stock-products");
      // sale-linked-mixed: Masque ×1 + Concentrate ×1 · sale-linked-c: Masque ×1 · sale-unlinked: not shown
      await press(view, "sell-linked-mixed");
      await press(view, "sell-linked-shampoo-once");
      await press(view, "sell-unlinked");
      expect(view.getByTestId("stock-masque").props.children).toBe(3);
      expect(view.getByTestId("stock-concentrate").props.children).toBe(1);
      const before = within(view.getByTestId("appointment-products"));
      expect(before.getByText(`×2 · ${formatEuros(50)}`)).toBeTruthy();
      expect(before.getByText(`×1 · ${formatEuros(12)}`)).toBeTruthy();
      expect(before.getByText("3")).toBeTruthy();
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(20700));

      await press(view, `${masqueRow}-swipe-full`);

      const products = within(view.getByTestId("appointment-products"));
      expect(products.getAllByTestId("appointment-product-line")).toHaveLength(1);
      expect(products.getByText("Acidic bonding concentrate")).toBeTruthy();
      expect(products.queryByText("Masque réparateur 5 min")).toBeNull();
      expect(products.getByText("1")).toBeTruthy();
      expect(view.getByTestId("stock-masque").props.children).toBe(5);
      expect(view.getByTestId("stock-concentrate").props.children).toBe(1);
      // The mixed Sale keeps its Concentrate line; the emptied Sale is gone; the unlinked Sale is untouched.
      expect(view.getByTestId("sale-ids").props.children).toBe("sale-linked-mixed,sale-unlinked");
      expect(view.getByTestId("sofia-purchases").props.children).toBe("sale-unlinked,sale-linked-mixed");
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(10700));
    });

    it("keeps the recorded payment and the Cash Register untouched when a Product is deleted after checkout", async () => {
      jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
      const view = await renderDetails();
      await press(view, "stock-products");
      await press(view, "sell-linked-serum");
      await press(view, "checkout-appointment");
      expect(view.getByTestId("checkout-expected-total").props.children).toBe(formatEuroCents(10700));
      await typeAmount(view, "card", "107");
      await press(view, "confirm-checkout");
      await settleSheetTransition();
      expect(view.getByTestId("caisse-day-total").props.children).toBe(10700);
      expect(view.queryByTestId("appointment-payment-difference")).toBeNull();

      // Same direct gesture, no extra modal.
      await press(view, `${concentrateRow}-swipe-full`);

      expect(view.queryByTestId("appointment-products")).toBeNull();
      expect(view.getByTestId("stock-concentrate").props.children).toBe(3);
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(9500));
      expect(view.getByTestId("appointment-payment-probe").props.children).toBe("10700/0");
      expect(view.getByTestId("appointment-payment-total").props.children).toBe(formatEuroCents(10700));
      expect(view.getByTestId("appointment-payment-difference").props.children).toEqual([
        "Écart : ",
        `+${formatEuroCents(1200)}`,
      ]);
      expect(view.getByTestId("caisse-day-total").props.children).toBe(10700);
      expect(view.getByTestId("appointment-status").props.children).toBe("COMPLETED");
      expect(view.getByTestId("edit-payment")).toBeTruthy();

      // The correction sheet consumes the same expectation as Details.
      await press(view, "edit-payment");
      expect(view.getByTestId("checkout-expected-total").props.children).toBe(formatEuroCents(9500));
      expect(view.getByTestId("checkout-amount-card").props.value).toBe("107,00");

      // Permanent deletion stays blocked: the payment still anchors the Appointment.
      await act(async () => {
        fireEvent.press(view.getByLabelText("Annuler l’encaissement"));
      });
      await settleSheetTransition();
      await press(view, "open-permanent-deletion");
      expect(view.getByTestId("appointment-deletion-blocked")).toBeTruthy();
    });

    it("re-evaluates permanent deletion once the last sold Product is gone", async () => {
      const view = await renderDetails();
      await press(view, "stock-products");
      await press(view, "sell-linked-shampoo");
      await press(view, "open-permanent-deletion");
      expect(view.getByTestId("appointment-deletion-blocked")).toBeTruthy();
      await press(view, "close-appointment-deletion-blocked");

      await press(view, `${masqueRow}-swipe-full`);
      expect(view.getByTestId("stock-masque").props.children).toBe(5);

      await press(view, "open-permanent-deletion");
      expect(view.queryByTestId("appointment-deletion-blocked")).toBeNull();
      expect(view.getByTestId("permanent-deletion-dialog")).toBeTruthy();
    });

    it("closes the row again and keeps Sale and stock when persistence refuses the deletion", async () => {
      const native = openTestDatabase();
      const control = { failDeletes: false };
      const db: typeof native = {
        ...native,
        runSync: (sql, params) => {
          if (control.failDeletes && sql.startsWith("DELETE FROM sale_items")) {
            throw new Error("disk full");
          }
          return native.runSync(sql, params);
        },
      };
      const view = await renderDetails("agenda-sofia", undefined, db);
      await press(view, "stock-products");
      await press(view, "sell-linked-serum");
      control.failDeletes = true;

      await press(view, `${concentrateRow}-swipe-full`);

      expect(view.getByTestId("appointment-product-line")).toBeTruthy();
      expect(view.getByTestId(`${concentrateRow}-closed`).props.children).toBe("1");
      expect(view.getByTestId("stock-concentrate").props.children).toBe(2);
      expect(findProduct(db, CONCENTRATE_ID)?.stockQuantity).toBe(2);
      expect(loadSales(db)).toHaveLength(1);
      expect(view.getByTestId("sale-ids").props.children).toBe("sale-linked-b");
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(10700));
      expect(mockAlert).toHaveBeenCalledTimes(1);
      expect(mockWarningHaptic).not.toHaveBeenCalled();

      // Once persistence works again the same row deletes normally.
      control.failDeletes = false;
      await press(view, `delete-appointment-product-${CONCENTRATE_ID}`);
      expect(view.queryByTestId("appointment-products")).toBeNull();
      expect(view.getByTestId("stock-concentrate").props.children).toBe(3);
      expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
    });
  });

  describe("direct Service reorder and removal", () => {
    const APPOINTMENT = "three-service-appointment";

    /** Seeds the database and persists the three-Service Appointment BEFORE the screen renders. */
    function persistThreeServiceAppointment(
      db: ReturnType<typeof openTestDatabase>,
      options: { readonly withProduct?: boolean } = {},
    ) {
      bootstrapPersistence(db, () => createDevelopmentSeed(new Date()));
      insertAppointment(db, {
        id: APPOINTMENT,
        businessId: "business-test",
        clientId: "client-agenda-sofia",
        staffMemberId: "staff-amelie",
        startAt: new Date(2026, 7, 31, 10, 0),
        status: "SCHEDULED",
        items: [
          {
            id: "ts-coupe",
            serviceId: "service-cut",
            order: 0,
            serviceName: "Coupe",
            serviceType: "SERVICE",
            price: 30,
            phases: [{ id: "ts-coupe-phase", name: "Coupe", durationMinutes: 30, requiresStaff: true }],
          },
          {
            id: "ts-balayage",
            serviceId: "service-highlights",
            order: 1,
            serviceName: "Balayage",
            serviceType: "TECHNIQUE",
            price: 50,
            phases: [
              { id: "ts-application", name: "Application", durationMinutes: 45, requiresStaff: true },
              { id: "ts-pose", name: "Temps de pose", durationMinutes: 40, requiresStaff: false },
            ],
          },
          {
            id: "ts-brushing",
            serviceId: "service-brushing",
            order: 2,
            serviceName: "Brushing",
            serviceType: "SERVICE",
            price: 20,
            phases: [{ id: "ts-brushing-phase", name: "Brushing", durationMinutes: 20, requiresStaff: true }],
          },
        ],
      });
      if (options.withProduct) {
        setProductStock(db, CONCENTRATE_ID, 3);
        completeSale(
          db,
          {
            id: "sale-three-service",
            businessId: "business-test",
            clientId: "client-agenda-sofia",
            appointmentId: APPOINTMENT,
            completedAt: new Date(2026, 7, 31, 11, 0),
            items: [
              {
                id: "sale-three-service-1",
                productId: CONCENTRATE_ID,
                productName: "Acidic bonding concentrate",
                unitPrice: 12,
                quantity: 1,
              },
            ],
          },
          [{ productId: CONCENTRATE_ID, quantity: 1 }],
        );
      }
    }

    function storedOrder(db: ReturnType<typeof openTestDatabase>): string[] {
      const stored = loadAppointments(db).find((appointment) => appointment.id === APPOINTMENT);
      return (stored?.items ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item) => item.id);
    }

    it("reorders Services by drag, persists the order after the write, and touches neither timing nor the catalog", async () => {
      const db = openTestDatabase();
      persistThreeServiceAppointment(db);
      const view = await renderDetails(APPOINTMENT, <ThreeServiceProbe />, db);
      const catalogBefore = view.getByTestId("catalog-durations").props.children;
      expect(view.getByTestId("three-service-items").props.children).toBe(
        "ts-coupe:0:30|ts-balayage:1:45/40|ts-brushing:2:20",
      );
      expect(view.getByLabelText("Déplacer Balayage")).toBeTruthy();
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(10000));

      await act(async () => {
        dragServiceRow("ts-balayage", -100);
      });

      expect(view.getByTestId("three-service-items").props.children).toBe(
        "ts-balayage:0:45/40|ts-coupe:1:30|ts-brushing:2:20",
      );
      expect(storedOrder(db)).toEqual(["ts-balayage", "ts-coupe", "ts-brushing"]);
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(10000));
      expect(view.getByText("2 h 15 min")).toBeTruthy();
      expect(view.getByTestId("catalog-durations").props.children).toBe(catalogBefore);
      expect(mockAlert).not.toHaveBeenCalled();
    });

    it("removes a Service by swipe immediately, recalculating totals and duration, and persists it", async () => {
      const db = openTestDatabase();
      persistThreeServiceAppointment(db);
      const view = await renderDetails(APPOINTMENT, <ThreeServiceProbe />, db);
      const catalogBefore = view.getByTestId("catalog-durations").props.children;
      expect(view.getByText("2 h 15 min")).toBeTruthy();
      expect(view.getByLabelText("Retirer Balayage du rendez-vous")).toBeTruthy();

      await press(view, "appointment-service-ts-balayage-swipe-full");

      expect(view.getByTestId("three-service-items").props.children).toBe("ts-coupe:0:30|ts-brushing:1:20");
      expect(storedOrder(db)).toEqual(["ts-coupe", "ts-brushing"]);
      expect(view.queryByTestId("service-section-ts-balayage")).toBeNull();
      expect(view.getByTestId("appointment-services-total").props.children).toBe(formatEuros(50));
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(5000));
      expect(view.getByText("50 min")).toBeTruthy();
      expect(view.getByText("10:00 – 10:50")).toBeTruthy();
      expect(view.getByTestId("catalog-durations").props.children).toBe(catalogBefore);
      expect(mockSelectionHaptic).toHaveBeenCalled();
    });

    it("never toggles a Service card from a swipe: only a tap expands or collapses it", async () => {
      const db = openTestDatabase();
      persistThreeServiceAppointment(db);
      const view = await renderDetails(APPOINTMENT, <ThreeServiceProbe />, db);
      const header = () => view.getByLabelText(/^Balayage, commence à/);
      const expanded = () => header().props.accessibilityState.expanded as boolean;
      const content = view.getByTestId("appointment-service-ts-balayage-content");
      const touch = (pageX: number, pageY: number) => ({ nativeEvent: { pageX, pageY } });

      // The row content never claims a touch that starts, jitters or scrolls…
      expect(content.props.onStartShouldSetResponderCapture(touch(100, 300))).toBe(false);
      expect(content.props.onMoveShouldSetResponderCapture(touch(104, 301))).toBe(false);
      expect(content.props.onMoveShouldSetResponderCapture(touch(106, 360))).toBe(false);
      // …but takes the press away from the header as soon as it moves sideways,
      // and gives it back to anyone who asks (a scroll view).
      expect(content.props.onMoveShouldSetResponderCapture(touch(110, 302))).toBe(true);
      expect(content.props.onResponderTerminationRequest()).toBe(true);

      // Collapsed + partial swipe → still collapsed, Delete revealed.
      expect(expanded()).toBe(false);
      await press(view, "appointment-service-ts-balayage-swipe-partial");
      expect(expanded()).toBe(false);
      expect(view.getByLabelText("Retirer Balayage du rendez-vous")).toBeTruthy();

      // A tap is still THE way to expand…
      await act(async () => fireEvent.press(header()));
      expect(expanded()).toBe(true);
      // …and an expanded card stays expanded through a partial swipe.
      await press(view, "appointment-service-ts-balayage-swipe-partial");
      expect(expanded()).toBe(true);

      // Expanded + full swipe → removed, without collapsing first.
      await press(view, "appointment-service-ts-balayage-swipe-full");
      expect(view.queryByTestId("service-section-ts-balayage")).toBeNull();
      expect(storedOrder(db)).toEqual(["ts-coupe", "ts-brushing"]);
    });

    it("keeps linked Product Sales, stock and purchase history when a Service is removed", async () => {
      const db = openTestDatabase();
      persistThreeServiceAppointment(db, { withProduct: true });
      const view = await renderDetails(APPOINTMENT, <ThreeServiceProbe />, db);
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(11200));
      expect(view.getByTestId("stock-concentrate").props.children).toBe(2);

      await press(view, "appointment-service-ts-balayage-swipe-full");

      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(6200));
      expect(view.getByTestId("appointment-product-line")).toBeTruthy();
      expect(view.getByTestId("sale-ids").props.children).toBe("sale-three-service");
      expect(view.getByTestId("sofia-purchases").props.children).toBe("sale-three-service");
      expect(view.getByTestId("stock-concentrate").props.children).toBe(2);
      expect(loadSales(db)).toHaveLength(1);
    });

    it("never exposes removal or reorder for a lone Service, in Details as in the editor", async () => {
      const view = await renderDetails();
      expect(view.getByTestId("service-section-item-sofia")).toBeTruthy();
      expect(view.queryByTestId("appointment-service-item-sofia")).toBeNull();
      expect(view.queryByLabelText("Retirer Balayage du rendez-vous")).toBeNull();
      expect(view.queryByLabelText("Déplacer Balayage")).toBeNull();
    });

    it("withdraws the swipe once removals leave a single Service", async () => {
      const db = openTestDatabase();
      persistThreeServiceAppointment(db);
      const view = await renderDetails(APPOINTMENT, <ThreeServiceProbe />, db);
      await press(view, "appointment-service-ts-coupe-swipe-full");
      await press(view, "appointment-service-ts-balayage-swipe-full");

      expect(view.getByTestId("three-service-items").props.children).toBe("ts-brushing:0:20");
      expect(storedOrder(db)).toEqual(["ts-brushing"]);
      expect(view.queryByTestId("appointment-service-ts-brushing")).toBeNull();
      expect(view.queryByLabelText("Retirer Brushing du rendez-vous")).toBeNull();
    });

    it("keeps timing expansion attached to the Service through reorder and the removal of another row", async () => {
      const db = openTestDatabase();
      persistThreeServiceAppointment(db);
      const view = await renderDetails(APPOINTMENT, <ThreeServiceProbe />, db);

      await act(async () => {
        fireEvent.press(view.getByLabelText(/Balayage, commence à/));
      });
      expect(view.getByTestId("service-timing-ts-balayage")).toBeTruthy();

      await act(async () => {
        dragServiceRow("ts-balayage", -100);
      });
      expect(view.getByTestId("three-service-items").props.children).toBe(
        "ts-balayage:0:45/40|ts-coupe:1:30|ts-brushing:2:20",
      );
      expect(view.getByTestId("service-timing-ts-balayage")).toBeTruthy();
      expect(view.queryByTestId("service-timing-ts-coupe")).toBeNull();

      await press(view, "appointment-service-ts-coupe-swipe-full");
      expect(view.getByTestId("three-service-items").props.children).toBe("ts-balayage:0:45/40|ts-brushing:1:20");
      expect(view.getByTestId("service-timing-ts-balayage")).toBeTruthy();
      expect(view.queryByTestId("service-timing-ts-brushing")).toBeNull();
    });

    it("restores the order and keeps the row when the database refuses the write", async () => {
      const native = openTestDatabase();
      const control = { failItemWrites: false };
      const db: typeof native = {
        ...native,
        runSync: (sql, params) => {
          if (
            control.failItemWrites &&
            /^(UPDATE appointment_items SET item_order|DELETE FROM appointment_items)/.test(sql)
          ) {
            throw new Error("disk full");
          }
          return native.runSync(sql, params);
        },
      };
      persistThreeServiceAppointment(db);
      const view = await renderDetails(APPOINTMENT, <ThreeServiceProbe />, db);
      control.failItemWrites = true;

      await act(async () => {
        dragServiceRow("ts-balayage", -100);
      });
      expect(view.getByTestId("three-service-items").props.children).toBe(
        "ts-coupe:0:30|ts-balayage:1:45/40|ts-brushing:2:20",
      );
      expect(storedOrder(db)).toEqual(["ts-coupe", "ts-balayage", "ts-brushing"]);
      expect(mockAlert).toHaveBeenCalledTimes(1);

      await press(view, "appointment-service-ts-balayage-swipe-full");
      expect(view.getByTestId("service-section-ts-balayage")).toBeTruthy();
      expect(view.getByTestId("appointment-service-ts-balayage-closed").props.children).toBe("1");
      expect(view.getByTestId("three-service-items").props.children).toBe(
        "ts-coupe:0:30|ts-balayage:1:45/40|ts-brushing:2:20",
      );
      expect(mockAlert).toHaveBeenCalledTimes(2);

      control.failItemWrites = false;
      await press(view, "remove-appointment-service-ts-balayage");
      expect(storedOrder(db)).toEqual(["ts-coupe", "ts-brushing"]);
    });

    it("hints the first removable Service once, and never the Products of the same screen", async () => {
      const db = openTestDatabase();
      persistThreeServiceAppointment(db, { withProduct: true });
      const view = await renderDetails(APPOINTMENT, <ThreeServiceProbe />, db);
      expect(view.queryByTestId("appointment-service-ts-coupe-hint")).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(view.getByTestId("appointment-service-ts-coupe-hint")).toBeTruthy();
      expect(view.queryByTestId("appointment-service-ts-balayage-hint")).toBeNull();
      expect(view.queryByTestId(`appointment-product-${CONCENTRATE_ID}-hint`)).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(view.queryByTestId("appointment-service-ts-coupe-hint")).toBeNull();
      expect(view.queryByTestId(`appointment-product-${CONCENTRATE_ID}-hint`)).toBeNull();
    });
  });

  it("keeps an archived Client fully readable, withholds Revente, and keeps Encaisser", async () => {
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    const view = await renderDetails("agenda-sofia", <ClientLifecycleProbe />);

    expect(view.getByTestId("sell-product")).toBeTruthy();

    await press(view, "archive-sofia");

    expect(view.getByText("Sofia Petit")).toBeTruthy();
    expect(view.queryByText("Cliente inconnue")).toBeNull();
    expect(view.queryByTestId("sell-product")).toBeNull();
    expect(view.queryByText("Revente")).toBeNull();
    expect(view.getByTestId("checkout-appointment")).toBeTruthy();
    expect(view.getByTestId("appointment-normal-actions")).toBeTruthy();
    expect(view.getByTestId("open-permanent-deletion")).toBeTruthy();
  });

  describe("appointment-specific timing", () => {
    it("expands a service into the shared steppers, saves atomically, and updates every total", async () => {
      const db = openTestDatabase();
      const view = await renderDetails("agenda-sofia", undefined, db);
      const catalogBefore = view.getByTestId("catalog-durations").props.children;

      expect(view.getByText("14:00 – 15:55")).toBeTruthy();
      expect(view.getByTestId("service-meta-item-sofia").props.children).toBe("1 h 55 min · 3 phases");
      expect(view.queryByTestId("service-timing-item-sofia")).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByLabelText(/Balayage, commence à/));
      });

      // Phase labels, minus / value / plus, and no keyboard input.
      const timing = within(view.getByTestId("service-timing-item-sofia"));
      expect(timing.getByText("Application")).toBeTruthy();
      expect(timing.getByText("Temps de pose")).toBeTruthy();
      expect(timing.getByText("Patine & finition")).toBeTruthy();
      expect(timing.getByLabelText("Réduire le temps de pose de 5 minutes")).toBeTruthy();
      expect(timing.getByLabelText("Augmenter le temps de pose de 5 minutes")).toBeTruthy();
      expect(phaseValue(view, "sofia-processing")).toBe("55 min");
      expect(view.container.queryAll((node) => node.type === "TextInput")).toHaveLength(0);
      expect(view.getByTestId("save-service-timing-item-sofia").props.accessibilityState.disabled).toBe(true);

      await stepPose(view, "sofia-processing", -1);

      // The draft moves; the committed totals do not until Enregistrer.
      expect(phaseValue(view, "sofia-processing")).toBe("50 min");
      expect(view.getByTestId("service-draft-total-item-sofia").props.children).toBe("Durée 1 h 50 min");
      expect(view.getByText("1 h 55 min")).toBeTruthy();
      expect(view.getByTestId("save-service-timing-item-sofia").props.accessibilityState.disabled).toBe(false);
      expect(mockSuccessHaptic).not.toHaveBeenCalled();

      await press(view, "save-service-timing-item-sofia");

      expect(view.getByText("1 h 50 min")).toBeTruthy();
      expect(view.getByText("14:00 – 15:50")).toBeTruthy();
      expect(view.getByTestId("service-meta-item-sofia").props.children).toBe("1 h 50 min · 3 phases");
      expect(view.getByTestId("save-service-timing-item-sofia").props.accessibilityState.disabled).toBe(true);
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
      expect(view.getByTestId("appointment-status").props.children).toBe("SCHEDULED");
      expect(view.getByTestId("appointment-payment-probe").props.children).toBe("none");
      expect(view.getByTestId("catalog-durations").props.children).toBe(catalogBefore);

      // SQLite holds the snapshot value.
      const stored = loadAppointments(db).find((entry) => entry.id === "agenda-sofia");
      expect(stored?.items[0]?.phases.map((phase) => phase.durationMinutes)).toEqual([30, 50, 30]);
    });

    it("reaches zero, never goes negative, and persists zero without dropping the phase", async () => {
      const db = openTestDatabase();
      const view = await renderDetails("agenda-sofia", undefined, db);

      await act(async () => {
        fireEvent.press(view.getByLabelText(/Balayage, commence à/));
      });
      await stepPose(view, "sofia-processing", -12);

      expect(phaseValue(view, "sofia-processing")).toBe("0 min");
      expect(
        view.getByTestId("phase-duration-sofia-processing-decrement").props.accessibilityState.disabled,
      ).toBe(true);
      await stepPose(view, "sofia-processing", 1);
      expect(phaseValue(view, "sofia-processing")).toBe("5 min");
      await stepPose(view, "sofia-processing", -1);
      expect(phaseValue(view, "sofia-processing")).toBe("0 min");

      await press(view, "save-service-timing-item-sofia");

      expect(view.getByText("1 h")).toBeTruthy();
      expect(view.getByText("14:00 – 15:00")).toBeTruthy();
      const stored = loadAppointments(db).find((entry) => entry.id === "agenda-sofia");
      expect(stored?.items[0]?.phases).toHaveLength(3);
      expect(stored?.items[0]?.phases[1]).toEqual({
        id: "sofia-processing",
        name: "Temps de pose",
        durationMinutes: 0,
        requiresStaff: false,
      });
      // The phase stays visible and editable after the save.
      expect(view.getByText("Temps de pose")).toBeTruthy();
      expect(view.getByTestId("phase-duration-sofia-processing-increment")).toBeTruthy();
    });

    it("changes one service without touching the other services of the Appointment", async () => {
      const view = await renderDetails("agenda-sofia", <MultiServiceProbe />);
      await press(view, "add-multi-service-appointment");
      await act(async () => {
        view.rerender(detailsTree("multi-service-appointment", <MultiServiceProbe />));
      });

      expect(view.getByText("1 h 55 min")).toBeTruthy();
      await act(async () => {
        fireEvent.press(view.getByLabelText(/Balayage, commence à/));
      });
      await stepPose(view, "ms-pose", -7);
      await press(view, "save-service-timing-ms-balayage");

      expect(view.getByTestId("multi-service-items").props.children).toBe(
        "ms-coupe:ms-coupe-phase=30|ms-balayage:ms-application=45,ms-pose=5",
      );
      expect(view.getByText("1 h 20 min")).toBeTruthy();
      expect(view.getByTestId("service-meta-ms-coupe").props.children).toBe("30 min");
      expect(view.getByTestId("service-meta-ms-balayage").props.children).toBe("50 min · 2 phases");

      // A simple service is editable too, through one « Durée » row.
      await act(async () => {
        fireEvent.press(view.getByLabelText(/Coupe, commence à/));
      });
      expect(within(view.getByTestId("service-timing-ms-coupe")).getByText("Durée")).toBeTruthy();
      expect(view.getByLabelText("Augmenter la durée de Coupe de 5 minutes")).toBeTruthy();
    });

    it("keeps timing read-only once the Appointment is terminal", async () => {
      const user = userEvent.setup({
        advanceTimers: (delay) => jest.advanceTimersByTime(delay),
      });
      const view = await renderDetails();

      await user.press(view.getByTestId("open-cancellation"));
      await user.press(view.getByTestId("cancellation-actor-client"));
      await user.press(view.getByTestId("confirm-cancellation"));
      expect(view.getByText("Annulé")).toBeTruthy();

      await act(async () => {
        fireEvent.press(view.getByLabelText(/Balayage, commence à/));
      });

      expect(view.getByText("Temps de pose")).toBeTruthy();
      expect(view.queryByTestId("service-timing-item-sofia")).toBeNull();
      expect(view.queryByTestId("save-service-timing-item-sofia")).toBeNull();
      expect(view.queryByLabelText(/de 5 minutes$/)).toBeNull();
    });
  });

  describe("Appointment discount", () => {
    it("shows no discount row and the unchanged total when the Appointment has no discount", async () => {
      const view = await renderDetails("agenda-sofia", <DiscountProbe />);

      expect(view.queryByTestId("appointment-discount-row")).toBeNull();
      expect(view.queryByText(/Réduction/)).toBeNull();
      expect(view.getByTestId("appointment-services-total").props.children).toBe(formatEuros(95));
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(9500));
    });

    it("shows gross, percentage discount and final total; the item snapshot price stays as booked", async () => {
      const view = await renderDetails("agenda-sofia", <DiscountProbe />);
      await press(view, "apply-percent-discount");

      expect(view.getByTestId("discount-probe").props.children).toBe('{"type":"PERCENT","percent":20}');
      // Prestations 95,00 € → Réduction -20 % -19,00 € → Total 76,00 €
      expect(view.getByTestId("appointment-services-total").props.children).toBe(formatEuros(95));
      const row = within(view.getByTestId("appointment-discount-row"));
      expect(row.getByText("Réduction -20 %")).toBeTruthy();
      expect(view.getByTestId("appointment-discount-value").props.children).toBe(`-${formatEuroCents(1900)}`);
      expect(view.getByTestId("appointment-discount-row").props.accessibilityLabel).toBe(
        `Réduction de 20 pour cent, -${formatEuroCents(1900)}`,
      );
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(7600));

      // The final amount carries the strongest monetary emphasis; the discount line stays quiet.
      const total = StyleSheet.flatten(view.getByTestId("appointment-expected-total-value").props.style);
      const discount = StyleSheet.flatten(view.getByTestId("appointment-discount-value").props.style);
      expect(total).toMatchObject({ fontFamily: getAppTextStyle("summaryValue", "ios").fontFamily });
      expect(discount).toMatchObject({ fontFamily: getAppTextStyle("metadata", "ios").fontFamily });
      expect(total.fontSize).toBeGreaterThan(discount.fontSize as number);
      expect(total.fontFamily).not.toBe(discount.fontFamily);
    });

    it("shows a fixed discount without a percentage, clamps an oversized one to the services, and removes the row when cleared", async () => {
      const view = await renderDetails("agenda-sofia", <DiscountProbe />);

      await press(view, "apply-fixed-discount");
      expect(within(view.getByTestId("appointment-discount-row")).getByText("Réduction")).toBeTruthy();
      expect(view.getByTestId("appointment-discount-value").props.children).toBe(`-${formatEuroCents(1500)}`);
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(8000));

      await press(view, "apply-oversized-discount");
      expect(view.getByTestId("appointment-discount-value").props.children).toBe(`-${formatEuroCents(9500)}`);
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(0));

      await press(view, "clear-discount");
      expect(view.getByTestId("discount-probe").props.children).toBe("null");
      expect(view.queryByTestId("appointment-discount-row")).toBeNull();
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(9500));
    });

    it("discounts the services only: a Product sold during the Appointment keeps its price", async () => {
      const db = openTestDatabase();
      persistLinkedSales(db, [MASQUE_ID]);
      const view = await renderDetails("agenda-sofia", <DiscountProbe />, db);
      await press(view, "apply-percent-discount");

      // 95 − 19 + 50
      expect(view.getByTestId("appointment-expected-total-value").props.children).toBe(formatEuroCents(12600));
    });

    it("checks out the FINAL discounted total, then refuses any further discount change", async () => {
      jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
      const view = await renderDetails("agenda-sofia", <DiscountProbe />);
      await press(view, "apply-percent-discount");
      await press(view, "checkout-appointment");

      expect(view.getByTestId("checkout-services-total").props.children).toBe(formatEuroCents(9500));
      expect(view.getByTestId("checkout-discount").props.children).toBe(formatEuroCents(-1900));
      expect(within(view.getByTestId("checkout-expectation")).getByText("Réduction -20 %")).toBeTruthy();
      expect(view.getByTestId("checkout-expected-total").props.children).toBe(formatEuroCents(7600));
      const expected = StyleSheet.flatten(view.getByTestId("checkout-expected-total").props.style);
      const discountLine = StyleSheet.flatten(view.getByTestId("checkout-discount").props.style);
      expect(expected.fontSize).toBeGreaterThan(discountLine.fontSize as number);
      expect(expected.fontFamily).not.toBe(discountLine.fontFamily);

      await typeAmount(view, "card", "76");
      expect(view.queryByTestId("checkout-difference")).toBeNull();
      await press(view, "confirm-checkout");
      await settleSheetTransition();

      expect(view.getByTestId("appointment-status").props.children).toBe("COMPLETED");
      expect(view.getByTestId("appointment-payment-probe").props.children).toBe("7600/0");
      // History still explains the amount…
      expect(view.getByTestId("appointment-discount-value").props.children).toBe(`-${formatEuroCents(1900)}`);

      // …and can no longer be rewritten.
      await press(view, "clear-discount");
      expect(view.getByTestId("discount-refused").props.children).toBe("true");
      expect(view.getByTestId("discount-probe").props.children).toBe('{"type":"PERCENT","percent":20}');
    });
  });

  describe("birthday indication", () => {
    it("mentions the Client birthday, statically, when the Appointment date is her birthday", async () => {
      const view = await renderDetails("agenda-sofia", <BirthdayProbe />);
      expect(view.queryByTestId("appointment-birthday-indication")).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId("give-sofia-appointment-day-birthday"));
      });

      const indication = view.getByTestId("appointment-birthday-indication");
      expect(indication.props.accessibilityLabel).toBe("Anniversaire de la cliente");
      expect(within(indication).getByText("Anniversaire de la cliente")).toBeTruthy();
      // Read-only: no celebration, no discount control — « Modifier » owns the discount.
      expect(view.queryByTestId("birthday-confetti", { includeHiddenElements: true })).toBeNull();
      expect(view.queryByTestId("appointment-discount")).toBeNull();
      expect(view.queryByText("Appliquer une réduction")).toBeNull();
      expect(view.getByTestId("modify-appointment")).toBeTruthy();
      expect(mockSuccessHaptic).not.toHaveBeenCalled();
    });

    it("shows nothing when the birthday is another day", async () => {
      const view = await renderDetails("agenda-sofia", <BirthdayProbe />);
      await act(async () => {
        fireEvent.press(view.getByTestId("give-sofia-next-day-birthday"));
      });

      expect(view.queryByTestId("appointment-birthday-indication")).toBeNull();
    });

    it("keeps a completed birthday Appointment read-only: the mention, never a discount action", async () => {
      const view = await renderDetails("agenda-sofia", <BirthdayProbe />);
      await act(async () => {
        fireEvent.press(view.getByTestId("give-sofia-appointment-day-birthday"));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId("complete-sofia-appointment"));
      });

      expect(view.getByTestId("appointment-birthday-indication")).toBeTruthy();
      expect(view.queryByTestId("modify-appointment")).toBeNull();
      expect(view.queryByTestId("appointment-discount")).toBeNull();
      expect(view.queryByText("Appliquer une réduction")).toBeNull();
    });

    it("drops the mention on a cancelled Appointment", async () => {
      const view = await renderDetails("agenda-sofia", <BirthdayProbe />);
      await act(async () => {
        fireEvent.press(view.getByTestId("give-sofia-appointment-day-birthday"));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId("cancel-sofia-appointment"));
      });

      expect(view.getByText("Annulé")).toBeTruthy();
      expect(view.queryByTestId("appointment-birthday-indication")).toBeNull();
    });
  });
  // Quick edits change the schedule without « Modifier »: they go through THE
  // same domain rule as the full editor (docs/domain/CALENDAR_BLOCKS.md §5).
  describe("quick edits vs Calendar Blocks", () => {
    const APPOINTMENT = "quick-edit-appointment";
    const at = (hour: number, minute = 0) => new Date(2026, 7, 31, hour, minute);

    // 10:00 Coupe 30 (staff) · Balayage: Application 45 (staff) + Pose 40
    // (unattended) · Brushing 20 (staff)
    //   busy 10:00–11:15 · FREE 11:15–11:55 · busy 11:55–12:15
    const COUPE: AppointmentItem = {
      id: "qe-coupe", serviceId: "service-cut", order: 0, serviceName: "Coupe", serviceType: "SERVICE", price: 30,
      phases: [{ id: "qe-coupe-phase", name: "Coupe", durationMinutes: 30, requiresStaff: true }],
    };
    const BALAYAGE: AppointmentItem = {
      id: "qe-balayage", serviceId: "service-highlights", order: 1, serviceName: "Balayage", serviceType: "TECHNIQUE", price: 50,
      phases: [
        { id: "qe-application", name: "Application", durationMinutes: 45, requiresStaff: true },
        { id: "qe-pose", name: "Temps de pose", durationMinutes: 40, requiresStaff: false },
      ],
    };
    const BRUSHING: AppointmentItem = {
      id: "qe-brushing", serviceId: "service-brushing", order: 2, serviceName: "Brushing", serviceType: "SERVICE", price: 20,
      phases: [{ id: "qe-brushing-phase", name: "Brushing", durationMinutes: 20, requiresStaff: true }],
    };

    function openDatabase(
      block: { readonly startAt: Date; readonly endAt: Date; readonly staffMemberId?: string } | undefined,
      items: readonly AppointmentItem[] = [COUPE, BALAYAGE, BRUSHING],
    ) {
      const db = openTestDatabase();
      bootstrapPersistence(db, () => createDevelopmentSeed(new Date()));
      insertAppointment(db, {
        id: APPOINTMENT,
        businessId: "business-test",
        clientId: "client-agenda-sofia",
        staffMemberId: "staff-amelie",
        startAt: at(10),
        status: "SCHEDULED",
        items,
      });
      if (block) {
        insertCalendarBlock(db, {
          id: "block-pause",
          businessId: "business-test",
          staffMemberId: block.staffMemberId ?? "staff-amelie",
          startAt: block.startAt,
          endAt: block.endAt,
          reason: "Pause",
        });
      }
      return db;
    }

    const stored = (db: ReturnType<typeof openTestDatabase>) =>
      loadAppointments(db).find((appointment) => appointment.id === APPOINTMENT);
    const storedDurations = (db: ReturnType<typeof openTestDatabase>) =>
      (stored(db)?.items ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((item) => `${item.id}:${item.phases.map((phase) => phase.durationMinutes).join("/")}`);

    async function expand(view: Awaited<ReturnType<typeof render>>, serviceName: string) {
      await act(async () => {
        fireEvent.press(view.getByLabelText(new RegExp(`${serviceName}, commence à`)));
      });
    }

    const MESSAGE = "Ce changement ferait empiéter le rendez-vous sur un créneau indisponible.";

    it("rejects a duration extension into a block: inline feedback, nothing persisted, the draft kept", async () => {
      const db = openDatabase({ startAt: at(12, 15), endAt: at(13) });
      const before = storedDurations(db);
      const view = await renderDetails(APPOINTMENT, undefined, db);
      await expand(view, "Brushing");

      await stepPose(view, "qe-brushing-phase", 1); // 11:55–12:20 would cross 12:15
      expect(view.queryByTestId("appointment-quick-edit-conflict")).toBeNull(); // a draft is not a change
      await press(view, "save-service-timing-qe-brushing");

      expect(view.getByText(MESSAGE)).toBeTruthy();
      expect(view.getByText("Indisponible — Pause, 12:15–13:00")).toBeTruthy();
      expect(view.getByTestId("appointment-quick-edit-conflict").props.accessibilityRole).toBe("alert");
      // Nothing was written, clamped or moved: SQLite, the session and the block are as before.
      expect(storedDurations(db)).toEqual(before);
      expect(view.getByText("10:00 – 12:15")).toBeTruthy();
      expect(view.getByTestId("service-meta-qe-brushing").props.children).toBe("20 min");
      // The professional keeps her draft and can adjust it.
      expect(phaseValue(view, "qe-brushing-phase")).toBe("25 min");
      expect(view.getByTestId("save-service-timing-qe-brushing").props.accessibilityState.disabled).toBe(false);
      expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
      expect(mockSuccessHaptic).not.toHaveBeenCalled();
      expect(mockAlert).not.toHaveBeenCalled();
    });

    it("allows a reduction that does not conflict, and clears the earlier feedback", async () => {
      const db = openDatabase({ startAt: at(12, 15), endAt: at(13) });
      const view = await renderDetails(APPOINTMENT, undefined, db);
      await expand(view, "Brushing");
      await stepPose(view, "qe-brushing-phase", 1);
      await press(view, "save-service-timing-qe-brushing");
      expect(view.getByText(MESSAGE)).toBeTruthy();

      await stepPose(view, "qe-brushing-phase", -2); // 25 → 15 min
      await press(view, "save-service-timing-qe-brushing");

      expect(view.queryByTestId("appointment-quick-edit-conflict")).toBeNull();
      expect(storedDurations(db)).toEqual(["qe-coupe:30", "qe-balayage:45/40", "qe-brushing:15"]);
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it("allows a schedule change that stays entirely outside the blocks — adjacency included", async () => {
      const db = openDatabase({ startAt: at(12, 20), endAt: at(13) });
      const view = await renderDetails(APPOINTMENT, undefined, db);
      await expand(view, "Brushing");

      await stepPose(view, "qe-brushing-phase", 1); // ends 12:20, exactly when the block starts
      await press(view, "save-service-timing-qe-brushing");

      expect(view.queryByTestId("appointment-quick-edit-conflict")).toBeNull();
      expect(storedDurations(db)[2]).toBe("qe-brushing:25");
      expect(mockWarningHaptic).not.toHaveBeenCalled();
    });

    it("does not check an edit whose occupied intervals are identical, even over a pre-existing overlap", async () => {
      // A block created on another device, right over the Coupe. The Pose is
      // the LAST phase here: lengthening it moves no staff-required interval.
      const db = openDatabase({ startAt: at(10), endAt: at(10, 20) }, [COUPE, BALAYAGE]);
      const view = await renderDetails(APPOINTMENT, undefined, db);
      await expand(view, "Balayage");

      await stepPose(view, "qe-pose", 2);
      await press(view, "save-service-timing-qe-balayage");

      expect(view.queryByTestId("appointment-quick-edit-conflict")).toBeNull();
      expect(storedDurations(db)).toEqual(["qe-coupe:30", "qe-balayage:45/50"]);
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it("keeps the processing-gap rule: a block inside the unattended phase is free, a staff phase reaching it is not", async () => {
      const db = openDatabase({ startAt: at(11, 20), endAt: at(11, 50) }); // inside 11:15–11:55
      const view = await renderDetails(APPOINTMENT, undefined, db);
      await expand(view, "Balayage");

      // A longer Pose moves the Brushing to 12:00–12:20: the gap still covers the block.
      await stepPose(view, "qe-pose", 1);
      await press(view, "save-service-timing-qe-balayage");
      expect(view.queryByTestId("appointment-quick-edit-conflict")).toBeNull();
      expect(storedDurations(db)[1]).toBe("qe-balayage:45/45");

      // A longer Application (→ 11:25) runs into it: judged on the interval, not the envelope.
      await stepPose(view, "qe-application", 2);
      await press(view, "save-service-timing-qe-balayage");
      expect(view.getByText(MESSAGE)).toBeTruthy();
      expect(view.getByText("Indisponible — Pause, 11:20–11:50")).toBeTruthy();
      expect(storedDurations(db)[1]).toBe("qe-balayage:45/45");
    });

    it("rejects a reorder that moves a staff phase into the block, and keeps the stored order", async () => {
      const db = openDatabase({ startAt: at(11, 20), endAt: at(11, 50) });
      const view = await renderDetails(APPOINTMENT, undefined, db);

      // Balayage first → Coupe 11:25–11:55 lands in the block.
      await act(async () => {
        dragServiceRow("qe-balayage", -100);
      });

      expect(view.getByText(MESSAGE)).toBeTruthy();
      expect(storedDurations(db).map((entry) => entry.split(":")[0])).toEqual(["qe-coupe", "qe-balayage", "qe-brushing"]);
      expect(mockWarningHaptic).toHaveBeenCalledTimes(1);
    });

    it("rejects a removal that pulls a staff phase into the block, and keeps the Service", async () => {
      const db = openDatabase({ startAt: at(11, 20), endAt: at(11, 50) });
      const view = await renderDetails(APPOINTMENT, undefined, db);

      // Without the Coupe everything starts 30 min earlier: Brushing 11:25–11:45.
      await press(view, "appointment-service-qe-coupe-swipe-full");

      expect(view.getByText(MESSAGE)).toBeTruthy();
      expect(stored(db)?.items).toHaveLength(3);
      expect(view.getByTestId("service-section-qe-coupe")).toBeTruthy();
    });

    it("allows a removal that changes the schedule without reaching any block", async () => {
      const db = openDatabase({ startAt: at(11, 20), endAt: at(11, 50) });
      const view = await renderDetails(APPOINTMENT, undefined, db);

      await press(view, "appointment-service-qe-brushing-swipe-full");

      expect(view.queryByTestId("appointment-quick-edit-conflict")).toBeNull();
      expect(stored(db)?.items.map((item) => item.id)).toEqual(["qe-coupe", "qe-balayage"]);
    });

    it("ignores the block of another staff member", async () => {
      const db = openDatabase({ startAt: at(12, 15), endAt: at(13), staffMemberId: "staff-other" });
      const view = await renderDetails(APPOINTMENT, undefined, db);
      await expand(view, "Brushing");

      await stepPose(view, "qe-brushing-phase", 3);
      await press(view, "save-service-timing-qe-brushing");

      expect(view.queryByTestId("appointment-quick-edit-conflict")).toBeNull();
      expect(storedDurations(db)[2]).toBe("qe-brushing:35");
    });

    it("keeps Appointment-versus-Appointment overlap allowed", async () => {
      const db = openDatabase(undefined);
      insertAppointment(db, {
        id: "next-client",
        businessId: "business-test",
        clientId: "client-agenda-lea",
        staffMemberId: "staff-amelie",
        startAt: at(12, 15),
        status: "SCHEDULED",
        items: [{ ...COUPE, id: "next-coupe" }],
      });
      const view = await renderDetails(APPOINTMENT, undefined, db);
      await expand(view, "Brushing");

      await stepPose(view, "qe-brushing-phase", 4); // runs over the next client until 12:35
      await press(view, "save-service-timing-qe-brushing");

      expect(view.queryByTestId("appointment-quick-edit-conflict")).toBeNull();
      expect(storedDurations(db)[2]).toBe("qe-brushing:40");
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it("leaves the status rules alone: a completed Appointment offers no quick edit to validate", async () => {
      const db = openDatabase({ startAt: at(12, 15), endAt: at(13) });
      jest.setSystemTime(new Date(2026, 8, 2, 9, 0)); // two days later: finalized by reconciliation
      const view = await renderDetails(APPOINTMENT, undefined, db);

      expect(stored(db)?.status).toBe("COMPLETED");
      expect(view.queryByTestId("modify-appointment")).toBeNull();
      expect(view.queryByTestId("appointment-service-qe-coupe-swipe-full")).toBeNull();
      expect(view.queryByTestId("save-service-timing-qe-brushing")).toBeNull();
    });
  });
});

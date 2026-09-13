import {
  act,
  fireEvent,
  render,
  userEvent,
  within,
} from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from "@/features/appointments/session/AppointmentSessionProvider";
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
import { loadAppointments } from "@/persistence/stores/appointments";
import { openTestDatabase } from "@/persistence/testing/node-sqlite-database";
import { haptics } from "@/shared/lib/haptics";
import { formatEuroCents, formatEuros } from "@/shared/lib/money";

import { AppointmentDetailsScreen } from "../AppointmentDetailsScreen";
import { TestPersistenceProvider } from "@/providers/testing/TestPersistenceProvider";
import { settleSheetTransition } from "@/shared/ui/testing/sheet-transitions";

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockWarningHaptic = jest.spyOn(haptics, "warning").mockImplementation();
const mockSuccessHaptic = jest.spyOn(haptics, "success").mockImplementation();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

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
  const { setProductStock } = useProductCatalog();
  const { completeSale } = useSaleSession();
  const completedAt = new Date(2026, 7, 29, 14, 30);
  return (
    <>
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
                <AppointmentDetailsScreen appointmentId={appointmentId} />
                <AppointmentPresence appointmentId={appointmentId} />
                <SaleProbe />
                <CatalogProbe />
                {probes}
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

  it("lists the Products sold during the appointment from Sale snapshots, not the Client's other Sales", async () => {
    const view = await renderDetails();
    expect(view.queryByTestId("appointment-products")).toBeNull();

    await press(view, "stock-products");
    await press(view, "sell-linked-shampoo");
    await press(view, "sell-linked-serum");
    await press(view, "sell-unlinked");

    const products = within(view.getByTestId("appointment-products"));
    expect(products.getByText("Produits vendus")).toBeTruthy();
    const lines = products.getAllByTestId("appointment-product-line");
    expect(lines).toHaveLength(2);
    expect(within(lines[0]!).getByText("Masque réparateur 5 min")).toBeTruthy();
    expect(within(lines[0]!).getByText(`×2 · ${formatEuros(50)}`)).toBeTruthy();
    expect(within(lines[0]!).getByText(formatEuros(100))).toBeTruthy();
    expect(within(lines[1]!).getByText("Acidic bonding concentrate")).toBeTruthy();
    expect(within(lines[1]!).getByText(`×1 · ${formatEuros(12)}`)).toBeTruthy();
    expect(view.getByTestId("appointment-products-total").props.children).toBe(formatEuros(112));

    // The checkout expectation includes the linked Products, not the unlinked Sale.
    jest.setSystemTime(new Date(2026, 7, 29, 15, 0));
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    await press(view, "checkout-appointment");
    expect(view.getByTestId("checkout-services-total").props.children).toBe(formatEuroCents(9500));
    expect(view.getByTestId("checkout-products-total").props.children).toBe(formatEuroCents(11200));
    expect(view.getByTestId("checkout-expected-total").props.children).toBe(formatEuroCents(20700));
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
});

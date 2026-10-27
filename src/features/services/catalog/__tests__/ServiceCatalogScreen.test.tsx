import { act, fireEvent, render, within } from "@testing-library/react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import {
  ServiceCatalogProvider,
  useServiceCatalog,
} from "../../session/ServiceCatalogProvider";
import { ServiceCatalogScreen } from "../ServiceCatalogScreen";
import { TestPersistenceProvider } from "@/providers/testing/TestPersistenceProvider";
import { serviceCategoryColors } from "@/shared/ui/theme";
import { settleFloatingReveal } from "@/shared/ui/testing/sheet-transitions";

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual("react") as typeof import("react");
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

// Exposes the glyph name only, so a row's family pictogram can be checked
// without depending on how the symbol is drawn.
jest.mock("expo-symbols", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");
  return {
    SymbolView: ({ name }: { readonly name: { readonly ios: string } }) =>
      React.createElement(View, { testID: `symbol-${name.ios}` }),
  };
});

jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");
  return {
    SafeAreaView: ({
      children,
      ...props
    }: {
      readonly children?: React.ReactNode;
    }) => React.createElement(View, props, children),
  };
});

function CatalogProbe() {
  const { addService, services, setServiceActive } = useServiceCatalog();
  return (
    <>
      <Text testID="catalog-count">{services.length}</Text>
      <Pressable
        testID="deactivate-brushing-1"
        onPress={() => setServiceActive("service-brushing-brushing-1", false)}
      />
      <Pressable
        testID="add-unknown-prestations"
        onPress={() => {
          addService({
            id: "service-unknown",
            businessId: "business-test",
            name: "Forfait découverte avec un nom vraiment très long pour la ligne",
            type: "SERVICE",
            price: 1250,
            phases: [
              {
                id: "service-unknown-phase",
                name: "Soin",
                durationMinutes: 40,
                requiresStaff: true,
              },
            ],
            active: true,
          });
          addService({
            id: "technique-unknown",
            businessId: "business-test",
            name: "Permanente",
            type: "TECHNIQUE",
            price: 80,
            phases: [
              {
                id: "technique-unknown-a",
                name: "Pose",
                durationMinutes: 20,
                requiresStaff: true,
              },
              {
                id: "technique-unknown-b",
                name: "Temps de pose",
                durationMinutes: 25,
                requiresStaff: false,
              },
            ],
            active: true,
          });
        }}
      />
    </>
  );
}

function rowIcon(view: Awaited<ReturnType<typeof render>>, serviceId: string) {
  return view.getByTestId(`catalog-service-icon-${serviceId}`, {
    includeHiddenElements: true,
  });
}

function hasGlyph(
  view: Awaited<ReturnType<typeof render>>,
  serviceId: string,
  glyph: string,
): boolean {
  return (
    within(rowIcon(view, serviceId)).queryByTestId(`symbol-${glyph}`, {
      includeHiddenElements: true,
    }) !== null
  );
}

function renderCatalog() {
  return render(
    <TestPersistenceProvider>
      <ServiceCatalogProvider>
        <ServiceCatalogScreen />
        <CatalogProbe />
      </ServiceCatalogProvider>
    </TestPersistenceProvider>,
  );
}

describe("ServiceCatalogScreen", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it("shows ONE category at a time behind the Services / Techniques segment", async () => {
    const view = await renderCatalog();

    expect(
      view.getByRole("header", { name: "Prestations & tarifs" }),
    ).toBeTruthy();
    const services = view.getByTestId("catalog-category-SERVICE");
    const techniques = view.getByTestId("catalog-category-TECHNIQUE");
    expect(within(services).getByText("Services")).toBeTruthy();
    expect(within(techniques).getByText("Techniques")).toBeTruthy();
    // Live counts, spoken with the label; Services selected first.
    expect(services.props.accessibilityState).toMatchObject({ selected: true });
    expect(within(services).getByText("8")).toBeTruthy();
    expect(within(techniques).getByText("8")).toBeTruthy();
    // No redundant « Actives » eyebrow, no legacy category headers.
    expect(view.queryByText("Actifs")).toBeNull();
    expect(view.queryByText("Brushing")).toBeNull();
    expect(view.queryByText("Coloration")).toBeNull();

    // Services only.
    expect(view.getByText("Brushing 1")).toBeTruthy();
    expect(view.getByText("20,00 €")).toBeTruthy();
    expect(view.getByText("30 min")).toBeTruthy();
    expect(view.queryByText("Balayage 1")).toBeNull();
    expect(view.queryByText(/de pose/)).toBeNull();

    // Techniques only, with the existing pose-time metadata.
    await act(async () => {
      fireEvent.press(techniques);
    });
    expect(
      view.getByTestId("catalog-category-TECHNIQUE").props.accessibilityState,
    ).toMatchObject({
      selected: true,
    });
    expect(view.getByText("Balayage 1")).toBeTruthy();
    expect(view.getByText("2 h 30 min · dont 1 h de pose")).toBeTruthy();
    expect(view.queryByText("Brushing 1")).toBeNull();
    expect(view.queryByText(/Technique · \d+ phases/)).toBeNull();
  });

  it("searches inside the selected category and offers the other one on no match", async () => {
    const view = await renderCatalog();
    const search = view.getByLabelText("Rechercher une prestation");
    expect(search.props.placeholder).toBe("Rechercher une prestation");

    await act(async () => {
      fireEvent.changeText(search, "brush");
    });
    expect(view.getByText("Brushing 1")).toBeTruthy();
    expect(view.getByText("Brushing 3")).toBeTruthy();
    expect(view.queryByText("Chignon")).toBeNull();
    // Matches anywhere in the name, within the Services segment only.
    expect(view.getByText("Coupe Brushing 1")).toBeTruthy();
    expect(view.queryByText("Balayage 1")).toBeNull();

    // Accent-insensitive, and scoped: « balayage » finds nothing in Services…
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Rechercher une prestation"),
        "BALAYAGE",
      );
    });
    expect(view.getByText("Aucune prestation trouvée")).toBeTruthy();
    // …but offers the Techniques matches, keeping the query.
    await act(async () => {
      fireEvent.press(view.getByTestId("catalog-show-other-category"));
    });
    expect(view.getByText("Balayage 1")).toBeTruthy();
    expect(view.queryByText("Couleur Racines")).toBeNull();
    expect(view.getByLabelText("Rechercher une prestation").props.value).toBe(
      "BALAYAGE",
    );
  });

  it("leads every row with the shared family pictogram in its category colours", async () => {
    const view = await renderCatalog();

    // The Brushing family shares one glyph; Coupe has its own.
    for (const id of [
      "service-brushing-brushing-1",
      "service-brushing-brushing-2",
      "service-brushing-brushing-3",
    ]) {
      expect(hasGlyph(view, id, "wind")).toBe(true);
    }
    const cut = view.getByText("Coupe Femme / Homme");
    expect(cut).toBeTruthy();
    const cutId = view
      .getAllByTestId(/^catalog-service-service-/)
      .map((row) => row.props.testID as string)
      .find((testID) => testID.includes("coupe"))
      ?.replace("catalog-service-", "");
    expect(cutId).toBeDefined();
    expect(hasGlyph(view, cutId!, "scissors")).toBe(true);
    // Service: violet whisper; decorative, hidden from VoiceOver.
    const brushingIcon = rowIcon(view, "service-brushing-brushing-1");
    expect(StyleSheet.flatten(brushingIcon.props.style).backgroundColor).toBe(
      serviceCategoryColors.SERVICE.tint,
    );
    expect(brushingIcon.props.accessibilityElementsHidden).toBe(true);
    // The name is primary navy, never the category violet.
    expect(
      StyleSheet.flatten(view.getByText("Brushing 1").props.style).color,
    ).not.toBe(serviceCategoryColors.SERVICE.accent);

    // Unknown names fall back on their type.
    await act(async () => {
      fireEvent.press(view.getByTestId("add-unknown-prestations"));
    });
    expect(hasGlyph(view, "service-unknown", "scissors")).toBe(true);
    expect(view.getByText("1 250,00 €")).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId("catalog-category-TECHNIQUE"));
    });
    expect(hasGlyph(view, "technique-unknown", "sparkles")).toBe(true);
    expect(
      StyleSheet.flatten(rowIcon(view, "technique-unknown").props.style)
        .backgroundColor,
    ).toBe(serviceCategoryColors.TECHNIQUE.tint);
    expect(view.getByText("45 min · dont 25 min de pose")).toBeTruthy();
  });

  it("no longer draws the decorative scissors watermark", async () => {
    const view = await renderCatalog();

    expect(
      view.queryByTestId("screen-watermark-services", {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  it("opens the existing Service editor with only its stable id", async () => {
    const view = await renderCatalog();

    await act(async () => {
      fireEvent.press(
        view.getByTestId("catalog-service-service-brushing-brushing-1"),
      );
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/services/[serviceId]",
      params: { serviceId: "service-brushing-brushing-1" },
    });
  });

  it("opens the create flow", async () => {
    const view = await renderCatalog();

    await settleFloatingReveal();
    await act(async () => {
      fireEvent.press(view.getByTestId("add-service"));
    });

    expect(mockPush).toHaveBeenCalledWith("/services/new");
    // The former large inline CTA is gone; the shared floating + is the only entry.
    expect(view.queryByText("Ajouter une prestation")).toBeNull();
    expect(view.getByTestId("add-service").props.accessibilityLabel).toBe(
      "Ajouter une prestation",
    );
  });

  it("keeps a deactivated Service reachable under « Inactives » of its category", async () => {
    const view = await renderCatalog();

    await act(async () => {
      fireEvent.press(view.getByTestId("deactivate-brushing-1"));
    });

    // The Service is kept; only the active/inactive split changes.
    expect(view.getByTestId("catalog-count").props.children).toBe(16);
    expect(
      within(view.getByTestId("catalog-category-SERVICE")).getByText("8"),
    ).toBeTruthy();
    expect(view.getByText("Inactives")).toBeTruthy();
    expect(view.getByText("7")).toBeTruthy();
    expect(view.getByText("1")).toBeTruthy();
    expect(view.getByText("Brushing 1")).toBeTruthy();
    // Techniques have no inactive entries.
    await act(async () => {
      fireEvent.press(view.getByTestId("catalog-category-TECHNIQUE"));
    });
    expect(view.queryByText("Inactives")).toBeNull();
  });
});

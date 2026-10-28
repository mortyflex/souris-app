import { act, fireEvent, render, within } from "@testing-library/react-native";
import { Alert, StyleSheet, Text } from "react-native";

import {
  ServiceCatalogProvider,
  useServiceCatalog,
} from "../../session/ServiceCatalogProvider";
import { ServiceEditorScreen } from "../ServiceEditorScreen";
import {
  TestPersistenceProvider,
  testBusiness,
} from "@/providers/testing/TestPersistenceProvider";
import { serviceCategoryColors } from "@/shared/ui/theme";
import { settleSheetTransition } from "@/shared/ui/testing/sheet-transitions";
import { createDevelopmentSeed } from "@/providers/development-seed";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));

// SheetScreen (content fit) holds the route's removal while the sheet slides down.
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: jest.fn(),
}));

jest.mock("react-native-reanimated", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");
  const AnimatedView = (props: { readonly children?: React.ReactNode }) =>
    React.createElement(View, props);

  return {
    __esModule: true,
    default: Object.assign(AnimatedView, {
      View: AnimatedView,
      createAnimatedComponent: (component: unknown) => component,
    }),
    useSharedValue: (initial: unknown) => {
      let value = initial;
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
  };
});

jest.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: never[]) => void, ...args: never[]) =>
    fn(...args),
}));

jest.mock("expo-symbols", () => ({ SymbolView: () => null }));

// Mirrors the iOS Modal contract (onDismiss once `visible` has dropped) so the
// « ••• » drawer → confirmation hand-off can be verified.
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");

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
      return this.props.visible
        ? React.createElement(View, null, this.props.children)
        : null;
    }
  }

  return { __esModule: true, default: MockModal };
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
  const { services } = useServiceCatalog();
  const managed =
    services.find((service) => service.name === "Coupe enfant") ??
    services.find((service) => service.name === "Balayage test") ??
    services.find((service) => service.id === "service-brushing-brushing-1");
  const brushing = services.find(
    (service) => service.id === "service-brushing-brushing-1",
  );

  return (
    <>
      <Text testID="managed-service">
        {managed
          ? `${managed.id}:${managed.name}:${managed.type}:${managed.price}:${managed.phases
              .map(
                (phase) =>
                  `${phase.id},${phase.name},${phase.durationMinutes},${phase.requiresStaff}`,
              )
              .join("|")}`
          : ""}
      </Text>
      <Text testID="brushing-active">
        {brushing ? String(brushing.active) : "gone"}
      </Text>
    </>
  );
}

/** Opens « ••• », picks an action, and lets the drawer close so the action runs. */
async function openServiceAction(
  view: Awaited<ReturnType<typeof render>>,
  testID: "toggle-service-active" | "open-service-deletion",
) {
  await act(async () => {
    fireEvent.press(view.getByTestId("open-service-actions"));
  });
  await settleSheetTransition();
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
  await settleSheetTransition();
}

function renderEditor(screen: React.ReactNode) {
  return render(
    <TestPersistenceProvider>
      <ServiceCatalogProvider>
        {screen}
        <CatalogProbe />
      </ServiceCatalogProvider>
    </TestPersistenceProvider>,
  );
}

describe("ServiceEditorScreen", () => {
  beforeEach(() => {
    mockBack.mockClear();
  });

  it("opens in the canonical sheet shell without auto-focusing a field", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    // Canonical creation header: « Annuler » + « Nouvelle prestation » only.
    expect(
      view.getByRole("header", { name: "Nouvelle prestation" }),
    ).toBeTruthy();
    expect(view.queryByText("NOUVELLE PRESTATION")).toBeNull();
    expect(view.queryByText("Ajouter une prestation")).toBeNull();
    expect(view.getAllByText("Annuler")).toHaveLength(1);
    // The type chooser is content-fit: never a fixed full-height sheet.
    // Sized by its content, capped at the canonical detent.
    expect(
      StyleSheet.flatten(view.getByTestId("service-sheet").props.style).flex,
    ).toBeUndefined();
    const surfaceStyle = StyleSheet.flatten(
      view.getByTestId("sheet-screen-surface").props.style,
    );
    expect(surfaceStyle.flex).toBeUndefined();
    expect(surfaceStyle.maxHeight).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(view.getByTestId("cancel-service-creation"));
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.press(view.getByTestId("choose-service-type-SERVICE"));
    });
    // The form keeps the same creation header.
    expect(
      view.getByRole("header", { name: "Nouvelle prestation" }),
    ).toBeTruthy();
    expect(
      view.getByLabelText("Nom de la prestation").props.autoFocus,
    ).toBeFalsy();
    expect(
      view.getByLabelText("Prix de la prestation").props.autoFocus,
    ).toBeFalsy();
    // The empty name suggests an example of the Business's profession.
    expect(view.getByLabelText("Nom de la prestation").props.placeholder).toBe(
      "Ex. Coupe",
    );
  });

  it("opens the unified Prestations form directly for a nail technician, with nail examples and no Service / Technique", async () => {
    const view = await render(
      <TestPersistenceProvider
        business={{ ...testBusiness, activityType: "NAILS" }}
      >
        <ServiceCatalogProvider>
          <ServiceEditorScreen mode="create" />
        </ServiceCatalogProvider>
      </TestPersistenceProvider>,
    );

    // Step 3: no type chooser — a single-duration prestation from the start.
    expect(view.queryByTestId("choose-service-type-SERVICE")).toBeNull();
    expect(view.queryByTestId("choose-service-type-TECHNIQUE")).toBeNull();
    expect(view.queryByTestId("service-form-category-pill")).toBeNull();
    expect(view.queryByText("Technique")).toBeNull();
    const name = view.getByLabelText("Nom de la prestation");
    expect(name.props.placeholder).toBe("Ex. Pose complète gel");
    // A hint only: the field starts empty and the name stays required.
    expect(name.props.value).toBe("");
    expect(view.getByLabelText("Durée de la prestation")).toBeTruthy();
    expect(view.getByTestId("service-form-category")).toBeTruthy();
    expect(view.getByTestId("service-form-description").props.placeholder).toBe(
      "Ex. Dépose d’un gel posé ailleurs : prévoir 15 min de plus.",
    );
    expect(view.getByTestId("service-form-phased-switch").props.value).toBe(false);
    expect(view.getByTestId("save-service").props.accessibilityState.disabled).toBe(true);
  });

  it("chooses the structure with two whole-card options: Service and Technique", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    expect(
      view.getByRole("header", { name: "Choisir le type de prestation" }),
    ).toBeTruthy();
    expect(
      view.getByText(
        "Sélectionnez la structure qui correspond le mieux au déroulé de votre prestation.",
      ),
    ).toBeTruthy();
    // Service / Technique vocabulary; the old wording is gone.
    expect(view.queryByText("Prestation simple")).toBeNull();
    expect(view.queryByText("Prestation technique")).toBeNull();
    const serviceCard = view.getByTestId("choose-service-type-SERVICE");
    const techniqueCard = view.getByTestId("choose-service-type-TECHNIQUE");
    expect(within(serviceCard).getByText("Service")).toBeTruthy();
    expect(
      within(serviceCard).getByText(
        "Une seule durée, la professionnelle reste occupée.",
      ),
    ).toBeTruthy();
    expect(within(techniqueCard).getByText("Technique")).toBeTruthy();
    expect(
      within(techniqueCard).getByText(
        "Plusieurs phases, dont un temps de pose.",
      ),
    ).toBeTruthy();
    expect(serviceCard.props.accessibilityLabel).toBe(
      "Service, une seule durée, la professionnelle reste occupée",
    );
    expect(techniqueCard.props.accessibilityLabel).toBe(
      "Technique, plusieurs phases, dont un temps de pose",
    );
    // Category colours: violet Service, azure Technique.
    expect(
      StyleSheet.flatten(
        view.getByTestId("choose-service-type-SERVICE-icon").props.style,
      ).backgroundColor,
    ).toBe(serviceCategoryColors.SERVICE.tint);
    expect(
      StyleSheet.flatten(
        view.getByTestId("choose-service-type-TECHNIQUE-icon").props.style,
      ).backgroundColor,
    ).toBe(serviceCategoryColors.TECHNIQUE.tint);
    expect(StyleSheet.flatten(serviceCard.props.style).borderColor).toBe(
      serviceCategoryColors.SERVICE.border,
    );
    expect(StyleSheet.flatten(techniqueCard.props.style).borderColor).toBe(
      serviceCategoryColors.TECHNIQUE.border,
    );
    // No footer CTA on the chooser.
    expect(view.queryByTestId("save-service")).toBeNull();
    expect(view.queryByText(/Continuer/)).toBeNull();

    // The whole Technique card opens the existing phases form.
    await act(async () => {
      fireEvent.press(techniqueCard);
    });
    expect(view.getByText("Phases")).toBeTruthy();
    expect(view.getByLabelText("Catégorie, Technique")).toBeTruthy();
    expect(view.queryByLabelText("Durée de la prestation")).toBeNull();
  });

  it("opens the existing single-duration form from the whole Service card", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByTestId("choose-service-type-SERVICE"));
    });
    expect(view.getByLabelText("Catégorie, Service")).toBeTruthy();
    expect(view.getByLabelText("Durée de la prestation")).toBeTruthy();
    expect(view.queryByText("Phases")).toBeNull();
    expect(
      within(view.getByTestId("save-service")).getByText(
        "Ajouter la prestation",
      ),
    ).toBeTruthy();
  });

  it("creates a simple Service from the professional-facing fields", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByTestId("choose-service-type-SERVICE"));
    });
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom de la prestation"),
        "Coupe enfant",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix de la prestation"), "25");
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Durée de la prestation"), "30");
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("save-service"));
    });

    const stored = view.getByTestId("managed-service").props.children as string;
    expect(stored).toContain(":Coupe enfant:SERVICE:25:");
    expect(stored).toContain(",Coupe enfant,30,true");
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("creates an arbitrary ordered TECHNIQUE with explicit processing semantics", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByTestId("choose-service-type-TECHNIQUE"));
    });
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom de la prestation"),
        "Balayage test",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix de la prestation"), "95");
    });
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom de la phase 1"),
        "Application",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Durée de la phase 1"), "30");
    });

    await act(async () => {
      fireEvent.press(view.getByText("Ajouter une phase"));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Durée de la phase 2"), "45");
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText("Phase 2, temps de pose"));
    });
    // A processing phase has one canonical identity: no custom name input.
    expect(view.queryByLabelText("Nom de la phase 2")).toBeNull();

    await act(async () => {
      fireEvent.press(view.getByText("Ajouter une phase"));
    });
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom de la phase 3"),
        "Finition",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Durée de la phase 3"), "30");
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("save-service"));
    });

    const stored = view.getByTestId("managed-service").props.children as string;
    expect(stored).toContain(":Balayage test:TECHNIQUE:95:");
    expect(stored).toContain(",Application,30,true|");
    expect(stored).toContain(",Temps de pose,45,false|");
    expect(stored).toContain(",Finition,30,true");
  });

  it("shows a simple Service in the detail-sheet family: header, summary, Durée only", async () => {
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="service-brushing-brushing-1"
      />,
    );

    // Header: the name, « ••• » and ×; no eyebrow, no textual « Fermer ».
    expect(view.getByRole("header", { name: "Brushing 1" })).toBeTruthy();
    expect(view.queryByText("PRESTATION")).toBeNull();
    expect(view.queryByText("Fermer")).toBeNull();
    expect(view.getByLabelText("Actions de la prestation")).toBeTruthy();
    expect(
      view.getByTestId("close-service-details").props.accessibilityLabel,
    ).toBe("Fermer");

    // Summary: price, status and the written category.
    const summary = within(view.getByTestId("service-summary"));
    expect(summary.getByText("20,00 €")).toBeTruthy();
    expect(summary.getByLabelText("Prestation active")).toBeTruthy();
    expect(summary.getByText("Active")).toBeTruthy();
    expect(summary.getByLabelText("Catégorie, Service")).toBeTruthy();
    expect(
      StyleSheet.flatten(
        view.getByTestId("service-category-pill-dot").props.style,
      ).backgroundColor,
    ).toBe(serviceCategoryColors.SERVICE.accent);
    // Decorative family pictogram on the Service whisper, hidden from VoiceOver
    // (absent from the default, accessibility-filtered queries).
    expect(view.queryByTestId("service-family-icon")).toBeNull();
    const icon = view.getByTestId("service-family-icon", {
      includeHiddenElements: true,
    });
    expect(StyleSheet.flatten(icon.props.style).backgroundColor).toBe(
      serviceCategoryColors.SERVICE.tint,
    );
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(icon.props.importantForAccessibility).toBe("no-hide-descendants");

    // Informations: Durée only — no zero « Temps de pose » row, no old card.
    const information = within(view.getByTestId("service-information"));
    expect(information.getByText("Durée")).toBeTruthy();
    expect(information.getByText("30 min")).toBeTruthy();
    expect(view.queryByTestId("service-processing")).toBeNull();
    expect(view.queryByText("Temps de pose")).toBeNull();
    expect(view.queryByText("Prix")).toBeNull();
    expect(view.queryByTestId("service-phases")).toBeNull();

    // ONE permanent action; management lives in « ••• ».
    expect(view.queryByText("Désactiver")).toBeNull();
    expect(view.queryByText("Supprimer")).toBeNull();
    expect(
      within(view.getByTestId("service-read-actions")).getByText(
        "Modifier la prestation",
      ),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId("open-service-actions"));
    });
    await settleSheetTransition();
    const menu = within(view.getByTestId("service-actions-sheet"));
    expect(menu.getByText("Désactiver la prestation")).toBeTruthy();
    expect(menu.getByText("Supprimer la prestation")).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByLabelText("Fermer les actions"));
    });
    await settleSheetTransition();

    // « Modifier la prestation » opens the existing edit form.
    await act(async () => {
      fireEvent.press(view.getByTestId("edit-service"));
    });
    expect(view.getByLabelText("Prix de la prestation").props.value).toBe(
      "20,00",
    );
  });

  it("shows a Technique with its category colour, Temps de pose and ordered phases", async () => {
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="technique-balayage-balayage-1"
      />,
    );

    expect(view.getByRole("header", { name: "Balayage 1" })).toBeTruthy();
    expect(view.getByLabelText("Catégorie, Technique")).toBeTruthy();
    expect(
      StyleSheet.flatten(
        view.getByTestId("service-category-pill-dot").props.style,
      ).backgroundColor,
    ).toBe(serviceCategoryColors.TECHNIQUE.accent);
    // Status and category never share colours.
    expect(
      StyleSheet.flatten(
        view.getByTestId("service-status-pill-dot").props.style,
      ).backgroundColor,
    ).not.toBe(serviceCategoryColors.TECHNIQUE.accent);
    expect(
      StyleSheet.flatten(
        view.getByTestId("service-family-icon", { includeHiddenElements: true })
          .props.style,
      ).backgroundColor,
    ).toBe(serviceCategoryColors.TECHNIQUE.tint);

    const information = within(view.getByTestId("service-information"));
    expect(information.getByText("Durée")).toBeTruthy();
    expect(information.getByText("Temps de pose")).toBeTruthy();
    expect(view.getByTestId("service-processing")).toBeTruthy();
    expect(view.getByTestId("service-phases")).toBeTruthy();
  });

  it("keeps read-only Service details concise for active and processing phases", async () => {
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="technique-balayage-balayage-1"
      />,
    );

    // Balayage 1: active phase + Temps de pose processing phase.
    expect(view.getAllByText("Balayage 1").length).toBeGreaterThanOrEqual(1);
    expect(view.getByText("Temps actif")).toBeTruthy();
    expect(view.getAllByText("Temps de pose").length).toBeGreaterThanOrEqual(1);
    // Read-only surfaces never repeat "professionnelle occupée/disponible".
    expect(view.queryByText(/professionnelle/i)).toBeNull();
  });

  it("keeps only one phase expanded and preserves values across collapse", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByTestId("choose-service-type-TECHNIQUE"));
    });
    // Phase 1 starts expanded.
    expect(view.getByLabelText("Nom de la phase 1")).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom de la phase 1"),
        "Application",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Durée de la phase 1"), "30");
    });

    // Adding a phase collapses the current one and expands the new one.
    await act(async () => {
      fireEvent.press(view.getByText("Ajouter une phase"));
    });
    expect(view.queryByLabelText("Nom de la phase 1")).toBeNull();
    expect(view.getByLabelText("Nom de la phase 2")).toBeTruthy();
    // The collapsed card keeps its identity, semantic type, and drag handle.
    expect(view.getByLabelText("Développer la phase 1")).toBeTruthy();
    expect(view.getAllByText("Temps actif").length).toBeGreaterThan(0);
    expect(view.getByLabelText("Déplacer la phase 1")).toBeTruthy();

    // Expanding a collapsed phase collapses the previous one; values survive.
    await act(async () => {
      fireEvent.press(view.getByLabelText("Développer la phase 1"));
    });
    expect(view.getByLabelText("Nom de la phase 1")).toBeTruthy();
    expect(view.queryByLabelText("Nom de la phase 2")).toBeNull();
    expect(view.getByDisplayValue("Application")).toBeTruthy();
    expect(view.getByDisplayValue("30")).toBeTruthy();

    // A third phase keeps the accordion rule.
    await act(async () => {
      fireEvent.press(view.getByText("Ajouter une phase"));
    });
    expect(view.queryByLabelText("Nom de la phase 1")).toBeNull();
    expect(view.getByLabelText("Nom de la phase 3")).toBeTruthy();
  });

  it("restores the draft active name when switching back from processing", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByTestId("choose-service-type-TECHNIQUE"));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Nom de la phase 1"), "Rinçage");
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Durée de la phase 1"), "10");
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText("Phase 1, temps de pose"));
    });
    expect(view.queryByLabelText("Nom de la phase 1")).toBeNull();

    // Back to active: the previous draft name is restored.
    await act(async () => {
      fireEvent.press(view.getByLabelText("Phase 1, temps actif"));
    });
    expect(view.getByLabelText("Nom de la phase 1")).toBeTruthy();
    expect(view.getByDisplayValue("Rinçage")).toBeTruthy();
  });

  it("requires a real name for an active phase switched from processing", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByTestId("choose-service-type-TECHNIQUE"));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Durée de la phase 1"), "20");
    });
    // Unnamed active phase → processing → back to active: no silent
    // "Temps de pose" save; the form requires a name.
    await act(async () => {
      fireEvent.press(view.getByLabelText("Phase 1, temps de pose"));
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText("Phase 1, temps actif"));
    });
    expect(view.getByLabelText("Nom de la phase 1").props.value).toBe("");
    expect(
      view.getByTestId("save-service").props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it("shows a Nouvelle phase placeholder for unnamed active phases without weakening validation", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByTestId("choose-service-type-TECHNIQUE"));
    });

    // Unnamed active phase: soft placeholder title, empty draft name.
    expect(view.getByText("Nouvelle phase")).toBeTruthy();
    expect(view.getByLabelText("Nom de la phase 1").props.value).toBe("");
    expect(
      view.getByTestId("save-service").props.accessibilityState?.disabled,
    ).toBe(true);

    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom de la prestation"),
        "Balayage",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix de la prestation"), "95");
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Durée de la phase 1"), "30");
    });

    // Still unnamed: the placeholder remains and validation keeps failing.
    expect(view.getByText("Nouvelle phase")).toBeTruthy();
    expect(
      view.getByTestId("save-service").props.accessibilityState?.disabled,
    ).toBe(true);

    // A real name replaces the placeholder, but a technique still needs a
    // processing phase before it can be saved.
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom de la phase 1"),
        "Application",
      );
    });
    expect(view.queryByText("Nouvelle phase")).toBeNull();
    expect(view.getByText("Application")).toBeTruthy();
    expect(
      view.getByTestId("save-service").props.accessibilityState?.disabled,
    ).toBe(true);

    await act(async () => {
      fireEvent.press(view.getByTestId("save-service"));
    });
    expect(
      view.getByText("Une technique doit contenir au moins un temps de pose."),
    ).toBeTruthy();

    // Switching the phase to processing satisfies the rule.
    await act(async () => {
      fireEvent.press(view.getByLabelText("Phase 1, temps de pose"));
    });
    expect(
      view.getByTestId("save-service").props.accessibilityState?.disabled,
    ).toBe(false);
  });

  it("collapses an unnamed phase into the placeholder and never stores it", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByTestId("choose-service-type-TECHNIQUE"));
    });
    await act(async () => {
      fireEvent.press(view.getByText("Ajouter une phase"));
    });

    // Phase 1 collapsed unnamed + phase 2 expanded unnamed: both show the
    // placeholder while the draft names stay empty.
    expect(view.getAllByText("Nouvelle phase").length).toBe(2);
    expect(view.queryByLabelText("Nom de la phase 1")).toBeNull();
    expect(view.getByLabelText("Nom de la phase 2").props.value).toBe("");
    expect(
      view.getByTestId("save-service").props.accessibilityState?.disabled,
    ).toBe(true);

    // Switching phase 2 to processing shows the canonical Temps de pose title.
    await act(async () => {
      fireEvent.press(view.getByLabelText("Phase 2, temps de pose"));
    });
    expect(view.getAllByText("Temps de pose").length).toBeGreaterThanOrEqual(1);
    expect(view.getAllByText("Nouvelle phase").length).toBe(1);
  });

  it("edits a Service in the canonical sheet: « Annuler » + title, Informations, one « Enregistrer »", async () => {
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="service-brushing-brushing-1"
      />,
    );
    await act(async () => {
      fireEvent.press(view.getByTestId("edit-service"));
    });

    // Header: the action, never the name; no eyebrow, no detail controls.
    expect(
      view.getByRole("header", { name: "Modifier la prestation" }),
    ).toBeTruthy();
    expect(view.queryByRole("header", { name: "Brushing 1" })).toBeNull();
    expect(view.queryByText("PRESTATION")).toBeNull();
    expect(view.queryByLabelText("Actions de la prestation")).toBeNull();
    expect(view.getAllByText("Annuler")).toHaveLength(1);
    expect(view.getByTestId("cancel-service-edit")).toBeTruthy();

    // Informations: the read-only type pill in the Service colours, then the fields.
    const information = within(view.getByTestId("service-form-information"));
    expect(information.getByText("Informations")).toBeTruthy();
    expect(information.getByLabelText("Catégorie, Service")).toBeTruthy();
    expect(
      StyleSheet.flatten(
        view.getByTestId("service-form-category-pill-dot").props.style,
      ).backgroundColor,
    ).toBe(serviceCategoryColors.SERVICE.accent);
    expect(view.queryByText("Prestation simple")).toBeNull();
    expect(information.getByLabelText("Nom de la prestation").props.value).toBe(
      "Brushing 1",
    );
    expect(
      information.getByLabelText("Prix de la prestation").props.value,
    ).toBe("20,00");
    expect(
      information.getByLabelText("Durée de la prestation").props.value,
    ).toBe("30");
    expect(information.getByText("€")).toBeTruthy();
    expect(information.getByText("min")).toBeTruthy();
    // A Service has no pose: no pose field, no phases.
    expect(view.queryByText("Temps de pose")).toBeNull();
    expect(view.queryByText("Phases")).toBeNull();
    // No management actions and no pictogram in the form.
    expect(view.queryByText(/Désactiver|Supprimer/)).toBeNull();
    expect(
      view.queryByTestId("service-family-icon", {
        includeHiddenElements: true,
      }),
    ).toBeNull();

    // ONE footer action: short visible label, explicit spoken label.
    const save = view.getByTestId("save-service");
    expect(within(save).getByText("Enregistrer")).toBeTruthy();
    expect(save.props.accessibilityLabel).toBe(
      "Enregistrer les modifications de la prestation",
    );
    expect(view.queryByText("Enregistrer les modifications")).toBeNull();

    // Validation still gates the same save.
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Nom de la prestation"), "  ");
    });
    expect(save.props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom de la prestation"),
        "Brushing express",
      );
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("save-service"));
    });
    expect(view.getByTestId("managed-service").props.children).toContain(
      ":Brushing express:SERVICE:20:",
    );
    // Success returns to the details.
    expect(view.getByRole("header", { name: "Brushing express" })).toBeTruthy();
  });

  it("edits a Technique with its type pill and its phases — where Temps de pose lives", async () => {
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="technique-balayage-balayage-1"
      />,
    );
    await act(async () => {
      fireEvent.press(view.getByTestId("edit-service"));
    });

    expect(
      view.getByRole("header", { name: "Modifier la prestation" }),
    ).toBeTruthy();
    expect(view.getByLabelText("Catégorie, Technique")).toBeTruthy();
    expect(
      StyleSheet.flatten(
        view.getByTestId("service-form-category-pill-dot").props.style,
      ).backgroundColor,
    ).toBe(serviceCategoryColors.TECHNIQUE.accent);
    expect(view.getByLabelText("Nom de la prestation").props.value).toBe(
      "Balayage 1",
    );
    // Timing is the ordered phases (the processing one included), never a single duration.
    expect(view.queryByLabelText("Durée de la prestation")).toBeNull();
    expect(view.getByText("Phases")).toBeTruthy();
    expect(view.getAllByText("Temps de pose").length).toBeGreaterThanOrEqual(1);

    // Cancel discards the draft and returns to the details.
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom de la prestation"),
        "Autre",
      );
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("cancel-service-edit"));
    });
    expect(view.getByRole("header", { name: "Balayage 1" })).toBeTruthy();
  });

  it("hydrates an existing Service and edits it without changing stable identity", async () => {
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="service-brushing-brushing-1"
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByTestId("edit-service"));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix de la prestation"), "28");
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Durée de la prestation"), "35");
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("save-service"));
    });

    expect(view.getByTestId("managed-service").props.children).toBe(
      "service-brushing-brushing-1:Brushing 1:SERVICE:28:service-brushing-brushing-1-phase,Brushing 1,35,true",
    );
    expect(view.getByText("28,00 €")).toBeTruthy();
    expect(view.getByText("35 min")).toBeTruthy();
  });

  it("deletes only after the shared BeautIzzy confirmation, never a native alert", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="service-brushing-brushing-1"
      />,
    );

    await openServiceAction(view, "open-service-deletion");
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId("service-deletion-dialog")).toBeTruthy();
    expect(view.getByText("Supprimer cette prestation ?")).toBeTruthy();
    expect(view.getByText(/Les rendez-vous existants/)).toBeTruthy();

    // Retour does nothing.
    await act(async () => {
      fireEvent.press(view.getByTestId("cancel-service-deletion"));
    });
    expect(view.queryByTestId("service-deletion-dialog")).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId("managed-service").props.children).toContain(
      "Brushing 1",
    );

    // Confirming removes the catalog record and closes the sheet.
    await openServiceAction(view, "open-service-deletion");
    await act(async () => {
      fireEvent.press(view.getByTestId("confirm-service-deletion"));
    });

    expect(view.getByTestId("managed-service").props.children).toBe("");
    expect(view.getByTestId("brushing-active").props.children).toBe("gone");
    expect(mockBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("deactivation goes through the shared dialog and closes; reactivation does the same", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="service-brushing-brushing-1"
      />,
    );

    await openServiceAction(view, "toggle-service-active");
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId("service-deactivation-dialog")).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId("confirm-service-deactivation"));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("brushing-active").props.children).toBe("false");

    await act(async () => {
      fireEvent.press(view.getByTestId("open-service-actions"));
    });
    await settleSheetTransition();
    expect(view.getByText("Réactiver la prestation")).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId("toggle-service-active"));
    });
    await settleSheetTransition();

    expect(mockBack).toHaveBeenCalledTimes(2);
    expect(view.getByTestId("brushing-active").props.children).toBe("true");
    alertSpy.mockRestore();
  });

  it("disables the swipe while a draft is being edited", async () => {
    const view = await renderEditor(
      <ServiceEditorScreen
        mode="existing"
        serviceId="service-brushing-brushing-1"
      />,
    );

    // Reading may be dismissed by a swipe or an outside tap; a draft may not.
    const outsideTapAllowed = () =>
      view.getByTestId("sheet-screen-scrim").props.accessibilityState
        ?.disabled !== true;
    expect(outsideTapAllowed()).toBe(true);

    await act(async () => {
      fireEvent.press(view.getByTestId("edit-service"));
    });
    expect(outsideTapAllowed()).toBe(false);
    await act(async () => {
      fireEvent.press(view.getByLabelText("Annuler"));
    });
    expect(outsideTapAllowed()).toBe(true);
  });
});

describe("ServiceEditorScreen — categories, descriptions, profession-aware creation (Step 3)", () => {
  beforeEach(() => {
    mockBack.mockClear();
  });

  const press = (element: Parameters<typeof fireEvent.press>[0]) =>
    act(async () => {
      fireEvent.press(element);
    });
  const type = (element: Parameters<typeof fireEvent.changeText>[0], text: string) =>
    act(async () => {
      fireEvent.changeText(element, text);
    });

  function StoredProbe() {
    const { services, categories } = useServiceCatalog();
    const created = services.find((service) => service.name === "Pose complète gel" || service.name === "Coupe enfant" || service.name === "Soin du visage");
    return (
      <>
        <Text testID="stored-service">{created ? JSON.stringify(created) : ""}</Text>
        <Text testID="stored-categories">{JSON.stringify(categories.map((category) => category.name))}</Text>
      </>
    );
  }

  const withCategories = (names: readonly string[]) => () => ({
    ...createDevelopmentSeed(new Date("2027-03-10T10:00:00.000Z")),
    serviceCategories: names.map((name, position) => ({
      id: `cat-${position}`,
      businessId: testBusiness.id,
      name,
      position,
    })),
  });

  function renderFor(
    activityType: "HAIRDRESSING" | "NAILS" | "ESTHETICS",
    screen: React.ReactNode,
    categoryNames: readonly string[] = [],
  ) {
    return render(
      <TestPersistenceProvider
        business={{ ...testBusiness, activityType }}
        createSeed={categoryNames.length > 0 ? withCategories(categoryNames) : undefined}
      >
        <ServiceCatalogProvider>
          {screen}
          <StoredProbe />
        </ServiceCatalogProvider>
      </TestPersistenceProvider>,
    );
  }

  const stored = (view: Awaited<ReturnType<typeof render>>) =>
    JSON.parse(view.getByTestId("stored-service").props.children as string);

  it("hairdressing keeps the Service / Technique chooser and its order; category and description come after the timing", async () => {
    const view = await renderFor("HAIRDRESSING", <ServiceEditorScreen mode="create" />);
    expect(view.getByTestId("choose-service-type-SERVICE")).toBeTruthy();
    await press(view.getByTestId("choose-service-type-SERVICE"));

    expect(view.getByTestId("service-form-category-pill")).toBeTruthy();
    expect(view.queryByTestId("service-form-phased")).toBeNull();
    // The established order: timing first, then the two optional fields.
    const json = JSON.stringify(view.toJSON());
    const order = [
      "Nom de la prestation",
      "Prix de la prestation",
      "Durée de la prestation",
      "Aucune catégorie",
      "Description de la prestation, facultative",
    ].map((label) => json.indexOf(`"accessibilityLabel":"${label}"`));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("a nail technician creates a categorised, described prestation without knowing anything about scheduling", async () => {
    const view = await renderFor("NAILS", <ServiceEditorScreen mode="create" />, [
      "Ongles naturels",
      "Extensions et poses en gel",
    ]);

    await type(view.getByLabelText("Nom de la prestation"), "Pose complète gel");
    // The form only chooses among the existing categories: no creation from here.
    expect(view.queryByTestId("service-category-create")).toBeNull();
    expect(view.queryByText(/Nouvelle catégorie/)).toBeNull();
    expect(view.queryByTestId("service-form-category-hint")).toBeNull();
    await press(view.getByTestId("service-category-chip-cat-1"));
    const chips = view.getAllByRole("radio");
    expect(chips.map((chip) => [chip.props.accessibilityLabel, chip.props.accessibilityState.selected])).toEqual([
      ["Aucune catégorie", false],
      ["Ongles naturels", false],
      ["Extensions et poses en gel", true],
    ]);
    expect(view.getByTestId("stored-categories").props.children).toBe('["Ongles naturels","Extensions et poses en gel"]');

    // The description says what it describes.
    expect(view.getByText("Description de la prestation (facultative)")).toBeTruthy();
    expect(view.queryByText("Description (facultative)")).toBeNull();
    await type(view.getByTestId("service-form-description"), "  Inclus : limage et forme.\nExclu : nail art.  ");
    await type(view.getByLabelText("Durée de la prestation"), "90");
    await type(view.getByLabelText("Prix de la prestation"), "55");
    await press(view.getByTestId("save-service"));

    const service = stored(view);
    expect(service).toMatchObject({
      name: "Pose complète gel",
      type: "SERVICE",
      price: 55,
      description: "Inclus : limage et forme.\nExclu : nail art.",
      active: true,
    });
    expect(service.categoryId).toBe("cat-1");
    expect(service.phases).toEqual([{ id: expect.any(String), name: "Pose complète gel", durationMinutes: 90, requiresStaff: true }]);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("without any category, the form offers « Aucune » and says where categories are created", async () => {
    const view = await renderFor("NAILS", <ServiceEditorScreen mode="create" />);
    expect(view.getAllByRole("radio").map((chip) => chip.props.accessibilityLabel)).toEqual(["Aucune catégorie"]);
    expect(view.getByTestId("service-form-category-hint").props.children).toBe(
      "Créez vos catégories depuis Prestations & tarifs › Catégories.",
    );
    expect(view.queryByTestId("service-category-create")).toBeNull();
    expect(view.getByTestId("stored-categories").props.children).toBe("[]");
  });

  it("the advanced phased option turns the draft into ordered phases with a waiting time, and back", async () => {
    const view = await renderFor("ESTHETICS", <ServiceEditorScreen mode="create" />);
    await type(view.getByLabelText("Nom de la prestation"), "Soin du visage");
    await type(view.getByLabelText("Durée de la prestation"), "30");

    await act(async () => {
      fireEvent(view.getByTestId("service-form-phased-switch"), "valueChange", true);
    });
    expect(view.queryByLabelText("Durée de la prestation")).toBeNull();
    expect(view.getByText("Phases")).toBeTruthy();
    expect(view.queryByText("Technique")).toBeNull();

    await act(async () => {
      fireEvent(view.getByTestId("service-form-phased-switch"), "valueChange", false);
    });
    // Back to one duration: the typed duration survived the round trip.
    expect(view.getByLabelText("Durée de la prestation").props.value).toBe("30");
    expect(view.getByLabelText("Nom de la prestation").props.value).toBe("Soin du visage");
  });

  it("Prestation Details shows the description as plain text and the category; the unified catalogue never says Service", async () => {
    const seed = () => {
      const base = createDevelopmentSeed(new Date("2027-03-10T10:00:00.000Z"));
      return {
        ...base,
        serviceCategories: [{ id: "cat-gel", businessId: testBusiness.id, name: "Extensions et poses en gel", position: 0 }],
        services: [
          ...base.services,
          {
            id: "nail-gel",
            businessId: testBusiness.id,
            name: "Pose complète gel",
            type: "SERVICE" as const,
            price: 55,
            phases: [{ id: "nail-gel-phase", name: "Pose complète gel", durationMinutes: 90, requiresStaff: true }],
            active: true,
            categoryId: "cat-gel",
            description: "<b>Inclus</b> : limage.\nExclu : nail art.",
          },
        ],
      };
    };
    const view = await render(
      <TestPersistenceProvider business={{ ...testBusiness, activityType: "NAILS" }} createSeed={seed}>
        <ServiceCatalogProvider>
          <ServiceEditorScreen mode="existing" serviceId="nail-gel" />
        </ServiceCatalogProvider>
      </TestPersistenceProvider>,
    );

    const summary = within(view.getByTestId("service-summary"));
    expect(summary.getByLabelText("Catégorie, Extensions et poses en gel")).toBeTruthy();
    // A single-duration prestation of the unified catalogue carries no type pill at all.
    expect(summary.queryByLabelText(/Service|Planification/)).toBeNull();
    // Shown verbatim: never interpreted as markup.
    expect(view.getByText("<b>Inclus</b> : limage.\nExclu : nail art.")).toBeTruthy();

    // The editor reopens it with the same values; the type is not switchable once saved.
    await press(view.getByTestId("edit-service"));
    expect(view.getByTestId("service-form-description").props.value).toBe("<b>Inclus</b> : limage.\nExclu : nail art.");
    expect(view.getByLabelText("Extensions et poses en gel").props.accessibilityState.selected).toBe(true);
    expect(view.queryByTestId("service-form-phased")).toBeNull();
  });

  it("hairdressing details keep the Service pill and add the description and category when present", async () => {
    const view = await renderFor(
      "HAIRDRESSING",
      <ServiceEditorScreen mode="existing" serviceId="service-brushing-brushing-1" />,
      ["Coiffage"],
    );
    const summary = () => within(view.getByTestId("service-summary"));
    expect(summary().getByLabelText("Catégorie, Service")).toBeTruthy();
    expect(view.queryByText("Description")).toBeNull();

    await press(view.getByTestId("edit-service"));
    await type(view.getByTestId("service-form-description"), "Shampoing inclus.\nSans coupe.");
    expect(view.getByText("Description de la prestation (facultative)")).toBeTruthy();
    await press(view.getByTestId("service-category-chip-cat-0"));
    await press(view.getByTestId("save-service"));

    expect(view.getByText("Description")).toBeTruthy();
    expect(view.getByText("Shampoing inclus.\nSans coupe.")).toBeTruthy();
    expect(summary().getByLabelText("Catégorie, Coiffage")).toBeTruthy();
    expect(summary().getByLabelText("Catégorie, Service")).toBeTruthy();
  });
});

// Multi-profession Step 5: the editor names unattended time by profession.
describe("ServiceEditorScreen — waiting-phase terminology (Step 5)", () => {
  beforeEach(() => {
    mockBack.mockClear();
  });

  const press = (element: Parameters<typeof fireEvent.press>[0]) =>
    act(async () => {
      fireEvent.press(element);
    });
  const type = (element: Parameters<typeof fireEvent.changeText>[0], text: string) =>
    act(async () => {
      fireEvent.changeText(element, text);
    });

  const LEGACY_FACIAL = {
    id: "legacy-facial",
    businessId: testBusiness.id,
    name: "Soin du visage",
    type: "TECHNIQUE" as const,
    price: 65,
    phases: [
      { id: "legacy-facial-a", name: "Application", durationMinutes: 30, requiresStaff: true },
      // Created before Step 5: the editor's former default name.
      { id: "legacy-facial-w", name: "Temps de pose", durationMinutes: 15, requiresStaff: false },
      // A name that is not the app's default: the professional's own, kept as is.
      { id: "legacy-facial-r", name: "Repos du masque", durationMinutes: 10, requiresStaff: false },
      { id: "legacy-facial-f", name: "Finition", durationMinutes: 15, requiresStaff: true },
    ],
    active: true,
  };

  function StoredFacial() {
    const { services } = useServiceCatalog();
    const facial = services.find((service) => service.name === "Soin du visage");
    return <Text testID="stored-facial">{facial ? JSON.stringify(facial) : ""}</Text>;
  }

  function renderFor(activityType: "HAIRDRESSING" | "ESTHETICS", screen: React.ReactNode, withLegacy = false) {
    const seed = () => {
      const base = createDevelopmentSeed(new Date("2027-03-10T10:00:00.000Z"));
      return { ...base, services: withLegacy ? [...base.services, LEGACY_FACIAL] : base.services };
    };
    return render(
      <TestPersistenceProvider business={{ ...testBusiness, activityType }} createSeed={seed}>
        <ServiceCatalogProvider>
          {screen}
          <StoredFacial />
        </ServiceCatalogProvider>
      </TestPersistenceProvider>,
    );
  }

  const storedFacial = (view: Awaited<ReturnType<typeof render>>) =>
    JSON.parse(view.getByTestId("stored-facial").props.children as string) as typeof LEGACY_FACIAL;

  it("esthetics: a new phased facial names its waiting phase « Temps d’attente », in the form and in the store", async () => {
    const view = await renderFor("ESTHETICS", <ServiceEditorScreen mode="create" />);
    await type(view.getByLabelText("Nom de la prestation"), "Soin du visage");
    await type(view.getByLabelText("Prix de la prestation"), "65");
    await type(view.getByLabelText("Durée de la prestation"), "30");
    await act(async () => {
      fireEvent(view.getByTestId("service-form-phased-switch"), "valueChange", true);
    });

    await press(view.getByLabelText("Développer la phase 1"));
    await type(view.getByLabelText("Nom de la phase 1"), "Nettoyage");
    await press(view.getByLabelText("Développer la phase 2"));
    await type(view.getByLabelText("Durée de la phase 2"), "15");
    // The waiting phase: its header, its type choice and its spoken label.
    expect(view.getAllByText("Temps d’attente").length).toBeGreaterThanOrEqual(2);
    expect(view.getByLabelText("Phase 2, temps d’attente")).toBeTruthy();
    expect(view.queryByText(/Temps de pose|temps de pose|Technique/)).toBeNull();

    await press(view.getByTestId("save-service"));
    const facial = storedFacial(view);
    expect(facial.type).toBe("TECHNIQUE");
    expect(facial.phases.map((phase) => [phase.name, phase.durationMinutes, phase.requiresStaff])).toEqual([
      ["Nettoyage", 30, true],
      ["Temps d’attente", 15, false],
    ]);
  });

  it("esthetics: a phased prestation without waiting time asks for one in neutral words", async () => {
    const view = await renderFor("ESTHETICS", <ServiceEditorScreen mode="create" />);
    await act(async () => {
      fireEvent(view.getByTestId("service-form-phased-switch"), "valueChange", true);
    });
    await press(view.getByLabelText("Développer la phase 1"));
    await type(view.getByLabelText("Nom de la phase 1"), "Nettoyage");
    await type(view.getByLabelText("Durée de la phase 1"), "30");
    await press(view.getByLabelText("Développer la phase 2"));
    await press(view.getByLabelText("Phase 2, temps actif"));
    await type(view.getByLabelText("Nom de la phase 2"), "Massage");
    await type(view.getByLabelText("Durée de la phase 2"), "20");
    expect(view.getByText("Ajoutez au moins une phase de temps d’attente.")).toBeTruthy();
    expect(view.queryByText(/technique/i)).toBeNull();
  });

  it("esthetics: a legacy « Temps de pose » reads « Temps d’attente », a custom name stays, and a save rewrites neither", async () => {
    const view = await renderFor("ESTHETICS", <ServiceEditorScreen mode="existing" serviceId="legacy-facial" />, true);

    const information = within(view.getByTestId("service-information"));
    expect(information.getByText("Temps d’attente")).toBeTruthy();
    const phases = within(view.getByTestId("service-phases"));
    expect(phases.getByText("Repos du masque")).toBeTruthy();
    expect(phases.getAllByText("Temps d’attente")).toHaveLength(3); // the legacy name + two type labels
    expect(view.queryByText("Temps de pose")).toBeNull();

    await press(view.getByTestId("edit-service"));
    expect(view.queryByText("Temps de pose")).toBeNull();
    expect(view.getByText("Repos du masque")).toBeTruthy();
    await type(view.getByLabelText("Prix de la prestation"), "70");
    await press(view.getByTestId("save-service"));

    const facial = storedFacial(view);
    expect(facial.price).toBe(70);
    expect(facial.phases).toEqual(LEGACY_FACIAL.phases);
  });

  it("hairdressing: the same record keeps « Temps de pose » everywhere", async () => {
    const view = await renderFor("HAIRDRESSING", <ServiceEditorScreen mode="existing" serviceId="legacy-facial" />, true);
    expect(within(view.getByTestId("service-information")).getByText("Temps de pose")).toBeTruthy();
    expect(view.queryByText("Temps d’attente")).toBeNull();
    await press(view.getByTestId("edit-service"));
    await press(view.getByLabelText("Développer la phase 2"));
    expect(view.getByLabelText("Phase 2, temps de pose")).toBeTruthy();
    expect(view.queryByText("Temps d’attente")).toBeNull();
  });
});

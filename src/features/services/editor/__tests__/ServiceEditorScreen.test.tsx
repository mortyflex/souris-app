import { act, fireEvent, render, within } from "@testing-library/react-native";
import { Alert, StyleSheet, Text } from "react-native";

import {
  ServiceCatalogProvider,
  useServiceCatalog,
} from "../../session/ServiceCatalogProvider";
import { ServiceEditorScreen } from "../ServiceEditorScreen";
import { TestPersistenceProvider } from "@/providers/testing/TestPersistenceProvider";
import { serviceCategoryColors } from "@/shared/ui/theme";
import { settleSheetTransition } from "@/shared/ui/testing/sheet-transitions";

const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack }),
  useNavigation: () => ({ dispatch: jest.fn() }),
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

    expect(view.getByText("NOUVELLE PRESTATION")).toBeTruthy();
    expect(
      view.getByRole("header", { name: "Ajouter une prestation" }),
    ).toBeTruthy();
    expect(view.getByLabelText("Annuler")).toBeTruthy();
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
    expect(view.getByText("Type de prestation")).toBeTruthy();
    expect(
      view.getByText("Choisissez la structure qui correspond au déroulé réel."),
    ).toBeTruthy();
    expect(view.getByText("Prestation technique")).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByLabelText("Annuler"));
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.press(view.getByText("Prestation simple"));
    });
    expect(
      view.getByLabelText("Nom de la prestation").props.autoFocus,
    ).toBeFalsy();
    expect(
      view.getByLabelText("Prix de la prestation").props.autoFocus,
    ).toBeFalsy();
  });

  it("creates a simple Service from the professional-facing fields", async () => {
    const view = await renderEditor(<ServiceEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.press(view.getByText("Prestation simple"));
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
      fireEvent.press(view.getByText("Prestation technique"));
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
      fireEvent.press(view.getByText("Prestation technique"));
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
      fireEvent.press(view.getByText("Prestation technique"));
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
      fireEvent.press(view.getByText("Prestation technique"));
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
      fireEvent.press(view.getByText("Prestation technique"));
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
      fireEvent.press(view.getByText("Prestation technique"));
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

  it("deletes only after the shared Souris confirmation, never a native alert", async () => {
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

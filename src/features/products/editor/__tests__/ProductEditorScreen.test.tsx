import { act, fireEvent, render, within } from "@testing-library/react-native";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";

import {
  ProductCatalogProvider,
  useProductCatalog,
} from "../../session/ProductCatalogProvider";
import { ProductEditorScreen } from "../ProductEditorScreen";
import { useProductImageUri } from "../../images/use-product-image-uri";
import {
  createFakeBusinessMediaRemote,
  type FakeBusinessMediaRemote,
} from "@/persistence/testing/fake-business-media-remote";
import {
  createMemoryLocalFiles,
  type MemoryLocalFiles,
} from "@/persistence/testing/memory-local-files";
import { BusinessMediaProvider } from "@/providers/BusinessMediaProvider";
import { usePersistence } from "@/providers/PersistenceProvider";
import { TestPersistenceProvider } from "@/providers/testing/TestPersistenceProvider";
import { settleSheetTransition } from "@/shared/ui/testing/sheet-transitions";
import { FORM_SCROLL_REVEAL_MARGIN } from "@/shared/ui/FormScrollView";
import { scrollToMock, settleFormScroll, stageFocusedInput } from "@/shared/ui/testing/form-scroll";
import { captureKeyboardEvents } from "@/shared/ui/testing/sheet-keyboard";
import { rose, semanticColors } from "@/shared/ui/theme";

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockScannedBarcode = "";
let mockPhotoResult:
  | { readonly status: "selected"; readonly uri: string }
  | { readonly status: "cancelled" }
  | { readonly status: "error" };
let mockCameraAccess: "granted" | "denied" | "blocked" = "granted";
const mockEnsureCameraAccess = jest.fn(() => Promise.resolve(mockCameraAccess));
const mockOpenAppSettings = jest.fn();
let mockCapturedUri = "file:///products/raw.jpg";
const mockPickProductPhotoFromLibrary = jest.fn(() =>
  Promise.resolve(mockPhotoResult),
);
const mockRemoveImageBackground = jest.fn((uri: string) =>
  Promise.resolve(uri),
);

let mockFiles: MemoryLocalFiles;
let mockRemote: FakeBusinessMediaRemote;

// The shared normalization is covered by its own tests: here it hands the
// file on unchanged, so a stored photo keeps the content of its source.
jest.mock("../../images/product-photo-processing", () => ({
  prepareProductPhoto: async (uri: string) => ({
    uri,
    format: uri.endsWith(".png") ? "png" : "jpg",
  }),
}));

const ORIGINAL_IMAGE_URI = "file:///products/original.jpg";
const REPLACEMENT_IMAGE_URI = "file:///products/replacement.png";

function createDeferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));

// SheetScreen (content fit) holds the route's removal while the sheet slides down.
jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));

jest.mock("expo-symbols", () => ({ SymbolView: () => null }));
// Jest lays nothing out: the keyboard test states the geometry itself.
jest.mock("@/shared/ui/form-scroll-geometry");

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
    Easing: { bezier: () => (value: number) => value },
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
    withSpring: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

jest.mock("expo-image", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { View } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");
  return { Image: (props: object) => React.createElement(View, props) };
});

// The ONE shared permission / media boundary (also used by Client photos).
jest.mock("@/shared/lib/photo-acquisition", () => ({
  ensureCameraAccess: () => mockEnsureCameraAccess(),
  pickPhotoFromLibrary: () => mockPickProductPhotoFromLibrary(),
  openAppSettings: () => mockOpenAppSettings(),
}));

// The camera is covered by PhotoCameraModal tests; here it only emits a capture.
jest.mock("@/shared/ui/PhotoCameraModal", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Pressable: MockPressable } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");

  return {
    PhotoCameraModal: ({
      visible,
      onCaptured,
    }: {
      readonly visible: boolean;
      readonly onCaptured: (uri: string) => void;
    }) =>
      visible
        ? React.createElement(MockPressable, {
            onPress: () => onCaptured(mockCapturedUri),
            testID: "mock-camera-capture",
          })
        : null,
  };
});

// Mirrors the iOS Modal contract (onDismiss once `visible` has dropped) so the
// source sheet → camera hand-off can be verified.
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

jest.mock("@/features/products/images/remove-image-background", () => ({
  removeImageBackground: (uri: string) => mockRemoveImageBackground(uri),
}));

jest.mock("@/shared/ui/BarcodeScannerModal", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Pressable: MockPressable } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");

  return {
    BarcodeScannerModal: ({
      visible,
      onScanned,
    }: {
      readonly visible: boolean;
      readonly onScanned: (barcode: string) => void;
    }) =>
      visible
        ? React.createElement(MockPressable, {
            onPress: () => onScanned(mockScannedBarcode),
            testID: "mock-camera-detection",
          })
        : null,
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

/**
 * What a displayed image file holds. Memory files hold their own original URI
 * and copies keep it, so the draft file and the shared photo's cached copy of
 * « original.jpg » both read "file:///products/original.jpg".
 */
function shownContent(uri: string | undefined): string {
  return uri === undefined ? "-" : (mockFiles.readFile(uri) ?? uri);
}

function shownImage(
  view: Awaited<ReturnType<typeof render>>,
  testID: string,
): string {
  return shownContent(view.getByTestId(testID).props.source?.uri);
}

/**
 * What the cloud sync runner does after a pull that applied another device's
 * change to this Product: the row is already in SQLite, then
 * `reloadSnapshot()` re-reads it IN PLACE (the runner → reloadSnapshot link
 * is covered by CloudSyncRunner.test.tsx on a real pull).
 */
function RemoteChangeProbe() {
  const { database, reloadSnapshot } = usePersistence();
  return (
    <Pressable
      testID="apply-remote-change"
      onPress={() => {
        database.runSync(
          "UPDATE products SET stock_quantity = 3, price_cents = 5500 WHERE id = '6974bff937a5d89c2d9afbd0'",
        );
        reloadSnapshot();
      }}
    />
  );
}

function CatalogProbe() {
  const { addProduct, products } = useProductCatalog();
  const managed =
    products.find((product) => product.name === "Shampooing Test") ??
    products.find((product) => product.id === "6974bff937a5d89c2d9afbd0");
  // The image the Product shows on this device (shared photo first).
  const managedImageUri = useProductImageUri(managed);

  return (
    <>
      <Text testID="managed-product">
        {managed
          ? `${managed.id}:${managed.name}:${managed.brand ?? "-"}:${managed.category ?? "-"}:${managed.barcode ?? "-"}:${managed.price}:${managed.stockQuantity}:${managed.active}`
          : ""}
      </Text>
      <Text testID="managed-image">{shownContent(managedImageUri)}</Text>
      <Text testID="masque-active">
        {products.find((product) => product.id === "6974bff937a5d89c2d9afbd0")
          ? String(
              products.find(
                (product) => product.id === "6974bff937a5d89c2d9afbd0",
              )?.active,
            )
          : "gone"}
      </Text>
      <Text testID="catalog-count">{products.length}</Text>
      <Text testID="legacy-stock">
        {products.find((product) => product.id === "product-legacy-stock")?.stockQuantity ?? "-"}
      </Text>
      <Pressable
        testID="add-legacy-stock-product"
        onPress={() =>
          void addProduct({
            id: "product-legacy-stock",
            businessId: "business-test",
            name: "Laque legacy",
            price: 12,
            stockQuantity: 47,
            active: true,
          })
        }
      />
    </>
  );
}

async function pressTimes(
  view: Awaited<ReturnType<typeof render>>,
  testID: string,
  times: number,
) {
  for (let index = 0; index < times; index += 1) {
    await act(async () => {
      fireEvent.press(view.getByTestId(testID));
    });
  }
}

/** Opens « ••• », picks an action, and lets the drawer close so the action runs. */
async function openProductAction(
  view: Awaited<ReturnType<typeof render>>,
  testID: "edit-product" | "toggle-product-active" | "open-product-deletion",
) {
  await act(async () => {
    fireEvent.press(view.getByTestId("open-product-actions"));
  });
  await settleSheetTransition();
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
  await settleSheetTransition();
}

function SeededLegacyStockEditor() {
  const { addProduct } = useProductCatalog();
  const [open, setOpen] = useState(false);

  if (open) {
    return <ProductEditorScreen mode="existing" productId="product-legacy-stock" />;
  }

  return (
    <Pressable
      testID="open-legacy-stock-product"
      onPress={() => {
        void addProduct({
          id: "product-legacy-stock",
          businessId: "business-test",
          name: "Laque legacy",
          price: 12,
          stockQuantity: 47,
          active: true,
        }).then(() => setOpen(true));
      }}
    />
  );
}

function SeededImageEditor() {
  const { getProductById, updateProduct } = useProductCatalog();
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />
    );
  }

  return (
    <Pressable
      testID="open-seeded-image-product"
      onPress={() => {
        const product = getProductById("6974bff937a5d89c2d9afbd0");
        if (!product) return;
        // The Product already has a shared photo: « original.jpg ».
        void updateProduct(product, {
          kind: "replace",
          uri: ORIGINAL_IMAGE_URI,
        }).then(() => setOpen(true));
      }}
    />
  );
}

// Photos taken or chosen are local files; on Save the catalog uploads the
// new one to the (fake) Business media storage and shows it from its cached
// copy (the lifecycle itself is covered by the ProductCatalogProvider tests).
function renderEditor(screen: React.ReactNode) {
  mockFiles = createMemoryLocalFiles({ documentDirectoryUri: "file:///" });
  for (const uri of [ORIGINAL_IMAGE_URI, REPLACEMENT_IMAGE_URI, "file:///products/raw.jpg"]) {
    mockFiles.addFile(uri);
  }
  mockRemote = createFakeBusinessMediaRemote(mockFiles);
  return render(
    <TestPersistenceProvider files={mockFiles}>
      <BusinessMediaProvider remote={mockRemote}>
        <ProductCatalogProvider>
          {screen}
          <CatalogProbe />
          <RemoteChangeProbe />
        </ProductCatalogProvider>
      </BusinessMediaProvider>
    </TestPersistenceProvider>,
  );
}

describe("ProductEditorScreen", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
    mockScannedBarcode = "";
    mockPhotoResult = { status: "selected", uri: "file:///products/raw.jpg" };
    mockCapturedUri = "file:///products/raw.jpg";
    mockPickProductPhotoFromLibrary.mockClear();
    mockCameraAccess = "granted";
    mockEnsureCameraAccess.mockClear();
    mockOpenAppSettings.mockClear();
    mockRemoveImageBackground.mockReset();
    mockRemoveImageBackground.mockImplementation((uri: string) =>
      Promise.resolve(uri),
    );
  });

  it("creates a Product from the professional-facing fields", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    mockRemoveImageBackground.mockResolvedValue(REPLACEMENT_IMAGE_URI);
    const view = await renderEditor(<ProductEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom du produit"),
        "Shampooing Test",
      );
    });
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Marque du produit"),
        "Brand Test",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Catégorie du produit"), "Soin");
    });
    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Code-barres du produit"),
        "0123456789",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix du produit"), "25");
    });
    await pressTimes(view, "stock-increment", 4);
    expect(view.getByTestId("stock-value").props.children).toBe(4);
    // Opening the form never auto-focuses a field.
    for (const label of ["Nom du produit", "Marque du produit", "Prix du produit"]) {
      expect(view.getByLabelText(label).props.autoFocus).toBeFalsy();
    }
    // One media affordance, no explanatory paragraph.
    expect(view.getByTestId("product-photo-empty")).toBeTruthy();
    // A wide media tile, trimmed from 200 pt so the fields stay in view.
    expect(view.getByTestId("product-photo-empty")).toHaveStyle({ height: 164 });
    expect(view.getAllByLabelText("Ajouter une photo")).toHaveLength(1);
    expect(
      view.queryByText("Prenez une photo ou choisissez une image."),
    ).toBeNull();
    expect(view.queryByTestId("product-photo-sheet")).toBeNull();

    await act(async () =>
      fireEvent.press(view.getByLabelText("Ajouter une photo")),
    );
    expect(view.getByTestId("product-photo-sheet")).toBeTruthy();
    expect(view.getAllByTestId("bottom-sheet-scrim")).toHaveLength(1);
    expect(view.queryByLabelText("Supprimer la photo")).toBeNull();
    expect(view.queryByTestId("mock-camera-capture")).toBeNull();

    // Source sheet → slides down → (dismissed) → camera: never both at once.
    await act(async () =>
      fireEvent.press(view.getByLabelText("Prendre une photo")),
    );
    expect(view.queryByTestId("mock-camera-capture")).toBeNull();
    await settleSheetTransition();
    expect(view.queryByTestId("product-photo-sheet")).toBeNull();
    expect(view.queryByTestId("bottom-sheet-scrim")).toBeNull();
    expect(view.getByTestId("mock-camera-capture")).toBeTruthy();

    await act(async () =>
      fireEvent.press(view.getByTestId("mock-camera-capture")),
    );
    expect(view.queryByTestId("mock-camera-capture")).toBeNull();
    expect(view.queryByTestId("product-photo-sheet")).toBeNull();
    expect(mockPickProductPhotoFromLibrary).not.toHaveBeenCalled();
    expect(mockRemoveImageBackground).toHaveBeenCalledWith(
      "file:///products/raw.jpg",
    );
    expect(shownImage(view, "product-form-image-source")).toBe(REPLACEMENT_IMAGE_URI);
    expect(view.getByTestId("product-form-image-source").props.contentFit).toBe(
      "contain",
    );
    // The isolated PNG is presented as a sticker; the source stays the main layer.
    expect(view.getByTestId("product-form-image-sticker")).toBeTruthy();
    expect(view.getByLabelText("Modifier la photo")).toBeTruthy();
    expect(view.getByLabelText("Nom du produit").props.value).toBe(
      "Shampooing Test",
    );
    expect(view.getByLabelText("Code-barres du produit").props.value).toBe(
      "0123456789",
    );
    expect(view.getByTestId("managed-image").props.children).toBe("-");

    await act(async () => {
      fireEvent.press(view.getByTestId("save-product"));
    });

    const stored = view.getByTestId("managed-product").props.children as string;
    expect(stored).toContain(
      ":Shampooing Test:Brand Test:Soin:0123456789:25:4:true",
    );
    expect(view.getByTestId("managed-image").props.children).toBe(
      REPLACEMENT_IMAGE_URI,
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("keeps an open Product detail open and shows another device's changes in place", async () => {
    const view = await renderEditor(
      <ProductEditorScreen mode="existing" productId="6974bff937a5d89c2d9afbd0" />,
    );
    expect(view.getByTestId("product-read-view")).toBeTruthy();
    expect(view.getByText("50,00 €")).toBeTruthy();

    await act(async () =>
      fireEvent.press(view.getByTestId("apply-remote-change")),
    );

    expect(view.getByTestId("product-read-view")).toBeTruthy();
    expect(view.getByText("55,00 €")).toBeTruthy();
    expect(view.getByLabelText(/^Stock, 3 unités/)).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("never replaces an unsaved edit form with remote data; Cancel then shows the synced Product", async () => {
    const view = await renderEditor(
      <ProductEditorScreen mode="existing" productId="6974bff937a5d89c2d9afbd0" />,
    );
    await openProductAction(view, "edit-product");
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix du produit"), "61");
    });

    await act(async () =>
      fireEvent.press(view.getByTestId("apply-remote-change")),
    );

    // Still editing, with the professional's own value.
    expect(view.getByLabelText("Prix du produit").props.value).toBe("61");
    expect(view.getByTestId("save-product")).toBeTruthy();

    await act(async () =>
      fireEvent.press(view.getByTestId("cancel-product-edit")),
    );
    expect(view.getByText("55,00 €")).toBeTruthy();
  });

  it("rejects an invalid price and bounds the stock selector to 0–30", async () => {
    const view = await renderEditor(<ProductEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom du produit"),
        "Shampooing Test",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix du produit"), "-2");
    });
    expect(
      view.getByTestId("save-product").props.accessibilityState?.disabled,
    ).toBe(true);

    // No free-form stock input; the stepper stays inside 0–30.
    expect(view.queryByLabelText("Stock du produit")).toBeNull();
    expect(view.getByTestId("stock-decrement").props.accessibilityState).toMatchObject({ disabled: true });
    await pressTimes(view, "stock-increment", 31);
    expect(view.getByTestId("stock-value").props.children).toBe(30);
    expect(view.getByTestId("stock-increment").props.accessibilityState).toMatchObject({ disabled: true });
    await pressTimes(view, "stock-decrement", 1);
    expect(view.getByTestId("stock-value").props.children).toBe(29);
  });

  it("adjusts the stock directly from the details through the catalog, within 0–30", async () => {
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );
    const stored = () => view.getByTestId("managed-product").props.children as string;
    const disabled = (testID: string) =>
      view.getByTestId(testID).props.accessibilityState?.disabled;

    // Stock 0: sold out, the minimum is reached.
    expect(view.getByTestId("product-stock-value").props.children).toBe(0);
    expect(view.getByLabelText("Stock actuel, 0")).toBeTruthy();
    expect(view.getByText("Stock épuisé")).toBeTruthy();
    expect(view.getByText("0 à 30")).toBeTruthy();
    expect(disabled("product-stock-decrement")).toBe(true);
    expect(view.getByLabelText("Diminuer le stock")).toBeTruthy();
    expect(view.getByLabelText("Augmenter le stock")).toBeTruthy();

    // Each step is committed to the catalog (SQLite first) without the form.
    await pressTimes(view, "product-stock-increment", 1);
    expect(view.getByTestId("product-stock-value").props.children).toBe(1);
    expect(stored()).toMatch(/:1:true$/);
    expect(view.getByText("En stock")).toBeTruthy();
    expect(view.queryByText("Stock épuisé")).toBeNull();
    expect(view.getByLabelText("Stock, 1 unité, en stock")).toBeTruthy();
    expect(view.queryByTestId("save-product")).toBeNull();

    await pressTimes(view, "product-stock-decrement", 1);
    expect(stored()).toMatch(/:0:true$/);
    expect(view.getByText("Stock épuisé")).toBeTruthy();

    // The maximum of the shared selector rule.
    await pressTimes(view, "product-stock-increment", 31);
    expect(view.getByTestId("product-stock-value").props.children).toBe(30);
    expect(stored()).toMatch(/:30:true$/);
    expect(disabled("product-stock-increment")).toBe(true);
    expect(view.getByLabelText("Stock, 30 unités, en stock")).toBeTruthy();

    // The full edit form starts from the adjusted stock.
    await openProductAction(view, "edit-product");
    expect(view.getByTestId("stock-value").props.children).toBe(30);
  });

  it("keeps a legacy stock above 30 intact unless the professional changes it", async () => {
    const view = await renderEditor(<SeededLegacyStockEditor />);

    await act(async () =>
      fireEvent.press(view.getByTestId("open-legacy-stock-product")),
    );
    expect(within(view.getByTestId("product-read-view")).getByText("47")).toBeTruthy();

    // Saving an unrelated field preserves the exact quantity.
    await openProductAction(view, "edit-product");
    expect(view.getByTestId("stock-value").props.children).toBe(47);
    expect(view.getByTestId("stock-increment").props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix du produit"), "13");
    });
    await act(async () => fireEvent.press(view.getByTestId("save-product")));
    expect(view.getByTestId("legacy-stock").props.children).toBe(47);

    // Lowering it is an intentional change, one unit at a time.
    await openProductAction(view, "edit-product");
    await pressTimes(view, "stock-decrement", 1);
    expect(view.getByTestId("stock-value").props.children).toBe(46);
    await act(async () => fireEvent.press(view.getByTestId("save-product")));
    expect(view.getByTestId("legacy-stock").props.children).toBe(46);
  });

  it("makes « Vendre ce produit » the one action: the Sale flow opens with this Product, nothing sold yet", async () => {
    const view = await renderEditor(
      <ProductEditorScreen mode="existing" productId="6974bff937a5d89c2d9afbd0" />,
    );
    const sell = () => view.getByTestId("sell-product");
    const stored = () => view.getByTestId("managed-product").props.children as string;

    expect(within(view.getByTestId("product-read-actions")).getByText("Vendre ce produit")).toBeTruthy();
    // The Sale draft would refuse it (no stock): the action waits.
    expect(sell().props.accessibilityState.disabled).toBe(true);

    await pressTimes(view, "product-stock-increment", 2);
    expect(sell().props.accessibilityState.disabled).toBe(false);
    await act(async () => fireEvent.press(sell()));

    // The ONE « Nouvelle vente » route, its draft seeded with this Product.
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/sales/new",
      params: { productId: "6974bff937a5d89c2d9afbd0" },
    });
    // Nothing is sold by opening the flow: stock unchanged, details still open.
    expect(stored()).toMatch(/:2:true$/);
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId("product-read-view")).toBeTruthy();
  });

  it("keeps « Modifier » in « ••• » with the other management actions", async () => {
    const view = await renderEditor(
      <ProductEditorScreen mode="existing" productId="6974bff937a5d89c2d9afbd0" />,
    );

    await act(async () => fireEvent.press(view.getByTestId("open-product-actions")));
    await settleSheetTransition();
    const menu = within(view.getByTestId("product-actions-sheet"));
    // Modifier first, next to the existing management actions — none lost.
    expect(menu.getAllByRole("button").map((row) => row.props.testID)).toEqual([
      "edit-product",
      "toggle-product-active",
      "open-product-deletion",
    ]);
    expect(within(menu.getByTestId("edit-product")).getByText("Modifier")).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
    await settleSheetTransition();
    expect(view.getByRole("header", { name: "Modifier le produit" })).toBeTruthy();
    expect(view.getByTestId("save-product")).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("never offers to sell an inactive Product", async () => {
    const view = await renderEditor(
      <ProductEditorScreen mode="existing" productId="6974bff937a5d89c2d9afbd0" />,
    );
    await pressTimes(view, "product-stock-increment", 2);
    expect(view.getByTestId("sell-product").props.accessibilityState.disabled).toBe(false);

    await openProductAction(view, "toggle-product-active");
    await act(async () => fireEvent.press(view.getByTestId("confirm-product-deactivation")));

    expect(view.getByTestId("masque-active").props.children).toBe("false");
    expect(view.getByTestId("sell-product").props.accessibilityState.disabled).toBe(true);
  });

  it("sizes the details to their content and disables the swipe only while editing", async () => {
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    // Sized by its content, capped at the canonical detent.
    expect(StyleSheet.flatten(view.getByTestId("product-sheet").props.style).flex).toBeUndefined();
    const surfaceStyle = StyleSheet.flatten(view.getByTestId("sheet-screen-surface").props.style);
    expect(surfaceStyle.flex).toBeUndefined();
    expect(surfaceStyle.maxHeight).toBeGreaterThan(0);
    // Detail-sheet header: the name alone, then « ••• » and ×.
    expect(view.queryByText("PRODUIT")).toBeNull();
    expect(view.getByRole("header", { name: "Masque réparateur 5 min" })).toBeTruthy();
    expect(view.getByLabelText("Actions du produit")).toBeTruthy();
    expect(view.getByTestId("close-product-details").props.accessibilityLabel).toBe("Fermer");
    expect(view.queryByText("Fermer")).toBeNull();
    // Management actions are no longer permanent buttons.
    expect(view.queryByText("Désactiver")).toBeNull();
    expect(view.queryByText("Supprimer")).toBeNull();
    // The one commercial action; editing lives in « ••• ».
    expect(within(view.getByTestId("product-read-actions")).getByText("Vendre ce produit")).toBeTruthy();
    expect(view.queryByText("Modifier le produit")).toBeNull();
    expect(view.queryByTestId("edit-product")).toBeNull();
    // Reading may be dismissed by a swipe or an outside tap; a draft may not.
    const outsideTapAllowed = () =>
      view.getByTestId("sheet-screen-scrim").props.accessibilityState?.disabled !== true;
    expect(outsideTapAllowed()).toBe(true);

    await openProductAction(view, "edit-product");
    expect(outsideTapAllowed()).toBe(false);
    await act(async () => fireEvent.press(view.getByTestId("cancel-product-edit")));
    expect(outsideTapAllowed()).toBe(true);
  });

  it("creates in the canonical sheet: « Annuler » leading, one centered title, no eyebrow", async () => {
    const view = await renderEditor(<ProductEditorScreen mode="create" />);

    expect(view.getByRole("header", { name: "Ajouter un produit" })).toBeTruthy();
    expect(view.queryByText("NOUVEAU PRODUIT")).toBeNull();
    expect(view.getAllByText("Annuler")).toHaveLength(1);
    const cancel = view.getByTestId("cancel-product-creation");
    expect(cancel.props.accessibilityLabel).toBe("Annuler la création");
    expect(view.getByTestId("sheet-editing-header-leading")).toBeTruthy();

    await act(async () => fireEvent.press(cancel));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it("edits in the canonical sheet: « Annuler » + title, sections, one « Enregistrer »", async () => {
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    await openProductAction(view, "edit-product");

    // Header: « Annuler » leading, the edit title, no eyebrow nor product name.
    expect(view.getByRole("header", { name: "Modifier le produit" })).toBeTruthy();
    expect(view.queryByRole("header", { name: "Masque réparateur 5 min" })).toBeNull();
    expect(view.queryByText("PRODUIT")).toBeNull();
    expect(view.getAllByText("Annuler")).toHaveLength(1);
    expect(view.getByTestId("cancel-product-edit").props.accessibilityLabel).toBe("Annuler");

    // Informations → Vente → Stock, in one scroll.
    const information = within(view.getByTestId("product-form-information"));
    expect(information.getByText("Informations")).toBeTruthy();
    expect(information.getByLabelText("Nom du produit")).toBeTruthy();
    expect(information.getByLabelText("Marque du produit")).toBeTruthy();
    expect(information.getByLabelText("Catégorie du produit")).toBeTruthy();
    expect(information.getByLabelText("Code-barres du produit")).toBeTruthy();
    expect(information.getByLabelText("Scanner un code-barres")).toBeTruthy();
    const sale = within(view.getByTestId("product-form-sale"));
    expect(sale.getByText("Vente")).toBeTruthy();
    expect(sale.getByLabelText("Prix du produit")).toBeTruthy();
    const stock = within(view.getByTestId("product-form-stock"));
    expect(stock.getAllByText("Stock")).toHaveLength(1);
    expect(stock.getByText("0 à 30")).toBeTruthy();

    // ONE footer action, short visible label, descriptive spoken label.
    const save = view.getByTestId("save-product");
    expect(within(save).getByText("Enregistrer")).toBeTruthy();
    expect(save.props.accessibilityLabel).toBe("Enregistrer les modifications");
    expect(view.queryByText("Enregistrer les modifications")).toBeNull();
    expect(within(view.getByTestId("product-sheet")).getAllByRole("button", { name: /^Enregistrer/ })).toHaveLength(1);

    // The one Cancel discards the draft and returns to the details.
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Nom du produit"), "Autre nom");
    });
    await act(async () => fireEvent.press(view.getByTestId("cancel-product-edit")));
    expect(view.getByRole("header", { name: "Masque réparateur 5 min" })).toBeTruthy();
    expect(view.getByTestId("managed-product").props.children).toContain("Masque réparateur 5 min");
  });

  it("hydrates an existing Product and edits it with stable identity", async () => {
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    // Read mode: real imported values.
    expect(view.getByText("Masque réparateur 5 min")).toBeTruthy();
    expect(view.getByText("Redken")).toBeTruthy();
    expect(view.getByText("3474637152000")).toBeTruthy();
    // No photo: the catalogue's placeholder, never an empty slot.
    expect(view.getByTestId("product-detail-image")).toBeTruthy();
    expect(view.queryByTestId("product-detail-image-source")).toBeNull();
    expect(view.getByText("Actif")).toBeTruthy();
    expect(view.getByLabelText("Produit actif")).toBeTruthy();
    expect(view.getByText("Informations")).toBeTruthy();
    const information = within(view.getByTestId("product-information"));
    expect(information.getByText("Marque")).toBeTruthy();
    expect(information.getByText("Redken")).toBeTruthy();
    expect(information.getByText("Catégorie")).toBeTruthy();
    expect(information.getByText("Soin")).toBeTruthy();
    expect(information.getByText("Code-barres")).toBeTruthy();
    expect(information.getByText("3474637152000")).toBeTruthy();
    expect(view.getAllByText("Stock").length).toBeGreaterThan(0);

    await openProductAction(view, "edit-product");
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix du produit"), "29");
    });
    await pressTimes(view, "stock-increment", 7);
    await act(async () => {
      fireEvent.press(view.getByTestId("save-product"));
    });

    const stored = view.getByTestId("managed-product").props.children as string;
    expect(stored).toBe(
      "6974bff937a5d89c2d9afbd0:Masque réparateur 5 min:Redken:Soin:3474637152000:29:7:true",
    );
    expect(view.getByText("29,00 €")).toBeTruthy();
    expect(view.getByText("7")).toBeTruthy();
  });

  it("shows the catalogue image as a compact, read-only thumbnail beside price and status", async () => {
    const view = await renderEditor(<SeededImageEditor />);
    await act(async () =>
      fireEvent.press(view.getByTestId("open-seeded-image-product")),
    );

    const identity = within(view.getByTestId("product-identity"));
    const image = identity.getByTestId("product-detail-image");
    // The same Product.imageUri and component the catalogue row renders.
    expect(shownImage(view, "product-detail-image-source")).toBe(ORIGINAL_IMAGE_URI);
    expect(image.props.accessibilityLabel).toBe("Photo de Masque réparateur 5 min");
    expect(image.props.accessibilityRole).toBe("image");
    const imageStyle = StyleSheet.flatten(image.props.style);
    expect(imageStyle.width).toBe(imageStyle.height);
    expect(imageStyle.height).toBeLessThanOrEqual(100);
    expect(identity.getByTestId("product-price")).toBeTruthy();
    expect(identity.getByLabelText("Produit actif")).toBeTruthy();
    // Read-only: no photo editing from the details.
    expect(view.queryByTestId("product-photo-tile")).toBeNull();
    expect(view.queryByText("Ajouter une photo")).toBeNull();
    expect(view.queryByLabelText("Modifier la photo")).toBeNull();
    expect(view.queryByTestId("product-photo-source-sheet")).toBeNull();
    // Photo editing stays in « Modifier le produit ».
    await openProductAction(view, "edit-product");
    expect(view.getByTestId("product-photo-tile")).toBeTruthy();
    // Opening the details, the edit form or the photo menu asks for nothing.
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    await settleSheetTransition();
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();
  });

  it("refuses the Save with one concise message when the new photo cannot be stored, keeping the draft and the previous photo", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const view = await renderEditor(<SeededImageEditor />);
    await act(async () =>
      fireEvent.press(view.getByTestId("open-seeded-image-product")),
    );
    const previousObjects = [...mockRemote.objects.keys()];
    expect(previousObjects).toHaveLength(1);

    await openProductAction(view, "edit-product");
    await act(async () =>
      fireEvent.changeText(view.getByLabelText("Prix du produit"), "29"),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Choisir dans la photothèque")),
    );
    await settleSheetTransition();
    mockRemote.failUploads = true;
    await act(async () => fireEvent.press(view.getByTestId("save-product")));

    expect(alertSpy).toHaveBeenCalledWith(
      "Impossible d’enregistrer la photo.",
      "Vérifiez votre connexion, puis réessayez. Le produit n’a pas été modifié.",
    );
    // Still editing, with the chosen photo in the draft.
    expect(view.getByTestId("save-product")).toBeTruthy();
    expect(shownImage(view, "product-form-image-source")).toBe("file:///products/raw.jpg");
    // Nothing was written: previous photo, previous price.
    expect(view.getByTestId("managed-image").props.children).toBe(ORIGINAL_IMAGE_URI);
    expect(view.getByTestId("managed-product").props.children).toContain(":50:");
    expect([...mockRemote.objects.keys()]).toEqual(previousObjects);

    // Back online: the same draft saves, and the new photo replaces the old object.
    mockRemote.failUploads = false;
    await act(async () => fireEvent.press(view.getByTestId("save-product")));
    expect(view.getByTestId("managed-image").props.children).toBe("file:///products/raw.jpg");
    expect(view.getByTestId("managed-product").props.children).toContain(":29:");
    expect([...mockRemote.objects.keys()]).not.toEqual(previousObjects);
    expect(mockRemote.objects.size).toBe(1);
    alertSpy.mockRestore();
  });

  it("keeps an image replacement in the edit draft until Save and discards it on Cancel", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    mockRemoveImageBackground.mockResolvedValue(REPLACEMENT_IMAGE_URI);
    const view = await renderEditor(<SeededImageEditor />);

    await act(async () =>
      fireEvent.press(view.getByTestId("open-seeded-image-product")),
    );
    expect(shownImage(view, "product-detail-image-source")).toBe(ORIGINAL_IMAGE_URI);
    expect(
      view.getByTestId("product-detail-image-source").props.contentFit,
    ).toBe("contain");
    // A plain photograph keeps the flat presentation (no sticker contour).
    expect(view.queryByTestId("product-detail-image-sticker")).toBeNull();

    await openProductAction(view, "edit-product");
    expect(shownImage(view, "product-form-image-source")).toBe(ORIGINAL_IMAGE_URI);
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    expect(view.getByLabelText("Prendre une nouvelle photo")).toBeTruthy();
    expect(view.getByLabelText("Supprimer la photo")).toBeTruthy();
    await act(async () =>
      fireEvent.press(view.getByLabelText("Choisir dans la photothèque")),
    );

    expect(mockPickProductPhotoFromLibrary).toHaveBeenCalledTimes(1);
    await settleSheetTransition();
    expect(view.queryByTestId("product-photo-sheet")).toBeNull();
    expect(shownImage(view, "product-form-image-source")).toBe(REPLACEMENT_IMAGE_URI);
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );

    await act(async () =>
      fireEvent.press(view.getByTestId("cancel-product-edit")),
    );
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );
    expect(shownImage(view, "product-detail-image-source")).toBe(ORIGINAL_IMAGE_URI);

    await openProductAction(view, "edit-product");
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Choisir dans la photothèque")),
    );
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );

    await act(async () => fireEvent.press(view.getByTestId("save-product")));
    expect(view.getByTestId("managed-image").props.children).toBe(
      REPLACEMENT_IMAGE_URI,
    );
    expect(shownImage(view, "product-detail-image-source")).toBe(REPLACEMENT_IMAGE_URI);
    alertSpy.mockRestore();
  });

  it("can save the selected original while optional image processing is still pending", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    const preparation = createDeferred<string>();
    mockRemoveImageBackground.mockReturnValue(preparation.promise);
    const view = await renderEditor(<SeededImageEditor />);

    await act(async () =>
      fireEvent.press(view.getByTestId("open-seeded-image-product")),
    );
    await openProductAction(view, "edit-product");
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Choisir dans la photothèque")),
    );

    expect(shownImage(view, "product-form-image-source")).toBe("file:///products/raw.jpg");
    expect(
      view.getByLabelText("Modifier la photo").props.accessibilityState,
    ).toEqual({
      busy: true,
      disabled: true,
    });
    expect(
      view.getByTestId("save-product").props.accessibilityState?.disabled,
    ).toBe(false);

    await act(async () => fireEvent.press(view.getByTestId("save-product")));
    expect(view.getByTestId("managed-image").props.children).toBe(
      "file:///products/raw.jpg",
    );

    await act(async () => preparation.resolve(REPLACEMENT_IMAGE_URI));
    expect(view.getByTestId("managed-image").props.children).toBe(
      "file:///products/raw.jpg",
    );
    expect(shownImage(view, "product-detail-image-source")).toBe("file:///products/raw.jpg");
    alertSpy.mockRestore();
  });

  it("ignores pending image processing after an edit is cancelled", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    const preparation = createDeferred<string>();
    mockRemoveImageBackground.mockReturnValue(preparation.promise);
    const view = await renderEditor(<SeededImageEditor />);

    await act(async () =>
      fireEvent.press(view.getByTestId("open-seeded-image-product")),
    );
    await openProductAction(view, "edit-product");
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Choisir dans la photothèque")),
    );
    await act(async () =>
      fireEvent.press(view.getByTestId("cancel-product-edit")),
    );
    await openProductAction(view, "edit-product");

    await act(async () => preparation.resolve(REPLACEMENT_IMAGE_URI));
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );
    expect(shownImage(view, "product-form-image-source")).toBe(ORIGINAL_IMAGE_URI);
    alertSpy.mockRestore();
  });

  it("keeps image removal in the edit draft until Save and restores it on Cancel", async () => {
    const view = await renderEditor(<SeededImageEditor />);

    await act(async () =>
      fireEvent.press(view.getByTestId("open-seeded-image-product")),
    );
    await openProductAction(view, "edit-product");
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Supprimer la photo")),
    );

    expect(view.queryByTestId("product-form-image-source")).toBeNull();
    await settleSheetTransition();
    expect(view.queryByTestId("product-photo-sheet")).toBeNull();
    expect(view.getByTestId("product-photo-empty")).toBeTruthy();
    expect(view.getByLabelText("Ajouter une photo")).toBeTruthy();
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );

    await act(async () =>
      fireEvent.press(view.getByTestId("cancel-product-edit")),
    );
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );
    expect(shownImage(view, "product-detail-image-source")).toBe(ORIGINAL_IMAGE_URI);

    await openProductAction(view, "edit-product");
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Supprimer la photo")),
    );
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );
    await act(async () => fireEvent.press(view.getByTestId("save-product")));

    expect(view.getByTestId("managed-image").props.children).toBe("-");
    expect(view.queryByTestId("product-detail-image-source")).toBeNull();
    expect(view.getByLabelText("Aucune photo pour Masque réparateur 5 min")).toBeTruthy();
    expect(view.getByText("Actif")).toBeTruthy();
    expect(view.getByText("50,00 €")).toBeTruthy();
    expect(view.getByText("Informations")).toBeTruthy();
    expect(view.getByTestId("product-stock")).toBeTruthy();
  });

  it("asks for the camera permission on « Prendre une photo », before the camera, never earlier", async () => {
    mockCameraAccess = "granted";
    const view = await renderEditor(<ProductEditorScreen mode="create" />);
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();

    await act(async () =>
      fireEvent.press(view.getByLabelText("Ajouter une photo")),
    );
    // Opening the photo menu asks for nothing.
    expect(mockEnsureCameraAccess).not.toHaveBeenCalled();

    await act(async () =>
      fireEvent.press(view.getByLabelText("Prendre une photo")),
    );
    expect(mockEnsureCameraAccess).toHaveBeenCalledTimes(1);
    await settleSheetTransition();
    expect(view.getByTestId("mock-camera-capture")).toBeTruthy();
  });

  it("keeps the Product form usable when camera access is blocked", async () => {
    mockCameraAccess = "blocked";
    const view = await renderEditor(<ProductEditorScreen mode="create" />);

    await act(async () =>
      fireEvent.changeText(view.getByLabelText("Nom du produit"), "Soin Test"),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Ajouter une photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Prendre une photo")),
    );

    await settleSheetTransition();
    expect(view.queryByTestId("product-photo-sheet")).toBeNull();
    expect(view.queryByTestId("mock-camera-capture")).toBeNull();
    expect(view.getByText("Accès à l’appareil photo")).toBeTruthy();
    await act(async () =>
      fireEvent.press(view.getByText("Ouvrir les réglages")),
    );
    expect(mockOpenAppSettings).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText("Nom du produit").props.value).toBe("Soin Test");
    expect(view.getByLabelText("Ajouter une photo")).toBeTruthy();
    expect(view.getByTestId("managed-image").props.children).toBe("-");
  });

  it("deactivates through the shared BeautIzzy dialog and reactivates, closing each time", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    await openProductAction(view, "toggle-product-active");
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId("product-deactivation-dialog")).toBeTruthy();
    expect(view.getByText("Désactiver ce produit ?")).toBeTruthy();
    // Reversible: « Annuler » and the accent primary « Désactiver ».
    const deactivation = within(view.getByTestId("product-deactivation-dialog"));
    expect(deactivation.getByRole("button", { name: "Annuler" })).toBeTruthy();
    expect(view.getByTestId("confirm-product-deactivation")).toHaveStyle({
      backgroundColor: semanticColors.accent,
    });
    await act(async () => {
      fireEvent.press(view.getByTestId("confirm-product-deactivation"));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("masque-active").props.children).toBe("false");

    await act(async () => {
      fireEvent.press(view.getByTestId("open-product-actions"));
    });
    await settleSheetTransition();
    expect(view.getByText("Réactiver le produit")).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId("toggle-product-active"));
    });
    await settleSheetTransition();
    expect(mockBack).toHaveBeenCalledTimes(2);
    expect(view.getByTestId("masque-active").props.children).toBe("true");
    alertSpy.mockRestore();
  });

  it("deletes only after the shared BeautIzzy confirmation, never a native alert", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    await openProductAction(view, "open-product-deletion");
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId("product-deletion-dialog")).toBeTruthy();
    expect(view.getByText("SUPPRESSION")).toBeTruthy();
    expect(view.getByText("Supprimer ce produit ?")).toBeTruthy();
    expect(view.getByText(/Cette action est irréversible/)).toBeTruthy();
    // Irreversible: « Annuler » (never « Retour ») and the rose destructive « Supprimer ».
    const deletion = within(view.getByTestId("product-deletion-dialog"));
    expect(deletion.getByRole("button", { name: "Annuler" })).toBeTruthy();
    expect(deletion.queryByText("Retour")).toBeNull();
    expect(view.getByTestId("confirm-product-deletion")).toHaveStyle({
      backgroundColor: rose.rose100,
    });

    await act(async () => {
      fireEvent.press(view.getByTestId("cancel-product-deletion"));
    });
    expect(view.queryByTestId("product-deletion-dialog")).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId("managed-product").props.children).toContain(
      "Masque réparateur",
    );

    await openProductAction(view, "open-product-deletion");
    await act(async () => {
      fireEvent.press(view.getByTestId("confirm-product-deletion"));
    });

    expect(view.getByTestId("managed-product").props.children).toBe("");
    expect(mockBack).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("prefills the create draft with the exact route barcode and allows duplicates", async () => {
    const view = await renderEditor(
      <ProductEditorScreen initialBarcode=" 3474637152000 " mode="create" />,
    );

    expect(view.getByLabelText("Code-barres du produit").props.value).toBe(
      "3474637152000",
    );
    expect(
      view.getByText(
        "Ce code-barres est aussi utilisé par « Masque réparateur 5 min ».",
      ),
    ).toBeTruthy();
    expect(view.getByTestId("catalog-count").props.children).toBe(50);

    await act(async () =>
      fireEvent.press(view.getByLabelText("Ajouter une photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Choisir dans la photothèque")),
    );

    expect(view.getByLabelText("Code-barres du produit").props.value).toBe(
      "3474637152000",
    );
    expect(view.getByTestId("product-form-image-source")).toBeTruthy();
    expect(view.getByTestId("catalog-count").props.children).toBe(50);
  });

  it("keeps a scanned create barcode in the draft until normal save", async () => {
    mockScannedBarcode = "0012345678901";
    const view = await renderEditor(<ProductEditorScreen mode="create" />);

    await act(async () =>
      fireEvent.press(view.getByLabelText("Scanner un code-barres")),
    );
    await act(async () =>
      fireEvent.press(view.getByTestId("mock-camera-detection")),
    );

    expect(view.getByLabelText("Code-barres du produit").props.value).toBe(
      "0012345678901",
    );
    expect(view.getByTestId("catalog-count").props.children).toBe(50);

    await act(async () =>
      fireEvent.changeText(
        view.getByLabelText("Nom du produit"),
        "Shampooing Test",
      ),
    );
    await act(async () =>
      fireEvent.changeText(view.getByLabelText("Prix du produit"), "25"),
    );
    await act(async () => fireEvent.press(view.getByTestId("save-product")));

    expect(view.getByTestId("managed-product").props.children).toContain(
      ":Shampooing Test:-:-:0012345678901:25:0:true",
    );
  });

  it("discards or saves a scanned edit barcode through the existing form actions", async () => {
    mockScannedBarcode = "0012345678901";
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    await openProductAction(view, "edit-product");
    await act(async () =>
      fireEvent.press(view.getByLabelText("Scanner un code-barres")),
    );
    await act(async () =>
      fireEvent.press(view.getByTestId("mock-camera-detection")),
    );

    expect(view.getByLabelText("Code-barres du produit").props.value).toBe(
      "0012345678901",
    );
    expect(view.getByTestId("managed-product").props.children).toContain(
      ":3474637152000:",
    );

    await act(async () =>
      fireEvent.press(view.getByTestId("cancel-product-edit")),
    );
    expect(view.getByTestId("managed-product").props.children).toContain(
      ":3474637152000:",
    );
    expect(view.getByText("3474637152000")).toBeTruthy();

    await openProductAction(view, "edit-product");
    await act(async () =>
      fireEvent.press(view.getByLabelText("Scanner un code-barres")),
    );
    await act(async () =>
      fireEvent.press(view.getByTestId("mock-camera-detection")),
    );
    await act(async () => fireEvent.press(view.getByTestId("save-product")));

    expect(view.getByTestId("managed-product").props.children).toContain(
      ":0012345678901:",
    );
  });
});

describe("ProductEditorScreen — keyboard", () => {
  it("keeps the price, low in the form, visible above the decimal keyboard without touching its entry", async () => {
    const keyboard = captureKeyboardEvents();
    scrollToMock().mockClear();
    const view = await renderEditor(<ProductEditorScreen mode="create" />);
    // The sheet body starts 100 pt below the window top and is 600 pt tall; the
    // test keyboard top is at 500 → 400 pt stay visible.
    const staged = stageFocusedInput({ viewport: { top: 100, height: 600 }, input: { top: 720, height: 44 } });

    await act(async () => fireEvent(view.getByLabelText("Prix du produit"), "focus"));
    await keyboard.show();
    await settleFormScroll();

    expect(scrollToMock()).toHaveBeenCalledWith({ y: 764 + FORM_SCROLL_REVEAL_MARGIN - 400, animated: true });
    await act(async () => fireEvent.changeText(view.getByLabelText("Prix du produit"), "25"));
    expect(view.getByLabelText("Prix du produit").props.value).toBe("25");
    expect(view.getByLabelText("Prix du produit").props.keyboardType).toBe("decimal-pad");

    await keyboard.hide();
    staged.restore();
    keyboard.restore();
  });
});

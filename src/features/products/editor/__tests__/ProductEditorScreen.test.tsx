import { act, fireEvent, render, within } from "@testing-library/react-native";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text } from "react-native";

import {
  ProductCatalogProvider,
  useProductCatalog,
} from "../../session/ProductCatalogProvider";
import { ProductEditorScreen } from "../ProductEditorScreen";
import { createMemoryLocalFiles } from "@/persistence/testing/memory-local-files";
import { TestPersistenceProvider } from "@/providers/testing/TestPersistenceProvider";
import { settleSheetTransition } from "@/shared/ui/testing/sheet-transitions";

const mockBack = jest.fn();
const mockSetOptions = jest.fn();
let mockScannedBarcode = "";
let mockPhotoResult:
  | { readonly status: "selected"; readonly uri: string }
  | { readonly status: "cancelled" }
  | { readonly status: "permission-denied"; readonly canAskAgain: boolean }
  | { readonly status: "error" };
let mockCapturedUri = "file:///products/raw.jpg";
const mockPickProductPhotoFromLibrary = jest.fn(() =>
  Promise.resolve(mockPhotoResult),
);
const mockRemoveImageBackground = jest.fn((uri: string) =>
  Promise.resolve(uri),
);

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
  useRouter: () => ({ back: mockBack }),
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

jest.mock("expo-symbols", () => ({ SymbolView: () => null }));

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

jest.mock("@/features/products/images/product-photo-acquisition", () => ({
  pickProductPhotoFromLibrary: () => mockPickProductPhotoFromLibrary(),
}));

// The camera is covered by ProductCameraModal tests; here it only emits a capture.
jest.mock("../components/ProductCameraModal", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const { Pressable: MockPressable } = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");

  return {
    ProductCameraModal: ({
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

function CatalogProbe() {
  const { addProduct, products } = useProductCatalog();
  const managed =
    products.find((product) => product.name === "Shampooing Test") ??
    products.find((product) => product.id === "6974bff937a5d89c2d9afbd0");

  return (
    <>
      <Text testID="managed-product">
        {managed
          ? `${managed.id}:${managed.name}:${managed.brand ?? "-"}:${managed.category ?? "-"}:${managed.barcode ?? "-"}:${managed.price}:${managed.stockQuantity}:${managed.active}`
          : ""}
      </Text>
      <Text testID="managed-image">{managed?.imageUri ?? "-"}</Text>
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
        updateProduct({ ...product, imageUri: ORIGINAL_IMAGE_URI });
        setOpen(true);
      }}
    />
  );
}

// Every image URI in this file lives under file:///products/, which is the
// Souris-owned image directory when the document directory is file:///. The
// catalog therefore keeps the URIs verbatim; promotion itself is covered by
// the product-image-storage and ProductCatalogProvider tests.
function renderEditor(screen: React.ReactNode) {
  return render(
    <TestPersistenceProvider
      files={createMemoryLocalFiles({ documentDirectoryUri: "file:///" })}
    >
      <ProductCatalogProvider>
      {screen}
      <CatalogProbe />
      </ProductCatalogProvider>
    </TestPersistenceProvider>,
  );
}

describe("ProductEditorScreen", () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockSetOptions.mockClear();
    mockScannedBarcode = "";
    mockPhotoResult = { status: "selected", uri: "file:///products/raw.jpg" };
    mockCapturedUri = "file:///products/raw.jpg";
    mockPickProductPhotoFromLibrary.mockClear();
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
    expect(view.getByTestId("product-form-image-source").props.source).toEqual({
      uri: REPLACEMENT_IMAGE_URI,
    });
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

  it("keeps a legacy stock above 30 intact unless the professional changes it", async () => {
    const view = await renderEditor(<SeededLegacyStockEditor />);

    await act(async () =>
      fireEvent.press(view.getByTestId("open-legacy-stock-product")),
    );
    expect(within(view.getByTestId("product-read-view")).getByText("47")).toBeTruthy();

    // Saving an unrelated field preserves the exact quantity.
    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
    expect(view.getByTestId("stock-value").props.children).toBe(47);
    expect(view.getByTestId("stock-increment").props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix du produit"), "13");
    });
    await act(async () => fireEvent.press(view.getByTestId("save-product")));
    expect(view.getByTestId("legacy-stock").props.children).toBe(47);

    // Lowering it is an intentional change, one unit at a time.
    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
    await pressTimes(view, "stock-decrement", 1);
    expect(view.getByTestId("stock-value").props.children).toBe(46);
    await act(async () => fireEvent.press(view.getByTestId("save-product")));
    expect(view.getByTestId("legacy-stock").props.children).toBe(46);
  });

  it("sizes the details to their content and disables the swipe only while editing", async () => {
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    const sheetStyle = StyleSheet.flatten(view.getByTestId("product-sheet").props.style);
    expect(sheetStyle.flex).toBeUndefined();
    expect(sheetStyle.maxHeight).toBeGreaterThan(0);
    expect(view.getByText("PRODUIT")).toBeTruthy();
    expect(view.getByRole("header", { name: "Masque réparateur 5 min" })).toBeTruthy();
    expect(view.getByLabelText("Fermer")).toBeTruthy();
    expect(view.getByTestId("product-read-actions")).toBeTruthy();
    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });

    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: false });
    await act(async () => fireEvent.press(view.getByTestId("cancel-product-edit")));
    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
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
    expect(view.queryByTestId("product-detail-image")).toBeNull();
    expect(view.getByText("Actif")).toBeTruthy();
    expect(view.getByText("Informations")).toBeTruthy();
    expect(view.getByText("Stock")).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId("edit-product"));
    });
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

  it("keeps an image replacement in the edit draft until Save and discards it on Cancel", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    mockRemoveImageBackground.mockResolvedValue(REPLACEMENT_IMAGE_URI);
    const view = await renderEditor(<SeededImageEditor />);

    await act(async () =>
      fireEvent.press(view.getByTestId("open-seeded-image-product")),
    );
    expect(
      view.getByTestId("product-detail-image-source").props.source,
    ).toEqual({
      uri: ORIGINAL_IMAGE_URI,
    });
    expect(
      view.getByTestId("product-detail-image-source").props.contentFit,
    ).toBe("contain");
    // A plain photograph keeps the flat presentation (no sticker contour).
    expect(view.queryByTestId("product-detail-image-sticker")).toBeNull();

    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
    expect(view.getByTestId("product-form-image-source").props.source).toEqual({
      uri: ORIGINAL_IMAGE_URI,
    });
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
    expect(view.getByTestId("product-form-image-source").props.source).toEqual({
      uri: REPLACEMENT_IMAGE_URI,
    });
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );

    await act(async () =>
      fireEvent.press(view.getByTestId("cancel-product-edit")),
    );
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );
    expect(
      view.getByTestId("product-detail-image-source").props.source,
    ).toEqual({
      uri: ORIGINAL_IMAGE_URI,
    });

    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
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
    expect(
      view.getByTestId("product-detail-image-source").props.source,
    ).toEqual({
      uri: REPLACEMENT_IMAGE_URI,
    });
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
    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Choisir dans la photothèque")),
    );

    expect(view.getByTestId("product-form-image-source").props.source).toEqual({
      uri: "file:///products/raw.jpg",
    });
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
    expect(
      view.getByTestId("product-detail-image-source").props.source,
    ).toEqual({
      uri: "file:///products/raw.jpg",
    });
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
    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
    await act(async () =>
      fireEvent.press(view.getByLabelText("Modifier la photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Choisir dans la photothèque")),
    );
    await act(async () =>
      fireEvent.press(view.getByTestId("cancel-product-edit")),
    );
    await act(async () => fireEvent.press(view.getByTestId("edit-product")));

    await act(async () => preparation.resolve(REPLACEMENT_IMAGE_URI));
    expect(view.getByTestId("managed-image").props.children).toBe(
      ORIGINAL_IMAGE_URI,
    );
    expect(view.getByTestId("product-form-image-source").props.source).toEqual({
      uri: ORIGINAL_IMAGE_URI,
    });
    alertSpy.mockRestore();
  });

  it("keeps image removal in the edit draft until Save and restores it on Cancel", async () => {
    const view = await renderEditor(<SeededImageEditor />);

    await act(async () =>
      fireEvent.press(view.getByTestId("open-seeded-image-product")),
    );
    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
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
    expect(
      view.getByTestId("product-detail-image-source").props.source,
    ).toEqual({
      uri: ORIGINAL_IMAGE_URI,
    });

    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
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
    expect(view.queryByTestId("product-detail-image")).toBeNull();
    expect(view.getByText("Actif")).toBeTruthy();
    expect(view.getByText("50,00 €")).toBeTruthy();
    expect(view.getByText("Informations")).toBeTruthy();
    expect(view.getByText("Stock")).toBeTruthy();
  });

  it("keeps the Product form usable when photo permission is denied", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    mockPhotoResult = { status: "permission-denied", canAskAgain: false };
    const view = await renderEditor(<ProductEditorScreen mode="create" />);

    await act(async () =>
      fireEvent.changeText(view.getByLabelText("Nom du produit"), "Soin Test"),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Ajouter une photo")),
    );
    await act(async () =>
      fireEvent.press(view.getByLabelText("Choisir dans la photothèque")),
    );

    await settleSheetTransition();
    expect(view.queryByTestId("product-photo-sheet")).toBeNull();
    expect(alertSpy).toHaveBeenLastCalledWith(
      "Accès à la photothèque refusé",
      expect.stringContaining("réglages"),
      expect.anything(),
    );
    expect(view.getByLabelText("Nom du produit").props.value).toBe("Soin Test");
    expect(view.getByLabelText("Ajouter une photo")).toBeTruthy();
    expect(view.getByTestId("managed-image").props.children).toBe("-");
    alertSpy.mockRestore();
  });

  it("deactivates through the shared Souris dialog and reactivates, closing each time", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByText("Désactiver"));
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId("product-deactivation-dialog")).toBeTruthy();
    expect(view.getByText("Désactiver ce produit ?")).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId("confirm-product-deactivation"));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("masque-active").props.children).toBe("false");

    await act(async () => {
      fireEvent.press(view.getByText("Réactiver"));
    });
    expect(mockBack).toHaveBeenCalledTimes(2);
    expect(view.getByTestId("masque-active").props.children).toBe("true");
    alertSpy.mockRestore();
  });

  it("deletes only after the shared Souris confirmation, never a native alert", async () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByLabelText("Supprimer ce produit"));
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId("product-deletion-dialog")).toBeTruthy();
    expect(view.getByText("SUPPRESSION")).toBeTruthy();
    expect(view.getByText("Supprimer ce produit ?")).toBeTruthy();
    expect(view.getByText(/Cette action est irréversible/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId("cancel-product-deletion"));
    });
    expect(view.queryByTestId("product-deletion-dialog")).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId("managed-product").props.children).toContain(
      "Masque réparateur",
    );

    await act(async () => {
      fireEvent.press(view.getByLabelText("Supprimer ce produit"));
    });
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
      fireEvent.press(view.getByLabelText("Scanner le code-barres")),
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

    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
    await act(async () =>
      fireEvent.press(view.getByLabelText("Scanner le code-barres")),
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

    await act(async () => fireEvent.press(view.getByTestId("edit-product")));
    await act(async () =>
      fireEvent.press(view.getByLabelText("Scanner le code-barres")),
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

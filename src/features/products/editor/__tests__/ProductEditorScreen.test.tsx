import { act, fireEvent, render } from "@testing-library/react-native";
import { useState } from "react";
import { Alert, Pressable, Text } from "react-native";

import {
  ProductCatalogProvider,
  useProductCatalog,
} from "../../session/ProductCatalogProvider";
import { ProductEditorScreen } from "../ProductEditorScreen";

const mockBack = jest.fn();
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
  const { products } = useProductCatalog();
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
    </>
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

function renderEditor(screen: React.ReactNode) {
  return render(
    <ProductCatalogProvider>
      {screen}
      <CatalogProbe />
    </ProductCatalogProvider>,
  );
}

describe("ProductEditorScreen", () => {
  beforeEach(() => {
    mockBack.mockClear();
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
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Stock du produit"), "4");
    });
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

    // Source sheet → (dismissed) → camera: never both at once.
    await act(async () =>
      fireEvent.press(view.getByLabelText("Prendre une photo")),
    );
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

  it("rejects invalid stock and price inputs", async () => {
    const view = await renderEditor(<ProductEditorScreen mode="create" />);

    await act(async () => {
      fireEvent.changeText(
        view.getByLabelText("Nom du produit"),
        "Shampooing Test",
      );
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Prix du produit"), "25");
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Stock du produit"), "2.5");
    });

    expect(
      view.getByTestId("save-product").props.accessibilityState?.disabled,
    ).toBe(true);
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
    await act(async () => {
      fireEvent.changeText(view.getByLabelText("Stock du produit"), "7");
    });
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

  it("deactivates and reactivates with the details closing each time", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByText("Désactiver"));
    });
    const deactivate = alertSpy.mock.calls[0][2]?.find(
      (button) => button.text === "Désactiver",
    );
    expect(deactivate).toBeTruthy();
    await act(async () => {
      deactivate?.onPress?.();
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

  it("deletes only after explicit confirmation and closes the details", async () => {
    const alertSpy = jest.spyOn(Alert, "alert");
    const view = await renderEditor(
      <ProductEditorScreen
        mode="existing"
        productId="6974bff937a5d89c2d9afbd0"
      />,
    );

    await act(async () => {
      fireEvent.press(view.getByLabelText("Supprimer ce produit"));
    });
    expect(alertSpy).toHaveBeenCalledWith(
      "Supprimer ce produit ?",
      "Il sera supprimé du catalogue.\nCette action est irréversible.",
      expect.anything(),
    );

    const cancel = alertSpy.mock.calls[0][2]?.find(
      (button) => button.text === "Annuler",
    );
    await act(async () => {
      cancel?.onPress?.();
    });
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId("managed-product").props.children).toContain(
      "Masque réparateur",
    );

    await act(async () => {
      fireEvent.press(view.getByLabelText("Supprimer ce produit"));
    });
    const confirm = alertSpy.mock.calls[1][2]?.find(
      (button) => button.text === "Supprimer",
    );
    expect(confirm).toBeTruthy();
    await act(async () => {
      confirm?.onPress?.();
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

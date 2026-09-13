import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { ProductCatalogProvider, useProductCatalog } from '../../session/ProductCatalogProvider';
import { ProductCatalogScreen } from '../ProductCatalogScreen';
import { createMemoryLocalFiles } from '@/persistence/testing/memory-local-files';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleFloatingReveal, settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

const mockPush = jest.fn();
let mockScannedBarcode = '';

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

jest.mock('@/shared/ui/BarcodeScannerModal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable: MockPressable } = jest.requireActual('react-native') as typeof import('react-native');

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
            testID: 'mock-camera-detection',
          })
        : null,
  };
});

function CatalogProbe() {
  const { addProduct, products, setProductActive } = useProductCatalog();
  const masque = products.find((product) => product.name === 'Masque réparateur 5 min');
  return (
    <>
      <Text testID="catalog-count">{products.length}</Text>
      <Text testID="masque-active">{masque ? String(masque.active) : 'gone'}</Text>
      <Text testID="masque-stock">{masque?.stockQuantity ?? 'gone'}</Text>
      <Pressable
        testID="deactivate-masque"
        onPress={() => setProductActive('6974bff937a5d89c2d9afbd0', false)}
      />
      <Pressable
        testID="add-duplicate-barcode"
        onPress={() =>
          addProduct({
            id: 'duplicate-barcode-product',
            businessId: 'business-test',
            name: 'Autre masque',
            barcode: '3474637152000',
            imageUri: 'file:///products/autre-masque.jpg',
            price: 18,
            stockQuantity: 3,
            active: true,
          })
        }
      />
      <Pressable
        testID="add-isolated-product"
        onPress={() =>
          addProduct({
            id: 'isolated-product',
            businessId: 'business-test',
            name: 'Sérum détouré',
            imageUri: 'file:///caches/ProductImages/product-1.png',
            price: 32,
            stockQuantity: 1,
            active: true,
          })
        }
      />
    </>
  );
}

// file:///products/ is the Souris-owned image directory here (document
// directory file:///), so owned URIs stay verbatim; the cache PNG is a real
// temporary artifact that gets promoted on save.
function renderCatalog() {
  const files = createMemoryLocalFiles({
    documentDirectoryUri: 'file:///',
    cacheDirectoryUri: 'file:///caches/',
  });
  files.addFile('file:///caches/ProductImages/product-1.png');
  return render(
    <TestPersistenceProvider files={files}>
      <ProductCatalogProvider>
      <ProductCatalogScreen />
      <CatalogProbe />
      </ProductCatalogProvider>
    </TestPersistenceProvider>,
  );
}

describe('ProductCatalogScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockScannedBarcode = '';
  });

  it('presents the imported catalog with active/inactive groups', async () => {
    const view = await renderCatalog();

    expect(view.getByText('Produits')).toBeTruthy();
    expect(view.getByText('Actifs')).toBeTruthy();
    expect(view.getByText('Masque réparateur 5 min')).toBeTruthy();
    expect(view.getAllByText('Redken · Soin').length).toBeGreaterThanOrEqual(1);
    expect(view.getAllByText('50,00 €').length).toBeGreaterThanOrEqual(1);
    expect(view.getAllByText('Stock épuisé').length).toBeGreaterThanOrEqual(1);
    expect(view.getByLabelText('Aucune photo pour Masque réparateur 5 min')).toBeTruthy();
  });

  it('anchors the decorative products watermark, hidden from accessibility and touches', async () => {
    const view = await renderCatalog();

    expect(view.queryByTestId('screen-watermark-products')).toBeNull();
    const watermark = view.getByTestId('screen-watermark-products', { includeHiddenElements: true });
    expect(watermark.props.pointerEvents).toBe('none');
    expect(watermark.props.accessibilityElementsHidden).toBe(true);
  });

  it('shows a Product thumbnail and a restrained fallback without losing row information', async () => {
    const view = await renderCatalog();

    await act(async () => fireEvent.press(view.getByTestId('add-duplicate-barcode')));

    expect(view.getByLabelText('Photo de Autre masque')).toBeTruthy();
    expect(
      view.getByTestId('catalog-product-image-duplicate-barcode-product-source').props.source,
    ).toEqual({ uri: 'file:///products/autre-masque.jpg' });
    expect(
      view.getByTestId('catalog-product-image-duplicate-barcode-product-source').props.contentFit,
    ).toBe('cover');
    expect(
      view.queryByTestId('catalog-product-image-duplicate-barcode-product-sticker'),
    ).toBeNull();
    expect(view.getByText('Autre masque')).toBeTruthy();
    expect(view.getByText('18,00 €')).toBeTruthy();
    expect(view.getByText('Stock 3')).toBeTruthy();
    expect(view.getByLabelText('Aucune photo pour Masque réparateur 5 min')).toBeTruthy();
  });

  it('presents an isolated PNG thumbnail as a light sticker without changing row content', async () => {
    const view = await renderCatalog();

    await act(async () => fireEvent.press(view.getByTestId('add-isolated-product')));

    expect(view.getByLabelText('Photo de Sérum détouré')).toBeTruthy();
    expect(view.getByTestId('catalog-product-image-isolated-product-sticker')).toBeTruthy();
    expect(
      view.getByTestId('catalog-product-image-isolated-product-source').props.contentFit,
    ).toBe('contain');
    expect(view.getByText('Sérum détouré')).toBeTruthy();
    expect(view.getByText('32,00 €')).toBeTruthy();
  });

  it('searches by name, brand, category, and barcode', async () => {
    const view = await renderCatalog();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un produit'), 'redken');
    });
    expect(view.getByText('Masque réparateur 5 min')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un produit'), '0884486532879');
    });
    expect(view.getByText('Sérum nuit')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un produit'), 'introuvable');
    });
    expect(view.getByText('Aucun produit trouvé')).toBeTruthy();
  });

  it('keeps the reference header: title, search, no eyebrow, no inline creation buttons', async () => {
    const view = await renderCatalog();

    expect(view.getByRole('header', { name: 'Produits' })).toBeTruthy();
    expect(view.queryByText('PRODUITS')).toBeNull();
    expect(view.getByPlaceholderText('Rechercher un produit')).toBeTruthy();
    expect(view.queryByText('Nouvelle vente')).toBeNull();
    expect(view.queryByText('Ajouter un produit')).toBeNull();
    // The + reveals shortly after focus; until then it is neither shown nor tappable.
    expect(view.queryByTestId('products-create')).toBeNull();
    await settleFloatingReveal();
    expect(view.getByTestId('products-create')).toBeTruthy();
    expect(view.queryByTestId('products-create-menu')).toBeNull();
  });

  it('expands the floating + into both creation flows and routes each one', async () => {
    const view = await renderCatalog();
    await settleFloatingReveal();

    await act(async () => fireEvent.press(view.getByTestId('products-create')));
    expect(view.getByTestId('products-create-menu')).toBeTruthy();
    expect(view.getByLabelText('Nouvelle vente')).toBeTruthy();
    expect(view.getByLabelText('Ajouter un produit')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('new-sale')));
    expect(mockPush).toHaveBeenCalledWith('/sales/new');
    await settleSheetTransition();
    expect(view.queryByTestId('products-create-menu')).toBeNull();

    await act(async () => fireEvent.press(view.getByTestId('products-create')));
    await act(async () => fireEvent.press(view.getByTestId('new-product')));
    expect(mockPush).toHaveBeenCalledWith('/products/new');
    await settleSheetTransition();
    expect(view.queryByTestId('products-create-menu')).toBeNull();
  });

  it('closes the creation menu on an outside tap without routing anywhere', async () => {
    const view = await renderCatalog();
    await settleFloatingReveal();

    await act(async () => fireEvent.press(view.getByTestId('products-create')));
    await act(async () => fireEvent.press(view.getByTestId('products-create-dismiss')));
    await settleSheetTransition();

    expect(view.queryByTestId('products-create-menu')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens an existing Product detail', async () => {
    const view = await renderCatalog();

    await act(async () => {
      fireEvent.press(view.getByText('Masque réparateur 5 min'));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[productId]',
      params: { productId: '6974bff937a5d89c2d9afbd0' },
    });
  });

  it('moves a deactivated Product to the inactive group without removing it', async () => {
    const view = await renderCatalog();

    await act(async () => {
      fireEvent.press(view.getByTestId('deactivate-masque'));
    });

    expect(view.getByTestId('catalog-count').props.children).toBe(50);
    expect(view.getByTestId('masque-active').props.children).toBe('false');
  });

  it('opens the unique exact barcode match without changing stock', async () => {
    mockScannedBarcode = '3474637152000';
    const view = await renderCatalog();

    await act(async () => fireEvent.press(view.getByLabelText('Scanner un code-barres')));
    await act(async () => fireEvent.press(view.getByTestId('mock-camera-detection')));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[productId]',
      params: { productId: '6974bff937a5d89c2d9afbd0' },
    });
    expect(view.getByTestId('masque-stock').props.children).toBe(0);
  });

  it('offers creation with the exact unknown barcode prefilled', async () => {
    mockScannedBarcode = '0001234567890';
    const view = await renderCatalog();

    await act(async () => fireEvent.press(view.getByLabelText('Scanner un code-barres')));
    await act(async () => fireEvent.press(view.getByTestId('mock-camera-detection')));

    const result = within(view.getByTestId('barcode-result'));
    expect(result.getByText('Produit introuvable')).toBeTruthy();
    expect(result.getByText('0001234567890')).toBeTruthy();
    expect(view.getAllByTestId('bottom-sheet-scrim')).toHaveLength(1);

    await act(async () => fireEvent.press(result.getByText('Ajouter un produit')));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/new',
      params: { barcode: '0001234567890' },
    });
  });

  it('asks which Product to open when duplicate barcodes exist', async () => {
    mockScannedBarcode = '3474637152000';
    const view = await renderCatalog();

    await act(async () => fireEvent.press(view.getByTestId('add-duplicate-barcode')));
    await act(async () => fireEvent.press(view.getByLabelText('Scanner un code-barres')));
    await act(async () => fireEvent.press(view.getByTestId('mock-camera-detection')));

    const result = within(view.getByTestId('barcode-result'));
    expect(result.getByText('Plusieurs produits trouvés')).toBeTruthy();
    expect(result.getByText('Masque réparateur 5 min')).toBeTruthy();
    expect(result.getByText('Autre masque')).toBeTruthy();

    await act(async () => fireEvent.press(result.getByText('Autre masque')));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/products/[productId]',
      params: { productId: 'duplicate-barcode-product' },
    });
  });
});

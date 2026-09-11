import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { ProductCatalogProvider, useProductCatalog } from '../../session/ProductCatalogProvider';
import { ProductCatalogScreen } from '../ProductCatalogScreen';

const mockPush = jest.fn();
let mockScannedBarcode = '';

jest.mock('expo-router', () => ({
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

function renderCatalog() {
  return render(
    <ProductCatalogProvider>
      <ProductCatalogScreen />
      <CatalogProbe />
    </ProductCatalogProvider>,
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

  it('opens the Sale creation flow from the Produits tab', async () => {
    const view = await renderCatalog();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Nouvelle vente'));
    });
    expect(mockPush).toHaveBeenCalledWith('/sales/new');
  });

  it('opens the create flow and an existing Product detail', async () => {
    const view = await renderCatalog();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Ajouter un produit'));
    });
    expect(mockPush).toHaveBeenCalledWith('/products/new');

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

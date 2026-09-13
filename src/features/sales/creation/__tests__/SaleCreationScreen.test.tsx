import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Alert, Pressable, Text } from 'react-native';

import { archiveClient } from '@/domain/clients';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { createDevelopmentSeed } from '@/providers/development-seed';
import {
  ProductCatalogProvider,
  useProductCatalog,
} from '@/features/products/session/ProductCatalogProvider';
import { formatServicePrice } from '@/features/services/presentation';
import { haptics } from '@/shared/lib/haptics';

import { SaleSessionProvider, useSaleSession } from '../../session/SaleSessionProvider';
import { SaleCreationScreen } from '../SaleCreationScreen';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';

const mockBack = jest.fn();
let mockScannedBarcode = '';
const successHaptic = jest.spyOn(haptics, 'success').mockImplementation();
const selectionHaptic = jest.spyOn(haptics, 'selection').mockImplementation();
const warningHaptic = jest.spyOn(haptics, 'warning').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { DateTimePicker: () => React.createElement(View, null) };
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

// Real legacy catalog identities (stock starts at 0 — the probe sets real counts).
const MASQUE_ID = '6974bff937a5d89c2d9afbd0'; // Masque réparateur 5 min · 50 € · 3474637152000
const CONCENTRATE_ID = '68d802c055b09988d663415f'; // Acidic bonding concentrate · 12 € · 30163508

function Probe() {
  const { addProduct, getProductById, setProductActive, setProductStock, deleteProduct } =
    useProductCatalog();
  const { sales } = useSaleSession();
  const masque = getProductById(MASQUE_ID);
  const concentrate = getProductById(CONCENTRATE_ID);
  const lastSale = sales[sales.length - 1];

  return (
    <>
      <Text testID="sales-count">{sales.length}</Text>
      <Text testID="masque-stock">{masque?.stockQuantity ?? 'gone'}</Text>
      <Text testID="concentrate-stock">{concentrate?.stockQuantity ?? 'gone'}</Text>
      <Text testID="last-sale">
        {lastSale
          ? `${lastSale.clientId ?? 'walk-in'}|${lastSale.items
              .map((item) => `${item.productName}:${item.unitPrice}:${item.quantity}`)
              .join('|')}`
          : 'none'}
      </Text>
      <Pressable
        testID="stock-masque-2"
        onPress={() => setProductStock(MASQUE_ID, 2)}
      />
      <Pressable
        testID="stock-masque-1"
        onPress={() => setProductStock(MASQUE_ID, 1)}
      />
      <Pressable
        testID="stock-concentrate-3"
        onPress={() => setProductStock(CONCENTRATE_ID, 3)}
      />
      <Pressable
        testID="deactivate-concentrate"
        onPress={() => setProductActive(CONCENTRATE_ID, false)}
      />
      <Pressable testID="delete-masque" onPress={() => deleteProduct(MASQUE_ID)} />
      <Pressable
        testID="add-duplicate-barcode"
        onPress={() =>
          addProduct({
            id: 'duplicate-barcode-product',
            businessId: 'business-test',
            name: 'Autre masque',
            barcode: '3474637152000',
            price: 18,
            stockQuantity: 3,
            active: true,
          })
        }
      />
    </>
  );
}

/** The development seed with Camille Durand already archived when the screen mounts. */
function createSeedWithArchivedCamille() {
  const seed = createDevelopmentSeed(new Date());
  return {
    ...seed,
    clients: seed.clients.map((client) =>
      client.id === 'client-agenda-camille' ? archiveClient(client, new Date(2026, 8, 1)) : client,
    ),
  };
}

function renderSale(initialClientId?: string, createSeed?: () => ReturnType<typeof createDevelopmentSeed>) {
  return render(
    <TestPersistenceProvider createSeed={createSeed}>
      <ClientSessionProvider>
      <ProductCatalogProvider>
        <SaleSessionProvider>
          <SaleCreationScreen initialClientId={initialClientId} />
          <Probe />
        </SaleSessionProvider>
      </ProductCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

async function press(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await act(async () => fireEvent.press(view.getByTestId(testID)));
}

async function search(view: Awaited<ReturnType<typeof render>>, text: string) {
  await act(async () => {
    fireEvent.changeText(view.getByPlaceholderText('Rechercher un produit'), text);
  });
}

describe('SaleCreationScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockScannedBarcode = '';
    successHaptic.mockClear();
    selectionHaptic.mockClear();
    warningHaptic.mockClear();
  });

  it('starts empty, without Client, with completion disabled', async () => {
    const view = await renderSale();

    expect(view.getByText('Nouvelle vente')).toBeTruthy();
    expect(view.getByText('Aucune cliente')).toBeTruthy();
    expect(view.getByText('Aucun produit ajouté')).toBeTruthy();
    expect(view.getByTestId('validate-sale').props.accessibilityState.disabled).toBe(true);
    expect(view.queryByTestId('sale-total')).toBeNull();
  });

  it('hydrates a supplied Client on the first render, still changeable and removable', async () => {
    const view = await renderSale('client-agenda-camille');

    const clientSurface = within(view.getByTestId('sale-client'));
    expect(clientSurface.getByText('Camille Durand')).toBeTruthy();
    expect(clientSurface.queryByText('Aucune cliente')).toBeNull();
    expect(view.getByLabelText('Modifier la cliente')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByLabelText('Modifier la cliente')));
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'Léa');
    });
    await act(async () => fireEvent.press(view.getByText('Léa Martin')));
    expect(within(view.getByTestId('sale-client')).getByText('Léa Martin')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByLabelText('Retirer la cliente')));
    expect(view.getByText('Aucune cliente')).toBeTruthy();
  });

  it('attaches the supplied Client to the completed Sale', async () => {
    const view = await renderSale('client-agenda-camille');
    await press(view, 'stock-masque-2');
    await search(view, 'masque');
    await press(view, `sale-product-${MASQUE_ID}`);

    await press(view, 'validate-sale');

    expect(view.getByTestId('last-sale').props.children).toBe(
      'client-agenda-camille|Masque réparateur 5 min:50:1',
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('falls back to no Client when the supplied id is unknown, without inventing data', async () => {
    const view = await renderSale('client-missing');

    expect(view.getByText('Aucune cliente')).toBeTruthy();
    expect(view.getByLabelText('Choisir une cliente')).toBeTruthy();
    expect(view.queryByText('Cliente inconnue')).toBeNull();
  });

  it('chooses, changes and removes the optional Client through the shared picker', async () => {
    const view = await renderSale();

    await act(async () => fireEvent.press(view.getByLabelText('Choisir une cliente')));
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'Camille');
    });
    await act(async () => fireEvent.press(view.getByText('Camille Durand')));

    expect(within(view.getByTestId('sale-client')).getByText('Camille Durand')).toBeTruthy();
    expect(view.getByLabelText('Modifier la cliente')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByLabelText('Retirer la cliente')));
    expect(view.getByText('Aucune cliente')).toBeTruthy();
  });

  it('adds a searched Product immediately, increments on second tap, and bounds by stock', async () => {
    const view = await renderSale();
    await press(view, 'stock-masque-2');

    await search(view, 'masque');
    await press(view, `sale-product-${MASQUE_ID}`);

    expect(view.getByTestId(`sale-line-quantity-${MASQUE_ID}`).props.children).toBe(1);
    expect(selectionHaptic).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('sale-total').props.children).toBe(formatServicePrice(50));
    expect(view.getByTestId('validate-sale').props.accessibilityState.disabled).toBe(false);

    await press(view, `sale-product-${MASQUE_ID}`);
    expect(view.getAllByTestId(/^sale-line-[^-]+$/)).toHaveLength(1);
    expect(view.getByTestId(`sale-line-quantity-${MASQUE_ID}`).props.children).toBe(2);
    expect(view.getByTestId(`sale-product-count-${MASQUE_ID}`)).toBeTruthy();
    expect(view.getByTestId('sale-total').props.children).toBe(formatServicePrice(100));

    // Stock is 2: a third tap is refused with a clear notice, nothing changes.
    await press(view, `sale-product-${MASQUE_ID}`);
    expect(view.getByTestId(`sale-line-quantity-${MASQUE_ID}`).props.children).toBe(2);
    expect(view.getByTestId('sale-notice').props.children).toBe(
      'Stock insuffisant pour Masque réparateur 5 min.',
    );
    expect(warningHaptic).toHaveBeenCalledTimes(1);
    expect(
      view.getByTestId(`sale-line-increment-${MASQUE_ID}`).props.accessibilityState.disabled,
    ).toBe(true);
    // The draft never touched canonical stock.
    expect(view.getByTestId('masque-stock').props.children).toBe(2);
  });

  it('adjusts quantities with − / + and removes a line explicitly', async () => {
    const view = await renderSale();
    await press(view, 'stock-masque-2');
    await search(view, 'masque');
    await press(view, `sale-product-${MASQUE_ID}`);

    expect(
      view.getByTestId(`sale-line-decrement-${MASQUE_ID}`).props.accessibilityState.disabled,
    ).toBe(true);

    await press(view, `sale-line-increment-${MASQUE_ID}`);
    expect(view.getByTestId(`sale-line-quantity-${MASQUE_ID}`).props.children).toBe(2);
    expect(view.getByTestId(`sale-line-total-${MASQUE_ID}`).props.children).toBe(formatServicePrice(100));

    await press(view, `sale-line-decrement-${MASQUE_ID}`);
    expect(view.getByTestId(`sale-line-quantity-${MASQUE_ID}`).props.children).toBe(1);

    await press(view, `sale-line-remove-${MASQUE_ID}`);
    expect(view.queryByTestId(`sale-line-${MASQUE_ID}`)).toBeNull();
    expect(view.getByText('Aucun produit ajouté')).toBeTruthy();
    expect(view.getByTestId('validate-sale').props.accessibilityState.disabled).toBe(true);
  });

  it('derives the total from several lines', async () => {
    const view = await renderSale();
    await press(view, 'stock-masque-2');
    await press(view, 'stock-concentrate-3');

    await search(view, 'masque');
    await press(view, `sale-product-${MASQUE_ID}`);
    await search(view, 'concentrate');
    await press(view, `sale-product-${CONCENTRATE_ID}`);
    await press(view, `sale-line-increment-${CONCENTRATE_ID}`);

    expect(view.getByTestId('sale-total').props.children).toBe(formatServicePrice(74));
  });

  it('completes the Sale: session receives the snapshot, stock decrements, screen closes', async () => {
    const view = await renderSale();
    await press(view, 'stock-masque-2');
    await press(view, 'stock-concentrate-3');

    await act(async () => fireEvent.press(view.getByLabelText('Choisir une cliente')));
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'Camille');
    });
    await act(async () => fireEvent.press(view.getByText('Camille Durand')));

    await search(view, 'masque');
    await press(view, `sale-product-${MASQUE_ID}`);
    await search(view, 'concentrate');
    await press(view, `sale-product-${CONCENTRATE_ID}`);
    await press(view, `sale-line-increment-${CONCENTRATE_ID}`);

    await press(view, 'validate-sale');

    expect(view.getByTestId('sales-count').props.children).toBe(1);
    expect(view.getByTestId('last-sale').props.children).toBe(
      'client-agenda-camille|Masque réparateur 5 min:50:1|Acidic bonding concentrate:12:2',
    );
    expect(view.getByTestId('masque-stock').props.children).toBe(1);
    expect(view.getByTestId('concentrate-stock').props.children).toBe(1);
    expect(successHaptic).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('completes a walk-in Sale without Client', async () => {
    const view = await renderSale();
    await press(view, 'stock-masque-2');
    await search(view, 'masque');
    await press(view, `sale-product-${MASQUE_ID}`);

    await press(view, 'validate-sale');

    expect(view.getByTestId('last-sale').props.children).toBe('walk-in|Masque réparateur 5 min:50:1');
    expect(view.getByTestId('masque-stock').props.children).toBe(1);
  });

  it('explains insufficient stock when the catalog changed while drafting and blocks completion', async () => {
    const view = await renderSale();
    await press(view, 'stock-masque-2');
    await search(view, 'masque');
    await press(view, `sale-product-${MASQUE_ID}`);
    await press(view, `sale-line-increment-${MASQUE_ID}`);

    await press(view, 'stock-masque-1');

    expect(
      within(view.getByTestId('sale-issues')).getByText(
        'Stock insuffisant pour Masque réparateur 5 min : 1 en stock, 2 demandés.',
      ),
    ).toBeTruthy();
    expect(view.getByTestId('validate-sale').props.accessibilityState.disabled).toBe(true);
    expect(view.getByTestId('sales-count').props.children).toBe(0);
    expect(view.getByTestId('masque-stock').props.children).toBe(1);
  });

  it('keeps a line readable and blocks completion when its Product disappears', async () => {
    const view = await renderSale();
    await press(view, 'stock-masque-2');
    await search(view, 'masque');
    await press(view, `sale-product-${MASQUE_ID}`);

    await press(view, 'delete-masque');

    expect(within(view.getByTestId(`sale-line-${MASQUE_ID}`)).getByText('Produit indisponible')).toBeTruthy();
    expect(view.getByTestId('validate-sale').props.accessibilityState.disabled).toBe(true);
    expect(
      within(view.getByTestId('sale-issues')).getByText(
        'Un produit n’est plus disponible dans le catalogue.',
      ),
    ).toBeTruthy();
  });

  it('adds a scanned active Product immediately and increments on a second scan', async () => {
    mockScannedBarcode = '3474637152000';
    const view = await renderSale();
    await press(view, 'stock-masque-2');

    await press(view, 'sale-open-barcode-scanner');
    await press(view, 'mock-camera-detection');
    expect(view.getByTestId(`sale-line-quantity-${MASQUE_ID}`).props.children).toBe(1);

    await press(view, 'sale-open-barcode-scanner');
    await press(view, 'mock-camera-detection');
    expect(view.getByTestId(`sale-line-quantity-${MASQUE_ID}`).props.children).toBe(2);
    expect(view.getAllByTestId(/^sale-line-[^-]+$/)).toHaveLength(1);
    expect(view.queryByTestId('sale-scan-result')).toBeNull();
  });

  it('refuses a scanned inactive Product', async () => {
    mockScannedBarcode = '30163508';
    const view = await renderSale();
    await press(view, 'stock-concentrate-3');
    await press(view, 'deactivate-concentrate');

    await press(view, 'sale-open-barcode-scanner');
    await press(view, 'mock-camera-detection');

    expect(within(view.getByTestId('sale-scan-result')).getByText('Ce produit est inactif.')).toBeTruthy();
    expect(view.queryByTestId(`sale-line-${CONCENTRATE_ID}`)).toBeNull();
  });

  it('shows a clean not-found result for an unknown barcode without offering creation', async () => {
    mockScannedBarcode = '0001234567890';
    const view = await renderSale();

    await press(view, 'sale-open-barcode-scanner');
    await press(view, 'mock-camera-detection');

    const result = within(view.getByTestId('sale-scan-result'));
    expect(result.getByText('Produit introuvable')).toBeTruthy();
    expect(result.getByText('0001234567890')).toBeTruthy();
    expect(result.queryByText('Ajouter un produit')).toBeNull();

    await act(async () => fireEvent.press(result.getByText('Fermer')));
    await settleSheetTransition();
    expect(view.queryByTestId('sale-scan-result')).toBeNull();
    expect(view.getByText('Aucun produit ajouté')).toBeTruthy();
  });

  it('asks which active Product to add when several share a barcode', async () => {
    mockScannedBarcode = '3474637152000';
    const view = await renderSale();
    await press(view, 'stock-masque-2');
    await press(view, 'add-duplicate-barcode');

    await press(view, 'sale-open-barcode-scanner');
    await press(view, 'mock-camera-detection');

    const result = within(view.getByTestId('sale-scan-result'));
    expect(result.getByText('Plusieurs produits trouvés')).toBeTruthy();
    await act(async () => fireEvent.press(result.getByText('Autre masque')));

    expect(view.getByTestId('sale-line-quantity-duplicate-barcode-product').props.children).toBe(1);
    expect(view.queryByTestId(`sale-line-${MASQUE_ID}`)).toBeNull();
  });

  it('presents the canonical sheet shell', async () => {
    const view = await renderSale();

    expect(view.getByText('VENTE')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Nouvelle vente' })).toBeTruthy();
    expect(view.getByLabelText('Annuler la vente')).toBeTruthy();
    expect(view.getByPlaceholderText('Rechercher un produit').props.autoFocus).toBeFalsy();
  });

  it('closes directly when the draft is empty', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await renderSale();

    await act(async () => fireEvent.press(view.getByLabelText('Annuler la vente')));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.queryByTestId('discard-sale-dialog')).toBeNull();
    alertSpy.mockRestore();
  });

  it('asks through the shared dialog before abandoning a draft with lines and mutates nothing', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const view = await renderSale();

    await press(view, 'stock-masque-2');
    await search(view, 'masque');
    await press(view, `sale-product-${MASQUE_ID}`);
    await act(async () => fireEvent.press(view.getByLabelText('Annuler la vente')));

    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId('discard-sale-dialog')).toBeTruthy();
    expect(view.getByText('Abandonner la vente ?')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    await press(view, 'keep-sale');
    expect(view.queryByTestId('discard-sale-dialog')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId(`sale-line-quantity-${MASQUE_ID}`).props.children).toBe(1);

    await act(async () => fireEvent.press(view.getByLabelText('Annuler la vente')));
    await press(view, 'discard-sale');
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('masque-stock').props.children).toBe(2);
    expect(view.getByTestId('sales-count').props.children).toBe(0);
    alertSpy.mockRestore();
  });

  it('never attaches an archived Client: no preselection from a stale route, never offered by the picker', async () => {
    const view = await renderSale('client-agenda-camille', createSeedWithArchivedCamille);

    expect(view.getByText('Aucune cliente')).toBeTruthy();
    expect(view.queryByText('Camille Durand')).toBeNull();

    await act(async () => fireEvent.press(view.getByLabelText('Choisir une cliente')));
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'Camille');
    });

    expect(view.queryByText('Camille Durand')).toBeNull();
    expect(view.getByText('Aucune cliente trouvée')).toBeTruthy();
  });
});

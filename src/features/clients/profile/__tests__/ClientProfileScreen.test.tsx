import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import type { Appointment, AppointmentItem } from '@/domain/appointments';
import type { Product } from '@/domain/products';
import type { SaleDraft } from '@/domain/sales';

import { createInitialClients } from '../../data/initial-clients';
import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '@/features/appointments/session/AppointmentSessionProvider';
import { formatPrice } from '@/features/appointments/presentation';
import {
  ProductCatalogProvider,
  useProductCatalog,
} from '@/features/products/session/ProductCatalogProvider';
import { SaleCreationScreen } from '@/features/sales/creation/SaleCreationScreen';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { ClientProfileScreen } from '../ClientProfileScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
}));

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    SymbolView: () => React.createElement(React.Fragment, null),
  };
});

jest.mock('@expo/ui/community/datetime-picker', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    DateTimePicker: () => React.createElement(View, null),
  };
});

jest.mock('expo-image', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { Image: (props: object) => React.createElement(View, props) };
});

jest.mock('@/shared/ui/BarcodeScannerModal', () => ({ BarcodeScannerModal: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const cancelledItem: AppointmentItem = {
  id: 'cancelled-item',
  serviceId: 'service-cut',
  order: 0,
  serviceName: 'Coupe',
  serviceType: 'SERVICE',
  price: 42,
  phases: [{ id: 'cancelled-phase', name: 'Coupe', durationMinutes: 30, requiresStaff: true }],
};

const cancelledAppointment: Appointment = {
  id: 'cancelled-test',
  businessId: 'fixture-business',
  clientId: 'client-agenda-sofia',
  staffMemberId: 'staff-amelie',
  startAt: new Date(2026, 6, 5, 10),
  status: 'CANCELLED',
  items: [cancelledItem],
  cancellation: {
    cancelledAt: new Date(2026, 6, 5, 11),
    cancelledBy: 'CLIENT',
  },
};

const businessCancelledAppointment: Appointment = {
  ...cancelledAppointment,
  id: 'business-cancelled-test',
  startAt: new Date(2026, 6, 6, 10),
  cancellation: {
    cancelledAt: new Date(2026, 6, 6, 11),
    cancelledBy: 'BUSINESS',
  },
};

const futureAppointment: Appointment = {
  id: 'future-test',
  businessId: 'fixture-business',
  clientId: 'client-agenda-sofia',
  staffMemberId: 'staff-amelie',
  startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
  status: 'SCHEDULED',
  items: [cancelledItem],
};

const shampoo: Product = {
  id: 'product-shampoo',
  businessId: 'fixture-business',
  name: 'Shampooing',
  price: 20,
  stockQuantity: 10,
  active: true,
};

const care: Product = {
  id: 'product-care',
  businessId: 'fixture-business',
  name: 'Soin',
  price: 18,
  stockQuantity: 10,
  active: true,
};

function saleDraft(id: string, day: number, lines: SaleDraft['lines'], clientId?: string): SaleDraft {
  return {
    id,
    businessId: 'fixture-business',
    clientId,
    completedAt: new Date(2026, 8, day, 10),
    lines,
  };
}

function SessionProbe() {
  const { clients, addClient } = useClientSession();
  const { addAppointment } = useAppointmentSession();
  const { addProduct, deleteProduct, getProductById, setProductStock, updateProduct } =
    useProductCatalog();
  const { completeSale } = useSaleSession();
  const lea = clients.find((client) => client.id === 'client-agenda-lea');

  return (
    <>
      <Text testID="session-lea-first-name">{lea?.firstName ?? ''}</Text>
      <Text testID="session-lea-id">{lea?.id ?? ''}</Text>
      <Pressable
        testID="add-birthday-client"
        onPress={() =>
          addClient({
            id: 'client-birthday',
            firstName: 'Félix',
            lastName: 'Rouge',
            phone: '06 11 22 33 44',
            birthDate: '1994-10-12',
          })
        }
      />
      <Pressable
        testID="add-cancelled-appointment"
        onPress={() => addAppointment({ appointment: cancelledAppointment })}
      />
      <Pressable
        testID="add-business-cancelled-appointment"
        onPress={() => addAppointment({ appointment: businessCancelledAppointment })}
      />
      <Pressable
        testID="add-future-appointment"
        onPress={() => addAppointment({ appointment: futureAppointment })}
      />
      <Pressable
        testID="seed-products"
        onPress={() => {
          addProduct(shampoo);
          addProduct(care);
        }}
      />
      <Pressable
        testID="sell-lea-1"
        onPress={() =>
          completeSale(
            saleDraft('sale-lea-1', 1, [{ id: 'sale-lea-1-item-1', productId: 'product-shampoo', quantity: 1 }], 'client-agenda-lea'),
          )
        }
      />
      <Pressable
        testID="sell-lea-2"
        onPress={() =>
          completeSale(
            saleDraft(
              'sale-lea-2',
              11,
              [
                { id: 'sale-lea-2-item-1', productId: 'product-shampoo', quantity: 1 },
                { id: 'sale-lea-2-item-2', productId: 'product-care', quantity: 2 },
              ],
              'client-agenda-lea',
            ),
          )
        }
      />
      <Pressable
        testID="sell-sofia"
        onPress={() =>
          completeSale(
            saleDraft('sale-sofia', 5, [{ id: 'sale-sofia-item-1', productId: 'product-care', quantity: 1 }], 'client-agenda-sofia'),
          )
        }
      />
      <Pressable
        testID="sell-walk-in"
        onPress={() =>
          completeSale(
            saleDraft('sale-walk-in', 6, [{ id: 'sale-walk-in-item-1', productId: 'product-care', quantity: 1 }]),
          )
        }
      />
      <Pressable
        testID="stock-masque-2"
        onPress={() => setProductStock('6974bff937a5d89c2d9afbd0', 2)}
      />
      <Pressable
        testID="rewrite-catalog"
        onPress={() => {
          const current = getProductById('product-shampoo');
          if (current) updateProduct({ ...current, name: 'Nouveau nom', price: 30 });
          deleteProduct('product-care');
        }}
      />
    </>
  );
}

function renderProfile(clientId: string, saleClientId?: string) {
  return render(
    <ClientSessionProvider>
      <ProductCatalogProvider>
        <SaleSessionProvider>
          <AppointmentSessionProvider>
            <ClientProfileScreen clientId={clientId} />
            {saleClientId !== undefined && <SaleCreationScreen initialClientId={saleClientId} />}
            <SessionProbe />
          </AppointmentSessionProvider>
        </SaleSessionProvider>
      </ProductCatalogProvider>
    </ClientSessionProvider>,
  );
}

const initialClients = createInitialClients();

async function seedSales(view: Awaited<ReturnType<typeof render>>) {
  for (const step of ['seed-products', 'sell-lea-1', 'sell-lea-2', 'sell-sofia', 'sell-walk-in']) {
    await act(async () => {
      fireEvent.press(view.getByTestId(step));
    });
  }
}

describe('ClientProfileScreen', () => {
  beforeAll(() => {
    // The Agenda fixtures are anchored on "today", so assertions about
    // upcoming vs historical rows depend on the time of day. Freeze the
    // clock at a fixed late-afternoon instant so the fixture day is always
    // in the past while the real-now-derived future appointment stays ahead.
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 26, 18, 0));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('shows a restrained not-found state for an unknown client id', async () => {
    const view = await renderProfile('client-missing');

    expect(view.getByText('Cliente introuvable')).toBeTruthy();
  });

  it('shows identity and Souris appointments for a fixture client', async () => {
    const view = await renderProfile('client-agenda-lea');

    expect(view.getByText('Léa Martin')).toBeTruthy();
    expect(view.getByText('Coloration')).toBeTruthy();
    expect(view.getByText(/09:00/)).toBeTruthy();
    expect(view.getByText('Rendez-vous réalisés')).toBeTruthy();
    expect(view.getByTestId('metric-completed').props.children).toBe('0');
    expect(view.getByTestId('metric-spent').props.children).toBe(formatPrice(0));
  });

  it('opens the existing Appointment Details from an appointment row', async () => {
    const view = await renderProfile('client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByText('Coloration'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/appointments/[appointmentId]',
      params: { appointmentId: 'agenda-lea' },
    });
  });

  it('navigates back through the native back control', async () => {
    const view = await renderProfile('client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByLabelText('Retour'));
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows contact information and a friendly French birthday when present', async () => {
    const view = await renderProfile('client-birthday');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-birthday-client'));
    });

    expect(view.getByText('Félix Rouge')).toBeTruthy();
    expect(view.getByText('06 11 22 33 44')).toBeTruthy();
    expect(view.getByText('12 octobre 1994')).toBeTruthy();
  });

  it('keeps the profile structure stable at zero: Activité with four zeros and the empty Rendez-vous state', async () => {
    const withoutAppointments = initialClients[0];

    const view = await renderProfile(withoutAppointments.id);

    expect(view.getByText('Activité')).toBeTruthy();
    expect(view.getByText('Rendez-vous réalisés')).toBeTruthy();
    expect(view.getByTestId('metric-completed').props.children).toBe('0');
    expect(view.getByTestId('metric-spent').props.children).toBe(formatPrice(0));
    expect(view.getByTestId('metric-noshow').props.children).toBe('0');
    expect(view.getByTestId('metric-cancelled').props.children).toBe('0');
    expect(view.getByText('Aucun rendez-vous enregistré.')).toBeTruthy();
    expect(view.getByText('Produits achetés')).toBeTruthy();
    expect(view.getByText('Aucun achat enregistré.')).toBeTruthy();
    expect(view.queryByText(/0 visite|panier moyen/)).toBeNull();
  });

  it('shows only the Client’s own completed purchases, newest first, from Sale snapshots', async () => {
    const view = await renderProfile('client-agenda-lea');

    await seedSales(view);

    const purchases = view.getByTestId('client-purchases');
    expect(purchases.props.children).toHaveLength(2);
    expect(view.getByTestId('client-sale-sale-lea-2')).toBeTruthy();
    expect(view.getByTestId('client-sale-sale-lea-1')).toBeTruthy();
    expect(view.queryByTestId('client-sale-sale-sofia')).toBeNull();
    expect(view.queryByTestId('client-sale-sale-walk-in')).toBeNull();

    const newest = within(view.getByTestId('client-sale-sale-lea-2'));
    expect(newest.getByText('11 sept. 2026')).toBeTruthy();
    expect(newest.getByText('Shampooing')).toBeTruthy();
    expect(newest.getByText('×1')).toBeTruthy();
    expect(newest.getByText('Soin')).toBeTruthy();
    expect(newest.getByText('×2')).toBeTruthy();
    expect(newest.getByText(formatPrice(36))).toBeTruthy();
    expect(newest.getByText(formatPrice(56))).toBeTruthy();

    // Product purchases never redefine the Appointment-derived KPI.
    expect(view.getByTestId('metric-spent').props.children).toBe(formatPrice(0));
  });

  it('keeps purchase history unchanged after Product edits and deletion', async () => {
    const view = await renderProfile('client-agenda-lea');

    await seedSales(view);
    await act(async () => {
      fireEvent.press(view.getByTestId('rewrite-catalog'));
    });

    const newest = within(view.getByTestId('client-sale-sale-lea-2'));
    expect(newest.getByText('Shampooing')).toBeTruthy();
    expect(newest.getByText('Soin')).toBeTruthy();
    expect(newest.getByText(formatPrice(56))).toBeTruthy();
    expect(view.queryByText('Nouveau nom')).toBeNull();
  });

  it('opens the Sale flow with this Client preselected from Vendre un produit', async () => {
    const view = await renderProfile('client-agenda-camille');

    await act(async () => {
      fireEvent.press(view.getByLabelText('Vendre un produit'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sales/new',
      params: { clientId: 'client-agenda-camille' },
    });
  });

  it('shows the completed Sale in Produits achetés after selling from the profile', async () => {
    // Simulates the pushed Sale screen opened with the profile Client.
    const view = await renderProfile('client-agenda-camille', 'client-agenda-camille');

    expect(within(view.getByTestId('sale-client')).getByText('Camille Durand')).toBeTruthy();
    expect(view.getByText('Aucun achat enregistré.')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('stock-masque-2')));
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un produit'), 'masque');
    });
    await act(async () => fireEvent.press(view.getByTestId('sale-product-6974bff937a5d89c2d9afbd0')));
    await act(async () => fireEvent.press(view.getByTestId('validate-sale')));

    expect(mockBack).toHaveBeenCalledTimes(1);
    const purchases = within(view.getByTestId('client-purchases'));
    expect(purchases.getByText('Masque réparateur 5 min')).toBeTruthy();
    // Line total and Sale total are both 50 € for a single-unit Sale.
    expect(purchases.getAllByText(formatPrice(50))).toHaveLength(2);
    expect(view.queryByText('Aucun achat enregistré.')).toBeNull();
  });

  it('shows no purchases on a Client without Sales even when other Sales exist', async () => {
    const view = await renderProfile('client-agenda-camille');

    await seedSales(view);

    expect(view.getByText('Aucun achat enregistré.')).toBeTruthy();
    expect(view.queryByTestId('client-purchases')).toBeNull();
  });

  it('keeps both cancellation actors visible while counting only the client cancellation', async () => {
    const view = await renderProfile('client-agenda-sofia');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-cancelled-appointment'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('add-business-cancelled-appointment'));
    });

    expect(view.getByText(/Annulé par la cliente/)).toBeTruthy();
    expect(view.getByText(/Annulé par le salon/)).toBeTruthy();
    expect(view.getByTestId('metric-cancelled').props.children).toBe('1');
  });

  it('shows the next appointment when a future appointment exists', async () => {
    const view = await renderProfile('client-agenda-sofia');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-future-appointment'));
    });

    expect(view.getByText('Prochain rendez-vous')).toBeTruthy();
    expect(view.getAllByText('Coupe')).toHaveLength(2);
  });

  it('opens the shared edit form prefilled and saves the updated identity', async () => {
    const view = await renderProfile('client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-client'));
    });

    expect(view.getByText('Modifier la cliente')).toBeTruthy();
    expect(view.getByDisplayValue('Léa')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prénom'), 'Léana');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom'), 'Martineau');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Enregistrer les modifications'));
    });

    expect(view.getByText('Léana Martineau')).toBeTruthy();
    expect(view.getByTestId('session-lea-first-name').props.children).toBe('Léana');
    expect(view.getByTestId('session-lea-id').props.children).toBe('client-agenda-lea');
  });

  it('discards edit changes on close', async () => {
    const view = await renderProfile('client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByTestId('edit-client'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prénom'), 'Léana');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Fermer'));
    });

    expect(view.getByText('Léa Martin')).toBeTruthy();
    expect(view.queryByText('Léana')).toBeNull();
  });
});

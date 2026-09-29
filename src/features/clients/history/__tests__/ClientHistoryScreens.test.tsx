import { act, fireEvent, render, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import type { Appointment } from '@/domain/appointments';
import { getClientDisplayName } from '@/domain/clients';
import type { Product } from '@/domain/products';
import type { SaleDraft } from '@/domain/sales';
import {
  AppointmentSessionProvider,
  useAppointmentSession,
} from '@/features/appointments/session/AppointmentSessionProvider';
import { formatPrice } from '@/features/appointments/presentation';
import { createInitialClients } from '@/features/clients/data/initial-clients';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import {
  ProductCatalogProvider,
  useProductCatalog,
} from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider, useSaleSession } from '@/features/sales/session/SaleSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { ClientAppointmentHistoryScreen } from '../ClientAppointmentHistoryScreen';
import { ClientPurchaseHistoryScreen } from '../ClientPurchaseHistoryScreen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const client = createInitialClients()[1];
const now = new Date(2026, 7, 26, 18, 0);

function appointment(id: string, startAt: Date, serviceName: string): Appointment {
  return {
    id,
    businessId: 'fixture-business',
    clientId: client.id,
    staffMemberId: 'staff-amelie',
    startAt,
    status: 'SCHEDULED',
    items: [
      {
        id: `${id}-item`,
        serviceId: 'service-cut',
        order: 0,
        serviceName,
        serviceType: 'SERVICE',
        price: 30,
        phases: [
          {
            id: `${id}-phase`,
            name: serviceName,
            durationMinutes: 30,
            requiresStaff: true,
          },
        ],
      },
    ],
  };
}

const history: readonly Appointment[] = [
  appointment('past-1', new Date(2026, 6, 1, 10), 'Coupe juillet'),
  appointment('past-2', new Date(2026, 7, 1, 10), 'Coupe août'),
  appointment('future-1', new Date(2026, 8, 10, 9), 'Balayage septembre'),
];

const products: readonly Product[] = [
  {
    id: 'p-shampoo',
    businessId: 'fixture-business',
    name: 'Shampooing',
    price: 20,
    stockQuantity: 10,
    active: true,
  },
  {
    id: 'p-care',
    businessId: 'fixture-business',
    name: 'Soin',
    price: 18,
    stockQuantity: 10,
    active: true,
  },
];

function saleDraft(id: string, day: number, lines: SaleDraft['lines']): SaleDraft {
  return {
    id,
    businessId: 'fixture-business',
    clientId: client.id,
    completedAt: new Date(2026, 8, day, 10),
    lines,
  };
}

function Seed() {
  const { addAppointment } = useAppointmentSession();
  const { addProduct } = useProductCatalog();
  const { completeSale } = useSaleSession();

  // Products first: a Sale reads the catalog of the render that completes it.
  return (
    <>
      <Pressable
        testID="seed-products"
        onPress={() => {
          for (const product of products) addProduct(product);
        }}
      />
      <Pressable
        testID="seed"
        onPress={() => {
          for (const entry of history) addAppointment({ appointment: entry });
          completeSale(
            saleDraft('sale-a', 2, [{ id: 'sale-a-1', productId: 'p-shampoo', quantity: 1 }]),
          );
          completeSale(
            saleDraft('sale-b', 9, [
              { id: 'sale-b-1', productId: 'p-shampoo', quantity: 1 },
              { id: 'sale-b-2', productId: 'p-care', quantity: 2 },
            ]),
          );
        }}
      />
    </>
  );
}

async function renderSeeded(screen: ReactNode) {
  const view = await render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <ProductCatalogProvider>
          <SaleSessionProvider>
            <AppointmentSessionProvider>
              {screen}
              <Seed />
            </AppointmentSessionProvider>
          </SaleSessionProvider>
        </ProductCatalogProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
  for (const step of ['seed-products', 'seed']) {
    await act(async () => {
      fireEvent.press(view.getByTestId(step));
    });
  }
  return view;
}

describe('Client history screens', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
  });

  describe('ClientAppointmentHistoryScreen', () => {
    it('lists every appointment of the client, upcoming first, with the client as context', async () => {
      const view = await renderSeeded(<ClientAppointmentHistoryScreen clientId={client.id} />);

      expect(view.getByText('Rendez-vous')).toBeTruthy();
      expect(view.getByText(getClientDisplayName(client))).toBeTruthy();
      expect(view.getByTestId('appointment-history-filter-all').props.accessibilityState).toEqual({
        selected: true,
      });
      expect(view.getByText('À VENIR')).toBeTruthy();
      expect(view.getByText('PASSÉS')).toBeTruthy();
      const list = within(view.getByTestId('client-appointment-history'));
      expect(list.getByText('Balayage septembre')).toBeTruthy();
      expect(list.getByText('Coupe août')).toBeTruthy();
      expect(list.getByText('Coupe juillet')).toBeTruthy();
      expect(list.getAllByText(formatPrice(30))).toHaveLength(3);
    });

    it('filters on À venir and Passés from the existing upcoming / history split', async () => {
      const view = await renderSeeded(<ClientAppointmentHistoryScreen clientId={client.id} />);

      await act(async () => {
        fireEvent.press(view.getByTestId('appointment-history-filter-upcoming'));
      });
      expect(view.getByText('Balayage septembre')).toBeTruthy();
      expect(view.queryByText('Coupe août')).toBeNull();
      expect(view.queryByText('À VENIR')).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('appointment-history-filter-past'));
      });
      expect(view.queryByText('Balayage septembre')).toBeNull();
      expect(view.getByText('Coupe août')).toBeTruthy();
      expect(view.getByText('Coupe juillet')).toBeTruthy();
    });

    it('opens the existing Appointment Details from any row', async () => {
      const view = await renderSeeded(<ClientAppointmentHistoryScreen clientId={client.id} />);

      await act(async () => {
        fireEvent.press(view.getByTestId('client-appointment-past-1'));
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/appointments/[appointmentId]',
        params: { appointmentId: 'past-1' },
      });
    });

    it('goes back through the glass back button', async () => {
      const view = await renderSeeded(<ClientAppointmentHistoryScreen clientId={client.id} />);

      await act(async () => {
        fireEvent.press(view.getByLabelText('Retour'));
      });

      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('shows a restrained not-found state for an unknown client', async () => {
      const view = await renderSeeded(<ClientAppointmentHistoryScreen clientId="client-missing" />);

      expect(view.getByText('Client introuvable')).toBeTruthy();
    });
  });

  describe('ClientPurchaseHistoryScreen', () => {
    it('lists every Sale of the client newest first and spells out multi-product Sales', async () => {
      const view = await renderSeeded(<ClientPurchaseHistoryScreen clientId={client.id} />);

      expect(view.getByText('Produits achetés')).toBeTruthy();
      const newest = within(view.getByTestId('client-sale-sale-b'));
      expect(newest.getByText('Shampooing + Soin')).toBeTruthy();
      expect(newest.getByText('9 sept. 2026 · 3 produits')).toBeTruthy();
      expect(newest.getByText('Shampooing ×1')).toBeTruthy();
      expect(newest.getByText('Soin ×2')).toBeTruthy();
      expect(newest.getByText(formatPrice(36))).toBeTruthy();
      expect(newest.getByText(formatPrice(56))).toBeTruthy();

      const oldest = within(view.getByTestId('client-sale-sale-a'));
      expect(oldest.getByText('Shampooing')).toBeTruthy();
      expect(oldest.getByText('2 sept. 2026 · ×1')).toBeTruthy();
      // A single-line Sale has no repeated line.
      expect(oldest.queryByText('Shampooing ×1')).toBeNull();
      // No Sale detail exists: the rows stay read-only.
      expect(view.getByTestId('client-sale-sale-a').props.accessibilityRole).toBeUndefined();
    });
  });
});

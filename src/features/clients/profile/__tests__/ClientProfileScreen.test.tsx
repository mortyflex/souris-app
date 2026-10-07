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
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { settleSheetTransition } from '@/shared/ui/testing/sheet-transitions';
import { rose, semanticColors } from '@/shared/ui/theme';

const mockPush = jest.fn();
const mockBack = jest.fn();
const selectionHaptic = jest.spyOn(haptics, 'selection').mockImplementation();
const successHaptic = jest.spyOn(haptics, 'success').mockImplementation();
const warningHaptic = jest.spyOn(haptics, 'warning').mockImplementation();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  // The Sale sheet is a content-fit route: its shell reads the navigation.
  useNavigation: () => ({ dispatch: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: jest.fn(),
}));

// The preset Modal mock never reports dismissal; this one mirrors the iOS
// contract (onDismiss once `visible` has dropped), so the « ••• » action list
// chains its action exactly as on device.
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

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
      return this.props.visible ? React.createElement(View, null, this.props.children) : null;
    }
  }

  return { __esModule: true, default: MockModal };
});

// Inspectable stand-in: each glyph renders as a View tagged with its iOS name.
jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SymbolView: ({ name }: { readonly name: string | { readonly ios?: string } }) =>
      React.createElement(View, { testID: `symbol-${typeof name === 'string' ? name : name.ios}` }),
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

const LONG_HISTORY_CLIENT_ID = createInitialClients()[1].id;

/** Five past appointments of one client, 1st → 5th July 2026 at 10:00. */
const longHistoryAppointments: readonly Appointment[] = [1, 2, 3, 4, 5].map((day) => ({
  id: `long-${day}`,
  businessId: 'fixture-business',
  clientId: LONG_HISTORY_CLIENT_ID,
  staffMemberId: 'staff-amelie',
  startAt: new Date(2026, 6, day, 10),
  status: 'COMPLETED',
  items: [{ ...cancelledItem, id: `long-item-${day}`, serviceName: `Brushing ${day}` }],
}));

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
  const { clients, activeClients, addClient } = useClientSession();
  const { addAppointment, appointments } = useAppointmentSession();
  const { addProduct, deleteProduct, getProductById, setProductStock, updateProduct } =
    useProductCatalog();
  const { completeSale, sales } = useSaleSession();
  const lea = clients.find((client) => client.id === 'client-agenda-lea');

  return (
    <>
      <Text testID="session-lea-first-name">{lea?.firstName ?? ''}</Text>
      <Text testID="session-lea-id">{lea?.id ?? ''}</Text>
      <Text testID="session-client-count">{clients.length}</Text>
      <Text testID="session-appointment-count">{appointments.length}</Text>
      <Text testID="session-sale-count">{sales.length}</Text>
      <Text testID="session-active-count">{activeClients.length}</Text>
      <Text testID="session-lea-archived">{String(lea?.archivedAt !== undefined)}</Text>
      <Pressable
        testID="add-birthday-client"
        onPress={() =>
          addClient({
            id: 'client-birthday',
            firstName: 'Félix',
            lastName: 'Rouge',
            phone: '06 11 22 33 44',
            birthday: { month: 10, day: 12 },
          })
        }
      />
      <Pressable
        testID="add-consent-client"
        onPress={() =>
          addClient({
            id: 'client-consent',
            firstName: 'Prisca',
            phone: '06 99 88 77 66',
            smsMarketingConsent: {
              status: 'OPTED_OUT',
              updatedAt: new Date('2026-09-27T10:00:00.000Z'),
              source: 'PROFESSIONAL',
            },
          })
        }
      />
      <Pressable
        testID="add-notes-client"
        onPress={() =>
          addClient({
            id: 'client-notes',
            firstName: 'Nour',
            notes: 'Allergie au PPD.\n\nPréfère le matin\n— cuir chevelu sensible',
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
        testID="add-long-history"
        onPress={() => {
          for (const appointment of longHistoryAppointments) addAppointment({ appointment });
          for (const day of [1, 2, 3, 4, 5]) {
            completeSale(
              saleDraft(
                `sale-long-${day}`,
                day,
                [{ id: `sale-long-${day}-item`, productId: 'product-shampoo', quantity: 1 }],
                LONG_HISTORY_CLIENT_ID,
              ),
            );
          }
        }}
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
        testID="sell-first-legacy"
        onPress={() =>
          completeSale(
            saleDraft('sale-legacy', 7, [{ id: 'sale-legacy-item-1', productId: 'product-care', quantity: 1 }], initialClients[0].id),
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
    <TestPersistenceProvider>
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
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

const initialClients = createInitialClients();

async function showPurchases(view: Awaited<ReturnType<typeof render>>) {
  await act(async () => {
    fireEvent.press(view.getByTestId('client-history-tab-purchases'));
  });
}

/** Opens « ••• », chooses one action and lets the list close so the action runs. */
async function chooseClientAction(view: Awaited<ReturnType<typeof render>>, testID: string) {
  await openClientActions(view);
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
  await settleSheetTransition();
}

/** « ••• » › Archiver le client, then « Archiver » in the confirmation. */
async function archiveThroughConfirmation(view: Awaited<ReturnType<typeof render>>) {
  await chooseClientAction(view, 'archive-client');
  await act(async () => {
    fireEvent.press(view.getByTestId('confirm-client-archive'));
  });
}

async function openClientActions(view: Awaited<ReturnType<typeof render>>) {
  await act(async () => {
    fireEvent.press(view.getByTestId('open-client-actions'));
  });
  await settleSheetTransition();
}

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
    selectionHaptic.mockClear();
    successHaptic.mockClear();
    warningHaptic.mockClear();
  });

  it('shows a restrained not-found state for an unknown client id', async () => {
    const view = await renderProfile('client-missing');

    expect(view.getByText('Client introuvable')).toBeTruthy();
  });

  it('shows identity and BeautIzzy appointments for a fixture client', async () => {
    const view = await renderProfile('client-agenda-lea');

    expect(view.getByText('Léa Martin')).toBeTruthy();
    expect(view.getByText('Coloration')).toBeTruthy();
    expect(view.getByText(/09:00/)).toBeTruthy();
    expect(view.getByText('Réalisés')).toBeTruthy();
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

  describe('header, identity and actions', () => {
    it('shows « ••• » in the header instead of Modifier, around the centred Fiche client title', async () => {
      const view = await renderProfile('client-agenda-lea');

      expect(view.getByRole('header', { name: 'Fiche client' })).toBeTruthy();
      expect(view.getByLabelText('Retour')).toBeTruthy();
      const more = view.getByTestId('open-client-actions');
      expect(more.props.accessibilityLabel).toBe('Actions');
      expect(within(more).getByTestId('symbol-ellipsis')).toBeTruthy();
      expect(view.queryByText('Modifier')).toBeNull();
      expect(view.queryByLabelText('Modifier le client')).toBeNull();
    });

    it('lists Modifier then the rose Archiver le client in the « ••• » drawer, titled by the Client', async () => {
      const view = await renderProfile('client-agenda-lea');
      expect(view.queryByTestId('client-actions-sheet')).toBeNull();

      await openClientActions(view);

      const sheet = within(view.getByTestId('client-actions-sheet'));
      expect(sheet.getByRole('header', { name: 'Léa Martin' })).toBeTruthy();
      expect(sheet.getByRole('button', { name: 'Modifier' })).toBeTruthy();
      expect(sheet.getByRole('button', { name: 'Archiver le client' })).toBeTruthy();
      expect(within(sheet.getByTestId('archive-client')).getByTestId('symbol-archivebox')).toBeTruthy();
      // Only opening the list: nothing was archived, no feedback given.
      expect(view.getByTestId('session-lea-archived').props.children).toBe('false');
      expect(selectionHaptic).not.toHaveBeenCalled();
    });

    it('renders the 80 pt rounded portrait frame with the Client initials, inside ONE photo button spoken with her name', async () => {
      const view = await renderProfile('client-agenda-lea');

      const avatar = view.getByTestId('client-avatar');
      // A softly rounded square, not a small disc: room for a real portrait.
      expect(avatar).toHaveStyle({ borderRadius: 20, height: 80, width: 80 });
      expect(view.getByTestId('client-avatar-initials')).toHaveTextContent('LM');
      expect(view.queryByTestId('client-avatar-photo')).toBeNull();
      // The frame is the photo control (Client photos): one element, named after her.
      const button = view.getByTestId('client-photo-button');
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe('Ajouter une photo pour Léa Martin');
      expect(avatar.props.accessible).toBe(false);
      expect(within(view.getByTestId('client-photo-badge')).getByTestId('symbol-camera.fill')).toBeTruthy();
    });

    it('centres the portrait over the name in the identity block', async () => {
      const view = await renderProfile('client-agenda-lea');

      const identity = view.getByTestId('client-identity');
      expect(identity).toHaveStyle({ alignItems: 'center' });
      expect(identity).not.toHaveStyle({ flexDirection: 'row' });
      expect(within(identity).getByTestId('client-avatar')).toBeTruthy();
      const name = within(identity).getByRole('header', { name: 'Léa Martin' });
      expect(name).toHaveStyle({ textAlign: 'center' });
      // A long name wraps on two lines at a fixed size: never shrunk.
      expect(name.props.numberOfLines).toBe(2);
      expect(name.props.adjustsFontSizeToFit).toBeUndefined();
    });

    it('shows the phone and the email once, in the identity block, and nothing for a missing one', async () => {
      const view = await renderProfile('client-birthday');
      await act(async () => {
        fireEvent.press(view.getByTestId('add-birthday-client'));
      });

      const identity = within(view.getByTestId('client-identity'));
      expect(identity.getByTestId('client-phone')).toHaveTextContent('06 11 22 33 44');
      expect(view.getAllByText('06 11 22 33 44')).toHaveLength(1);
      expect(view.queryByText('Téléphone')).toBeNull();
      expect(view.queryByTestId('client-email')).toBeNull();
    });

    it('lays Nouveau rendez-vous then Vendre un produit as two equal white tiles of ONE row, above Activité', async () => {
      const view = await renderProfile('client-agenda-lea');

      const row = view.getByTestId('client-daily-actions');
      expect(row).toHaveStyle({ flexDirection: 'row' });
      const card = within(row);
      const newAppointment = card.getByTestId('new-appointment');
      const sell = card.getByTestId('sell-product');
      expect(newAppointment.props.accessibilityLabel).toBe('Nouveau rendez-vous');
      expect(within(newAppointment).getByTestId('symbol-calendar.badge.plus')).toBeTruthy();
      expect(sell.props.accessibilityLabel).toBe('Vendre un produit');
      // White tiles sharing the row equally, never a coloured CTA.
      for (const tile of [newAppointment, sell]) {
        expect(tile).toHaveStyle({ backgroundColor: semanticColors.surfaceElevated, flex: 1 });
      }
      // Navy labels, same weight for both: no primary / secondary pair.
      for (const label of ['Nouveau rendez-vous', 'Vendre un produit']) {
        expect(card.getByText(label)).toHaveStyle({ color: semanticColors.foreground });
      }
      const ordered = view.getAllByText(/^(Nouveau rendez-vous|Vendre un produit|Activité)$/);
      expect(ordered.map((node) => node.props.children)).toEqual([
        'Nouveau rendez-vous',
        'Vendre un produit',
        'Activité',
      ]);
    });

    it('opens the existing appointment creation with this Client preselected, creating nothing', async () => {
      const view = await renderProfile('client-agenda-camille');
      const before = view.getByTestId('session-appointment-count').props.children;

      await act(async () => {
        fireEvent.press(view.getByLabelText('Nouveau rendez-vous'));
      });

      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/appointments/new',
        params: { clientId: 'client-agenda-camille' },
      });
      expect(view.getByTestId('session-appointment-count').props.children).toBe(before);
    });
  });

  it('shows contact information and a day + month birthday, never a year', async () => {
    const view = await renderProfile('client-birthday');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-birthday-client'));
    });

    expect(view.getByText('Félix Rouge')).toBeTruthy();
    expect(view.getByText('06 11 22 33 44')).toBeTruthy();
    expect(view.getByText('12 octobre')).toBeTruthy();
    expect(view.queryByText(/1994/)).toBeNull();
    expect(view.getByText('Anniversaire')).toBeTruthy();
    // The same cake glyph as the directory row marks the birthday.
    expect(view.getAllByTestId('symbol-birthday.cake')).toHaveLength(1);
  });

  it('marks Vendre un produit with the Revente bag glyph, and shows no cake without a birthday', async () => {
    const view = await renderProfile('client-agenda-lea');

    expect(within(view.getByTestId('sell-product')).getByTestId('symbol-bag.fill')).toBeTruthy();
    expect(within(view.getByTestId('sell-product')).getByText('Vendre un produit')).toBeTruthy();
    expect(view.queryByTestId('symbol-birthday.cake')).toBeNull();
  });

  it('shows the Notes section with every line break preserved', async () => {
    const view = await renderProfile('client-notes');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-notes-client'));
    });

    const section = view.getByTestId('client-notes-section');
    expect(within(section).getByText('Notes')).toBeTruthy();
    const notes = view.getByTestId('client-notes');
    expect(notes.props.children).toBe('Allergie au PPD.\n\nPréfère le matin\n— cuir chevelu sensible');
    // Never truncated: the professional must be able to read the whole note.
    expect(notes.props.numberOfLines).toBeUndefined();
  });

  it('shows the recorded SMS promotional consent, and no row while it stays « Non renseigné »', async () => {
    const view = await renderProfile('client-consent');

    await act(async () => {
      fireEvent.press(view.getByTestId('add-consent-client'));
    });

    expect(view.getByText('SMS promotionnels')).toBeTruthy();
    expect(view.getByText('Refusés')).toBeTruthy();
  });

  it('renders no Notes section — no empty card, no placeholder — for a Client without notes', async () => {
    const view = await renderProfile('client-agenda-lea');

    expect(view.getByText('Léa Martin')).toBeTruthy();
    expect(view.queryByTestId('client-notes-section')).toBeNull();
    expect(view.queryByText('Notes')).toBeNull();
    // UNKNOWN consent shows nothing: the choice lives in the edit form.
    expect(view.queryByText('SMS promotionnels')).toBeNull();
  });

  it('edits the notes from the profile: pre-filled, saved, shown, then cleared', async () => {
    const view = await renderProfile('client-notes');
    await act(async () => {
      fireEvent.press(view.getByTestId('add-notes-client'));
    });

    await chooseClientAction(view, 'edit-client');
    expect(view.getByTestId('client-notes-input').props.value).toBe(
      'Allergie au PPD.\n\nPréfère le matin\n— cuir chevelu sensible',
    );
    await act(async () => {
      fireEvent.changeText(view.getByTestId('client-notes-input'), 'Allergie au PPD.\nCafé sans sucre');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Enregistrer les modifications'));
    });
    expect(view.getByTestId('client-notes').props.children).toBe('Allergie au PPD.\nCafé sans sucre');

    await chooseClientAction(view, 'edit-client');
    await act(async () => {
      fireEvent.changeText(view.getByTestId('client-notes-input'), '');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Enregistrer les modifications'));
    });
    expect(view.queryByTestId('client-notes-section')).toBeNull();
  });

  it('keeps the profile structure stable at zero: Activité with four zeros and the empty Rendez-vous state', async () => {
    const withoutAppointments = initialClients[0];

    const view = await renderProfile(withoutAppointments.id);

    expect(view.getByText('Activité')).toBeTruthy();
    // Short visible labels, the full name spoken.
    for (const label of ['Réalisés', 'Total dépensé', 'Absences', 'Annulations']) {
      expect(view.getByText(label)).toBeTruthy();
    }
    expect(view.getByLabelText('Rendez-vous réalisés, 0')).toBeTruthy();
    expect(view.getByTestId('metric-completed').props.children).toBe('0');
    expect(view.getByTestId('metric-spent').props.children).toBe(formatPrice(0));
    expect(view.getByTestId('metric-noshow').props.children).toBe('0');
    expect(view.getByTestId('metric-cancelled').props.children).toBe('0');
    expect(view.getByText('Aucun rendez-vous enregistré.')).toBeTruthy();
    expect(view.getByTestId('client-history-tab-appointments-count').props.children).toBe('0');
    expect(view.getByTestId('client-history-tab-purchases-count').props.children).toBe('0');
    expect(view.queryByTestId('open-client-appointment-history')).toBeNull();

    await showPurchases(view);
    expect(view.getByText('Aucun achat enregistré.')).toBeTruthy();
    expect(view.queryByText('Aucun rendez-vous enregistré.')).toBeNull();
    expect(view.queryByTestId('open-client-purchase-history')).toBeNull();
    expect(view.queryByText(/0 visite|panier moyen/)).toBeNull();
  });

  it('shows only the Client’s own completed purchases, newest first, from Sale snapshots', async () => {
    const view = await renderProfile('client-agenda-lea');

    await seedSales(view);
    expect(view.getByTestId('client-history-tab-purchases-count').props.children).toBe('2');
    await showPurchases(view);

    const purchases = within(view.getByTestId('client-purchases'));
    expect(purchases.getByTestId('client-sale-sale-lea-2')).toBeTruthy();
    expect(purchases.getByTestId('client-sale-sale-lea-1')).toBeTruthy();
    expect(view.queryByTestId('client-sale-sale-sofia')).toBeNull();
    expect(view.queryByTestId('client-sale-sale-walk-in')).toBeNull();

    const newest = within(view.getByTestId('client-sale-sale-lea-2'));
    expect(newest.getByText('Shampooing + Soin')).toBeTruthy();
    expect(newest.getByText('11 sept. 2026 · 3 produits')).toBeTruthy();
    expect(newest.getByText(formatPrice(56))).toBeTruthy();
    const oldest = within(view.getByTestId('client-sale-sale-lea-1'));
    expect(oldest.getByText('Shampooing')).toBeTruthy();
    expect(oldest.getByText('1 sept. 2026 · ×1')).toBeTruthy();
    // All two purchases are already visible: no « Voir les … ».
    expect(view.queryByTestId('open-client-purchase-history')).toBeNull();

    // Product purchases never redefine the Appointment-derived KPI.
    expect(view.getByTestId('metric-spent').props.children).toBe(formatPrice(0));
  });

  it('keeps purchase history unchanged after Product edits and deletion', async () => {
    const view = await renderProfile('client-agenda-lea');

    await seedSales(view);
    await act(async () => {
      fireEvent.press(view.getByTestId('rewrite-catalog'));
    });
    await showPurchases(view);

    const newest = within(view.getByTestId('client-sale-sale-lea-2'));
    expect(newest.getByText('Shampooing + Soin')).toBeTruthy();
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

    // Opening the flow selects her and creates nothing: the draft starts empty.
    expect(view.getByTestId('session-sale-count').props.children).toBe(0);

    expect(within(view.getByTestId('sale-client')).getByText('Camille Durand')).toBeTruthy();
    await showPurchases(view);
    expect(view.getByText('Aucun achat enregistré.')).toBeTruthy();

    await act(async () => fireEvent.press(view.getByTestId('stock-masque-2')));
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un produit'), 'masque');
    });
    await act(async () => fireEvent.press(view.getByTestId('sale-product-6974bff937a5d89c2d9afbd0')));
    await act(async () => fireEvent.press(view.getByTestId('validate-sale')));
    // A Sale sold from the profile is standalone: its payment is recorded before it completes.
    expect(view.getByTestId('sale-payment-sheet')).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(view.getByTestId('checkout-amount-card'), '50');
    });
    await act(async () => fireEvent.press(view.getByTestId('confirm-checkout')));

    expect(mockBack).toHaveBeenCalledTimes(1);
    const purchases = within(view.getByTestId('client-purchases'));
    expect(purchases.getByText('Masque réparateur 5 min')).toBeTruthy();
    expect(purchases.getByText(formatPrice(50))).toBeTruthy();
    expect(view.getByTestId('client-history-tab-purchases-count').props.children).toBe('1');
    expect(view.queryByText('Aucun achat enregistré.')).toBeNull();
  });

  it('shows no purchases on a Client without Sales even when other Sales exist', async () => {
    const view = await renderProfile('client-agenda-camille');

    await seedSales(view);
    await showPurchases(view);

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

    expect(view.getByText(/Annulé par le client/)).toBeTruthy();
    expect(view.getByText(/Annulé par vous/)).toBeTruthy();
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

    await chooseClientAction(view, 'edit-client');

    expect(view.getByRole('header', { name: 'Modifier le client' })).toBeTruthy();
    expect(view.queryByText('CLIENT')).toBeNull();
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

    await chooseClientAction(view, 'edit-client');
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prénom'), 'Léana');
    });
    await act(async () => {
      fireEvent.press(view.getByLabelText('Annuler les modifications'));
    });

    expect(view.getByText('Léa Martin')).toBeTruthy();
    expect(view.queryByText('Léana')).toBeNull();
  });

  describe('lifecycle', () => {
    it('offers Archiver le client behind « ••• » on an active Client and no permanent deletion', async () => {
      const view = await renderProfile('client-agenda-lea');

      // Nothing administrative in the page itself: the old bottom action is gone.
      expect(view.queryByTestId('client-management')).toBeNull();
      expect(view.queryByTestId('archive-client')).toBeNull();
      expect(view.queryByText('Archiver le client')).toBeNull();
      expect(view.getByTestId('sell-product')).toBeTruthy();
      expect(view.getByTestId('new-appointment')).toBeTruthy();

      await openClientActions(view);
      const actions = within(view.getByTestId('client-actions-sheet'));
      expect(actions.getByText('Archiver le client')).toBeTruthy();
      expect(actions.getByTestId('archive-client').props.accessibilityHint).toBe(
        'Ce client ne sera plus proposé pour les nouveaux rendez-vous et ventes. Son historique est conservé.',
      );
      expect(actions.queryByTestId('open-client-deletion')).toBeNull();
      expect(view.queryByTestId('restore-client')).toBeNull();
      expect(view.queryByTestId('client-archived-indicator')).toBeNull();
    });

    it('asks before archiving: « Annuler » writes nothing, « Archiver » archives in the reversible accent tone', async () => {
      const view = await renderProfile('client-agenda-lea');
      const active = Number(view.getByTestId('session-active-count').props.children);

      await chooseClientAction(view, 'archive-client');

      // Nothing archived yet: the shared confirmation asks first.
      expect(view.getByTestId('session-lea-archived').props.children).toBe('false');
      expect(view.queryByTestId('client-archived-indicator')).toBeNull();
      const dialog = within(view.getByTestId('client-archive-dialog'));
      expect(view.getByTestId('client-archive-dialog').props.accessibilityViewIsModal).toBe(true);
      expect(dialog.getByText('ARCHIVAGE')).toHaveStyle({ color: semanticColors.accent });
      expect(dialog.getByRole('header', { name: 'Archiver ce client ?' })).toBeTruthy();
      expect(
        dialog.getByText(
          'Ce client restera dans votre répertoire mais sera déplacé dans les clients archivés. Vous pourrez le restaurer plus tard.',
        ),
      ).toBeTruthy();
      expect(dialog.getByRole('button', { name: 'Annuler' })).toBeTruthy();
      expect(dialog.getByRole('button', { name: 'Archiver' })).toBeTruthy();
      expect(dialog.queryByText('Retour')).toBeNull();
      // Reversible: the accent primary, never the rose destructive confirm.
      expect(view.getByTestId('confirm-client-archive')).toHaveStyle({
        backgroundColor: semanticColors.accent,
      });

      await act(async () => {
        fireEvent.press(view.getByTestId('cancel-client-archive'));
      });
      expect(view.queryByTestId('client-archive-dialog')).toBeNull();
      expect(view.getByTestId('session-lea-archived').props.children).toBe('false');
      expect(Number(view.getByTestId('session-active-count').props.children)).toBe(active);
      expect(view.getByTestId('new-appointment')).toBeTruthy();
      expect(selectionHaptic).not.toHaveBeenCalled();

      await archiveThroughConfirmation(view);
      expect(view.queryByTestId('client-archive-dialog')).toBeNull();
      expect(view.getByTestId('session-lea-archived').props.children).toBe('true');
      expect(Number(view.getByTestId('session-active-count').props.children)).toBe(active - 1);
      expect(view.getByTestId('client-archived-indicator')).toBeTruthy();
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('archives with restrained feedback, keeps history, hides new business actions, and restores', async () => {
      const view = await renderProfile('client-agenda-lea');
      await seedSales(view);
      const total = Number(view.getByTestId('session-client-count').props.children);
      const active = Number(view.getByTestId('session-active-count').props.children);

      await archiveThroughConfirmation(view);

      expect(selectionHaptic).toHaveBeenCalledTimes(1);
      expect(view.getByTestId('client-archived-indicator')).toBeTruthy();
      expect(view.getByText('Archivé')).toBeTruthy();
      expect(view.getByText('Léa Martin')).toBeTruthy();
      expect(view.getByTestId('restore-client')).toBeTruthy();
      expect(view.queryByTestId('sell-product')).toBeNull();
      expect(view.queryByLabelText('Vendre un produit')).toBeNull();
      expect(view.queryByTestId('new-appointment')).toBeNull();
      expect(view.queryByLabelText('Nouveau rendez-vous')).toBeNull();
      await openClientActions(view);
      const archivedActions = within(view.getByTestId('client-actions-sheet'));
      expect(archivedActions.queryByTestId('archive-client')).toBeNull();
      expect(archivedActions.getByTestId('edit-client')).toBeTruthy();
      expect(archivedActions.getByTestId('open-client-deletion')).toBeTruthy();
      expect(archivedActions.getByText('Supprimer définitivement')).toBeTruthy();
      await act(async () => {
        fireEvent.press(view.getByLabelText('Fermer les actions'));
      });
      await settleSheetTransition();
      expect(view.queryByTestId('client-actions-sheet')).toBeNull();
      // History and metrics are untouched.
      expect(view.getByText('Coloration')).toBeTruthy();
      await showPurchases(view);
      expect(view.getByTestId('client-sale-sale-lea-2')).toBeTruthy();
      expect(view.getByTestId('client-sale-sale-lea-1')).toBeTruthy();
      expect(view.getByTestId('metric-completed').props.children).toBe('0');
      expect(view.getByTestId('session-lea-archived').props.children).toBe('true');
      expect(Number(view.getByTestId('session-client-count').props.children)).toBe(total);
      expect(Number(view.getByTestId('session-active-count').props.children)).toBe(active - 1);

      await act(async () => {
        fireEvent.press(view.getByTestId('restore-client'));
      });

      expect(successHaptic).toHaveBeenCalledTimes(1);
      expect(view.queryByTestId('client-archived-indicator')).toBeNull();
      expect(view.getByTestId('sell-product')).toBeTruthy();
      expect(view.getByTestId('new-appointment')).toBeTruthy();
      await openClientActions(view);
      expect(view.getByTestId('archive-client')).toBeTruthy();
      expect(view.queryByTestId('open-client-deletion')).toBeNull();
      expect(view.getByTestId('session-lea-archived').props.children).toBe('false');
      expect(Number(view.getByTestId('session-active-count').props.children)).toBe(active);
    });

    it('keeps the archived state through an identity edit', async () => {
      const view = await renderProfile('client-agenda-lea');

      await archiveThroughConfirmation(view);
      await chooseClientAction(view, 'edit-client');
      await act(async () => {
        fireEvent.changeText(view.getByLabelText('Prénom'), 'Léana');
      });
      await act(async () => {
        fireEvent.press(view.getByText('Enregistrer les modifications'));
      });

      expect(view.getByText('Léana Martin')).toBeTruthy();
      expect(view.getByTestId('client-archived-indicator')).toBeTruthy();
      expect(view.getByTestId('session-lea-archived').props.children).toBe('true');
    });

    it('permanently deletes an archived Client without history after an explicit confirmation', async () => {
      const disposable = initialClients[0];
      const view = await renderProfile(disposable.id);
      const total = Number(view.getByTestId('session-client-count').props.children);

      await archiveThroughConfirmation(view);
      await chooseClientAction(view, 'open-client-deletion');

      expect(view.getByTestId('client-deletion-dialog')).toBeTruthy();
      expect(view.getByText('Supprimer définitivement ce client ?')).toBeTruthy();
      expect(view.getByText('Cette action est irréversible.')).toBeTruthy();
      expect(view.queryByTestId('client-deletion-blocked')).toBeNull();
      // Irreversible: « Annuler » to abort, the rose destructive « Supprimer ».
      const deletion = within(view.getByTestId('client-deletion-dialog'));
      expect(deletion.getByRole('button', { name: 'Annuler' })).toBeTruthy();
      expect(deletion.queryByText('Retour')).toBeNull();
      expect(view.getByTestId('confirm-client-deletion')).toHaveStyle({ backgroundColor: rose.rose100 });

      await act(async () => {
        fireEvent.press(view.getByTestId('cancel-client-deletion'));
      });
      expect(view.queryByTestId('client-deletion-dialog')).toBeNull();
      expect(Number(view.getByTestId('session-client-count').props.children)).toBe(total);

      await chooseClientAction(view, 'open-client-deletion');
      await act(async () => {
        fireEvent.press(view.getByTestId('confirm-client-deletion'));
      });

      expect(warningHaptic).toHaveBeenCalledTimes(1);
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(Number(view.getByTestId('session-client-count').props.children)).toBe(total - 1);
      expect(view.queryByText('Client introuvable')).toBeNull();
    });

    it('explains instead of confirming when an Appointment references the archived Client', async () => {
      const view = await renderProfile('client-agenda-lea');
      const total = Number(view.getByTestId('session-client-count').props.children);

      await archiveThroughConfirmation(view);
      await chooseClientAction(view, 'open-client-deletion');

      expect(view.getByTestId('client-deletion-blocked')).toBeTruthy();
      expect(view.getByText('Suppression impossible')).toBeTruthy();
      expect(
        view.getByText(
          'Ce client possède un historique de rendez-vous ou de ventes. Conservez-le archivé pour préserver cet historique.',
        ),
      ).toBeTruthy();
      expect(view.queryByTestId('confirm-client-deletion')).toBeNull();
      expect(view.queryByTestId('client-deletion-dialog')).toBeNull();

      await act(async () => {
        fireEvent.press(view.getByTestId('close-client-deletion-blocked'));
      });

      expect(view.queryByTestId('client-deletion-blocked')).toBeNull();
      expect(view.getByText('Léa Martin')).toBeTruthy();
      expect(view.getByText('Coloration')).toBeTruthy();
      expect(Number(view.getByTestId('session-client-count').props.children)).toBe(total);
      expect(warningHaptic).not.toHaveBeenCalled();
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('explains instead of confirming when a Sale references the archived Client', async () => {
      const buyer = initialClients[0];
      const view = await renderProfile(buyer.id);
      const total = Number(view.getByTestId('session-client-count').props.children);

      await act(async () => {
        fireEvent.press(view.getByTestId('seed-products'));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId('sell-first-legacy'));
      });
      await showPurchases(view);
      expect(view.getByTestId('client-sale-sale-legacy')).toBeTruthy();

      await archiveThroughConfirmation(view);
      await chooseClientAction(view, 'open-client-deletion');

      expect(view.getByTestId('client-deletion-blocked')).toBeTruthy();
      expect(view.queryByTestId('confirm-client-deletion')).toBeNull();
      expect(view.getByTestId('client-sale-sale-legacy')).toBeTruthy();
      expect(Number(view.getByTestId('session-client-count').props.children)).toBe(total);
    });
  });
  describe('history preview', () => {
    async function renderLongHistory() {
      const view = await renderProfile(LONG_HISTORY_CLIENT_ID);
      await act(async () => {
        fireEvent.press(view.getByTestId('seed-products'));
      });
      await act(async () => {
        fireEvent.press(view.getByTestId('add-long-history'));
      });
      return view;
    }

    it('defaults to Rendez-vous and previews only the 3 most recent of 5 appointments', async () => {
      const view = await renderLongHistory();

      const appointmentsTab = view.getByTestId('client-history-tab-appointments');
      expect(appointmentsTab.props.accessibilityState).toEqual({ selected: true });
      expect(appointmentsTab.props.accessibilityLabel).toBe('Rendez-vous, 5');
      expect(view.getByTestId('client-history-tab-purchases').props.accessibilityLabel).toBe(
        'Produits achetés, 5',
      );
      const preview = within(view.getByTestId('client-appointments-preview'));
      expect(preview.getByText('Brushing 5')).toBeTruthy();
      expect(preview.getByText('Brushing 4')).toBeTruthy();
      expect(preview.getByText('Brushing 3')).toBeTruthy();
      expect(view.queryByText('Brushing 2')).toBeNull();
      expect(view.queryByText('Brushing 1')).toBeNull();
      expect(view.queryByTestId('client-purchases')).toBeNull();
      // A completed appointment names no status: only exceptions do.
      expect(view.queryByText('Terminé')).toBeNull();
      // Total dépensé still covers the whole history, not the preview.
      expect(view.getByTestId('metric-completed').props.children).toBe('5');
      expect(view.getByTestId('metric-spent').props.children).toBe(formatPrice(5 * 42));
    });

    it('opens the existing Appointment Details from a preview row', async () => {
      const view = await renderLongHistory();

      await act(async () => {
        fireEvent.press(view.getByTestId('client-appointment-long-5'));
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/appointments/[appointmentId]',
        params: { appointmentId: 'long-5' },
      });
    });

    it('pushes the complete appointment history instead of expanding it inline', async () => {
      const view = await renderLongHistory();

      const link = view.getByTestId('open-client-appointment-history');
      expect(link.props.accessibilityLabel).toBe('Voir les 5 rendez-vous');
      await act(async () => {
        fireEvent.press(link);
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/clients/appointments/[clientId]',
        params: { clientId: LONG_HISTORY_CLIENT_ID },
      });
      expect(view.queryByText('Brushing 1')).toBeNull();
    });

    it('switches the same area to the 3 newest purchases and pushes the complete purchase history', async () => {
      const view = await renderLongHistory();

      await showPurchases(view);

      expect(view.getByTestId('client-history-tab-purchases').props.accessibilityState).toEqual({
        selected: true,
      });
      expect(view.queryByTestId('client-appointments-preview')).toBeNull();
      const purchases = within(view.getByTestId('client-purchases'));
      expect(purchases.getByTestId('client-sale-sale-long-5')).toBeTruthy();
      expect(purchases.getByTestId('client-sale-sale-long-4')).toBeTruthy();
      expect(purchases.getByTestId('client-sale-sale-long-3')).toBeTruthy();
      expect(view.queryByTestId('client-sale-sale-long-2')).toBeNull();

      const link = view.getByTestId('open-client-purchase-history');
      expect(link.props.accessibilityLabel).toBe('Voir les 5 achats');
      await act(async () => {
        fireEvent.press(link);
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/clients/purchases/[clientId]',
        params: { clientId: LONG_HISTORY_CLIENT_ID },
      });
      expect(view.queryByTestId('client-sale-sale-long-1')).toBeNull();
    });

    it('hides « Voir les … » while every appointment is already visible', async () => {
      const view = await renderProfile('client-agenda-lea');

      expect(view.getByText('Coloration')).toBeTruthy();
      expect(view.queryByTestId('open-client-appointment-history')).toBeNull();
    });
  });
});

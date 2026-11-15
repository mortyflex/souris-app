import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import { loadSyncOutbox, markAggregateUpserted } from '@/persistence/sync/outbox';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider, testBusiness } from '@/providers/testing/TestPersistenceProvider';

import type { SubscriptionVerification } from '@/domain/access';
import { createFakeSubscriptionSource } from '@/features/access/testing/fake-subscription-source';

import { SIGN_OUT_MESSAGE, SIGN_OUT_WITH_UNSENT_CHANGES_MESSAGE } from '../components/AccountSheet';
import { formatAppVersion, PlusScreen } from '../PlusScreen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// The development paywall preview (loaded under __DEV__, which Jest sets) draws
// the first-run frame, whose entrance runs on Reanimated: tests render it settled.
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'BeautIzzy', version: '1.0.0' } },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: mockBottomInset, left: 0, right: 0 }),
  };
});

// Bottom safe area reported to Plus (inside a native tab: bar + home indicator).
let mockBottomInset = 0;

async function renderPlus() {
  const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
  const view = await render(
    <TestPersistenceProvider>
      <AuthProvider gateway={auth}>
        <ServiceCatalogProvider>
          <PlusScreen />
        </ServiceCatalogProvider>
      </AuthProvider>
    </TestPersistenceProvider>,
  );
  await act(async () => {});
  return { view, auth };
}

describe('PlusScreen', () => {
  it('keeps the management navigation, shows the Business identity, and keeps the BeautIzzy identity block', async () => {
    const { view } = await renderPlus();

    expect(view.getByRole('header', { name: 'Plus' })).toBeTruthy();
    expect(view.getByText('Prestations & tarifs')).toBeTruthy();
    expect(view.getByText('Maison Léa')).toBeTruthy();
    expect(view.getByText('Coiffure')).toBeTruthy();

    const brand = view.getByTestId('plus-brand');
    // The logo is the single accessible "BeautIzzy" element.
    expect(view.getAllByLabelText('BeautIzzy')).toHaveLength(1);
    expect(brand).toBeTruthy();
    expect(view.getByText('Version 1.0.0')).toBeTruthy();
    expect(view.queryByText(/sauvegard|synchronis|cloud/i)).toBeNull();
  });

  it('opens the canonical account sheet and signs out only through the shared, non-alarming dialog', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { view, auth } = await renderPlus();

    await act(async () => {
      fireEvent.press(view.getByTestId('plus-account'));
    });
    expect(view.getByTestId('account-sheet')).toBeTruthy();
    expect(view.getByText('COMPTE')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Maison Léa' })).toBeTruthy();
    expect(view.getByLabelText('Fermer')).toBeTruthy();
    expect(view.getByText('lea@example.com')).toBeTruthy();
    expect(view.getByText('Léa Martin')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('sign-out'));
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(view.getByTestId('sign-out-dialog')).toBeTruthy();
    expect(view.getByText('Se déconnecter ?')).toBeTruthy();
    const message = view.getByText(/Vous devrez vous reconnecter/).props.children as string;
    expect(message).toContain('Les données restent enregistrées sur cet appareil.');
    expect(message).not.toMatch(/sauvegard|synchronis|cloud/i);
    expect(auth.calls.signOut).toBe(0);

    await act(async () => {
      fireEvent.press(view.getByTestId('cancel-sign-out'));
    });
    expect(view.queryByTestId('sign-out-dialog')).toBeNull();
    expect(auth.calls.signOut).toBe(0);

    await act(async () => {
      fireEvent.press(view.getByTestId('sign-out'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-sign-out'));
    });
    expect(auth.calls.signOut).toBe(1);
    alertSpy.mockRestore();
  });

  it('says when changes are not sent yet, keeps them on the device, and still signs out', async () => {
    const database = openTestDatabase();
    const auth = createFakeAuthGateway({ restore: async () => ({ kind: 'authenticated', user: fakeUser }) });
    const view = await render(
      <TestPersistenceProvider database={database}>
        <AuthProvider gateway={auth}>
          <ServiceCatalogProvider>
            <PlusScreen />
          </ServiceCatalogProvider>
        </AuthProvider>
      </TestPersistenceProvider>,
    );
    await act(async () => {});
    bindLocalDatabaseToBusiness(database, testBusiness);
    markAggregateUpserted(database, 'CLIENT', '11111111-1111-4111-8111-111111111111');
    expect(loadSyncOutbox(database, testBusiness.id)).toHaveLength(1);

    await act(async () => {
      fireEvent.press(view.getByTestId('plus-account'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('sign-out'));
    });
    expect(view.getByText(SIGN_OUT_WITH_UNSENT_CHANGES_MESSAGE)).toBeTruthy();
    expect(view.queryByText(SIGN_OUT_MESSAGE)).toBeNull();
    expect(SIGN_OUT_WITH_UNSENT_CHANGES_MESSAGE).not.toMatch(/sauvegard|cloud/i);

    await act(async () => {
      fireEvent.press(view.getByTestId('confirm-sign-out'));
    });
    expect(auth.calls.signOut).toBe(1);
    // Signing out sends nothing and removes nothing.
    expect(loadSyncOutbox(database, testBusiness.id)).toHaveLength(1);
  });

  it('development builds: the Développement section opens the Cloud Sync test control', async () => {
    const { view } = await renderPlus();

    expect(view.getByTestId('development-reset-database')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByTestId('development-sync-open'));
    });
    expect(view.getByTestId('development-sync-sheet')).toBeTruthy();
    // This test database is not bound: nothing can be run from here.
    expect(view.getByTestId('development-sync-business').props.children).toBe('Aucun (base non liée)');
    expect(view.getByTestId('development-sync-run').props.accessibilityState?.disabled).toBe(true);
  });

  it('development builds: the Développement section opens the BeautIzzy Plus preview on its scenario list', async () => {
    const { view } = await renderPlus();

    expect(view.queryByTestId('paywall-preview-sheet')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('development-paywall-preview-open'));
    });
    expect(view.getByTestId('paywall-preview-sheet')).toBeTruthy();
    expect(view.getByText('Première offre — essai éligible')).toBeTruthy();
    // The list alone: the paywall is presented only once the list is dismissed.
    expect(view.queryByTestId('paywall-preview-screen')).toBeNull();
  });

  it('production path: no development section, no sync control', async () => {
    const flags = globalThis as unknown as { __DEV__: boolean };
    flags.__DEV__ = false;
    try {
      const { view } = await renderPlus();
      expect(view.getByText('Prestations & tarifs')).toBeTruthy();
      expect(view.queryByText('Développement')).toBeNull();
      expect(view.queryByTestId('development-reset-database')).toBeNull();
      expect(view.queryByTestId('development-sync-open')).toBeNull();
      expect(view.queryByTestId('development-sync-sheet')).toBeNull();
      expect(view.queryByTestId('development-paywall-preview-open')).toBeNull();
      expect(view.queryByTestId('paywall-preview-sheet')).toBeNull();
      expect(view.queryByTestId('development-subscription-status-preview-open')).toBeNull();
      expect(view.queryByTestId('subscription-status-preview-sheet')).toBeNull();
      expect(view.queryByTestId('development-home-brand-preview-open')).toBeNull();
      expect(view.queryByTestId('home-brand-preview-sheet')).toBeNull();
      // « Mon abonnement » is product UI: it stays.
      expect(view.getByText('Mon abonnement')).toBeTruthy();
    } finally {
      flags.__DEV__ = true;
    }
  });

  it('offers the Cash Register under Gestion and opens it', async () => {
    mockPush.mockClear();
    const { view } = await renderPlus();

    expect(view.getByText('Caisse')).toBeTruthy();
    expect(view.getByText('Encaissements du jour et du mois')).toBeTruthy();
    expect(view.getByText('Rappels clients')).toBeTruthy();
    expect(view.getByLabelText('Rappels clients, rappels par e-mail')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('plus-cash-register'));
    });

    expect(mockPush).toHaveBeenCalledWith('/cash-register');
  });

  it('offers the working hours under Gestion, right after Réservation en ligne, and opens them', async () => {
    mockPush.mockClear();
    const { view } = await renderPlus();

    const row = view.getByTestId('plus-working-hours-settings');
    expect(row.props.accessibilityLabel).toBe('Horaires, Jours et heures de travail');
    const rows = view
      .getAllByRole('button')
      .map((button) => button.props.testID as string | undefined)
      .filter((testID) => testID === 'plus-online-booking-settings' || testID === 'plus-working-hours-settings');
    expect(rows).toEqual(['plus-online-booking-settings', 'plus-working-hours-settings']);

    await act(async () => {
      fireEvent.press(row);
    });

    expect(mockPush).toHaveBeenCalledWith('/working-hours-settings');
  });

  it('anchors the decorative settings watermark, hidden from accessibility', async () => {
    const { view } = await renderPlus();

    expect(view.queryByTestId('screen-watermark-settings')).toBeNull();
    const watermark = view.getByTestId('screen-watermark-settings', { includeHiddenElements: true });
    expect(watermark.props.pointerEvents).toBe('none');
    expect(watermark.props.accessibilityElementsHidden).toBe(true);
  });

  it('is one vertical scroll whose content ends above the native tab bar', async () => {
    mockBottomInset = 83;
    try {
      const { view } = await renderPlus();
      const scroll = view.getByTestId('plus-scroll');

      expect(scroll.props.horizontal).toBeFalsy();
      expect(scroll.props.scrollEnabled).not.toBe(false);
      // The page grows to the viewport when it is shorter, and its last
      // element clears the bar through the tab's bottom safe area.
      expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
        flexGrow: 1,
        paddingBottom: 83,
      });
      // The header scrolls with the page: nothing is pinned outside it.
      expect(within(scroll).getByRole('header', { name: 'Plus' })).toBeTruthy();
    } finally {
      mockBottomInset = 0;
    }
  });

  it('keeps every section and the BeautIzzy identity in the scroll flow, in order', async () => {
    const { view } = await renderPlus();
    const content = within(view.getByTestId('plus-scroll')).getByTestId('plus-content');
    const flow = within(content);

    expect(flow.getByText('Gestion')).toBeTruthy();
    expect(flow.getByTestId('plus-account')).toBeTruthy();
    expect(flow.getByTestId('development-reset-database')).toBeTruthy();
    expect(flow.getByTestId('development-sync-open')).toBeTruthy();
    expect(flow.getByText('Version 1.0.0')).toBeTruthy();

    // The identity block is the last element of the flow, never an overlay.
    const brand = flow.getByTestId('plus-brand');
    const sections = content.children;
    expect(sections[sections.length - 1]).toBe(brand);
    expect(StyleSheet.flatten(brand.props.style).position).not.toBe('absolute');
  });

  it('production path: the identity block stays in the scroll flow without the development section', async () => {
    const flags = globalThis as unknown as { __DEV__: boolean };
    flags.__DEV__ = false;
    try {
      const { view } = await renderPlus();
      const flow = within(view.getByTestId('plus-scroll'));
      expect(flow.queryByText('Développement')).toBeNull();
      expect(flow.getByTestId('plus-brand')).toBeTruthy();
      expect(flow.getByText('Version 1.0.0')).toBeTruthy();
    } finally {
      flags.__DEV__ = true;
    }
  });

  it('shows the version only when the manifest provides one', () => {
    expect(formatAppVersion('1.0.0')).toBe('Version 1.0.0');
    expect(formatAppVersion(' 2.1.0 ')).toBe('Version 2.1.0');
    expect(formatAppVersion('')).toBeUndefined();
    expect(formatAppVersion(undefined)).toBeUndefined();
  });
});

describe('PlusScreen — « Mon abonnement » (Phase 6.2)', () => {
  const ACTIVE: SubscriptionVerification = {
    kind: 'verified',
    status: { kind: 'active', plan: 'monthly', expiresAt: new Date('2099-01-15T10:00:00.000Z') },
  };

  async function renderPlusWithAccess(verification: SubscriptionVerification) {
    const source = createFakeSubscriptionSource();
    source.respondWith(verification);
    const view = await render(
      <TestPersistenceProvider access={{ enforcement: 'disabled', source }}>
        <ServiceCatalogProvider>
          <PlusScreen />
        </ServiceCatalogProvider>
      </TestPersistenceProvider>,
    );
    await act(async () => {});
    return view;
  }

  it('shows the section between Compte and the identity block, with no action', async () => {
    const { view } = await renderPlus();
    const content = within(view.getByTestId('plus-scroll')).getByTestId('plus-content');
    const flow = within(content);
    expect(flow.getByText('Mon abonnement')).toBeTruthy();
    const section = flow.getByTestId('subscription-section');
    const children = Array.from(content.children);
    expect(children.indexOf(section)).toBeGreaterThan(children.indexOf(flow.getByTestId('plus-account').parent!));
    expect(children.indexOf(section)).toBeLessThan(children.indexOf(flow.getByTestId('plus-brand')));
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
    expect(within(section).queryByText(/Gérer/)).toBeNull();
  });

  it('never infers Plus from full access: the default fixture (enforcement disabled, nothing verified) shows no badge', async () => {
    const { view } = await renderPlus();
    expect(view.queryByTestId('subscription-status-badge')).toBeNull();
    expect(view.queryByText('Abonnement actif')).toBeNull();
  });

  it('shows the badge and the plan for a verified active subscription', async () => {
    const view = await renderPlusWithAccess(ACTIVE);
    expect(view.getByTestId('subscription-status-badge')).toBeTruthy();
    expect(view.getByText('Abonnement actif')).toBeTruthy();
    expect(view.getByText('Mensuel')).toBeTruthy();
    expect(view.getByText(/Période en cours jusqu’au 15 janvier 2099\./)).toBeTruthy();
    // The badge adds a second accessible "BeautIzzy Plus", never a second "BeautIzzy".
    expect(view.getAllByLabelText('BeautIzzy')).toHaveLength(1);
  });

  it('shows a quiet neutral state for a verified never-subscribed account', async () => {
    const view = await renderPlusWithAccess({ kind: 'verified', status: { kind: 'never' } });
    expect(view.queryByTestId('subscription-status-badge')).toBeNull();
    expect(view.getByText('Aucun abonnement actif')).toBeTruthy();
    expect(view.getByText('Vos données sont conservées et restent consultables.')).toBeTruthy();
    expect(view.queryByText(/lecture seule|bloqu/i)).toBeNull();
  });

  it('development builds: the Développement section opens the Accueil brand row preview, both states, one sheet', async () => {
    const { view } = await renderPlus();
    expect(view.queryByTestId('home-brand-preview-sheet')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('development-home-brand-preview-open'));
    });
    expect(view.getByTestId('home-brand-preview-sheet')).toBeTruthy();
    expect(view.getByTestId('home-brand-preview-without-plus-row')).toBeTruthy();
    expect(view.getByTestId('home-brand-preview-with-plus-mark')).toBeTruthy();
    expect(view.queryByTestId('home-brand-preview-without-plus-mark')).toBeNull();
    // Nothing of the product shows a Plus: the preview never touches the session.
    expect(view.queryByTestId('subscription-status-badge')).toBeNull();
  });

  it('development builds: the Développement section opens the subscription status preview, one sheet, every fixture', async () => {
    const { view } = await renderPlus();
    expect(view.queryByTestId('subscription-status-preview-sheet')).toBeNull();
    await act(async () => {
      fireEvent.press(view.getByTestId('development-subscription-status-preview-open'));
    });
    expect(view.getByTestId('subscription-status-preview-sheet')).toBeTruthy();
    expect(view.getByTestId('subscription-status-preview-active-monthly-card')).toBeTruthy();
    expect(view.getByTestId('subscription-status-preview-complimentary-card')).toBeTruthy();
    // The product section is untouched by the fixtures.
    expect(within(view.getByTestId('subscription-section')).queryByTestId('subscription-status-badge')).toBeNull();
  });
});

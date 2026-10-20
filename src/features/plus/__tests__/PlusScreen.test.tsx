import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

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

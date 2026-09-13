import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import { AuthProvider } from '@/features/auth/session/AuthProvider';
import { createFakeAuthGateway, fakeUser } from '@/features/auth/testing/fake-auth-gateway';
import { ServiceCatalogProvider } from '@/features/services/session/ServiceCatalogProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { formatAppVersion, PlusScreen } from '../PlusScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'Souris', version: '1.0.0' } },
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
  it('keeps the management navigation, shows the Business identity, and keeps the Souris identity block', async () => {
    const { view } = await renderPlus();

    expect(view.getByRole('header', { name: 'Plus' })).toBeTruthy();
    expect(view.getByText('Prestations & tarifs')).toBeTruthy();
    expect(view.getByText('Maison Léa')).toBeTruthy();
    expect(view.getByText('Coiffure')).toBeTruthy();

    const brand = view.getByTestId('plus-brand');
    // The wordmark is the single accessible "Souris" element; the mark is decorative.
    expect(view.getAllByLabelText('Souris')).toHaveLength(1);
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

  it('anchors the decorative settings watermark, hidden from accessibility', async () => {
    const { view } = await renderPlus();

    expect(view.queryByTestId('screen-watermark-settings')).toBeNull();
    const watermark = view.getByTestId('screen-watermark-settings', { includeHiddenElements: true });
    expect(watermark.props.pointerEvents).toBe('none');
    expect(watermark.props.accessibilityElementsHidden).toBe(true);
  });

  it('keeps its non-scrolling content above the native tab bar through the bottom safe area', async () => {
    mockBottomInset = 83;
    try {
      const { view } = await renderPlus();
      expect(StyleSheet.flatten(view.getByTestId('plus-content').props.style)).toMatchObject({
        paddingBottom: 83,
      });
    } finally {
      mockBottomInset = 0;
    }
  });

  it('shows the version only when the manifest provides one', () => {
    expect(formatAppVersion('1.0.0')).toBe('Version 1.0.0');
    expect(formatAppVersion(' 2.1.0 ')).toBe('Version 2.1.0');
    expect(formatAppVersion('')).toBeUndefined();
    expect(formatAppVersion(undefined)).toBeUndefined();
  });
});

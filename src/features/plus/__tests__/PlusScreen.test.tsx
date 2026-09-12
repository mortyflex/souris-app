import { render } from '@testing-library/react-native';

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
  };
});

function renderPlus() {
  return render(
    <TestPersistenceProvider>
      <ServiceCatalogProvider>
        <PlusScreen />
      </ServiceCatalogProvider>
    </TestPersistenceProvider>,
  );
}

describe('PlusScreen', () => {
  it('keeps the management navigation and adds a restrained Souris identity', async () => {
    const view = await renderPlus();

    expect(view.getByRole('header', { name: 'Plus' })).toBeTruthy();
    expect(view.getByText('Prestations & tarifs')).toBeTruthy();

    const brand = view.getByTestId('plus-brand');
    // The wordmark is the single accessible "Souris" element; the mark is decorative.
    expect(view.getAllByLabelText('Souris')).toHaveLength(1);
    expect(brand).toBeTruthy();
    expect(view.getByText('Version 1.0.0')).toBeTruthy();
  });

  it('shows the version only when the manifest provides one', () => {
    expect(formatAppVersion('1.0.0')).toBe('Version 1.0.0');
    expect(formatAppVersion(' 2.1.0 ')).toBe('Version 2.1.0');
    expect(formatAppVersion('')).toBeUndefined();
    expect(formatAppVersion(undefined)).toBeUndefined();
  });
});

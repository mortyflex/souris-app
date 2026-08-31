import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { ServiceCatalogProvider, useServiceCatalog } from '../../session/ServiceCatalogProvider';
import { ServiceCatalogScreen } from '../ServiceCatalogScreen';

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

function CatalogProbe() {
  const { services, setServiceActive } = useServiceCatalog();
  return (
    <>
      <Text testID="catalog-count">{services.length}</Text>
      <Pressable
        testID="deactivate-brushing-1"
        onPress={() => setServiceActive('service-brushing-brushing-1', false)}
      />
    </>
  );
}

function renderCatalog() {
  return render(
    <ServiceCatalogProvider>
      <ServiceCatalogScreen />
      <CatalogProbe />
    </ServiceCatalogProvider>,
  );
}

describe('ServiceCatalogScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('presents the catalog grouped by activation and type', async () => {
    const view = await renderCatalog();

    expect(view.getByText('Prestations & tarifs')).toBeTruthy();
    expect(view.getByText('Actives')).toBeTruthy();
    expect(view.getByText('Prestations simples')).toBeTruthy();
    expect(view.getByText('Techniques')).toBeTruthy();
    // No legacy category headers reappear.
    expect(view.queryByText('Brushing')).toBeNull();
    expect(view.queryByText('Coloration')).toBeNull();
    // Row content stays concise: simple services show duration only,
    // techniques show duration with processing context.
    expect(view.getByText('Brushing 1')).toBeTruthy();
    expect(view.getByText('20,00 €')).toBeTruthy();
    expect(view.getByText('30 min')).toBeTruthy();
    expect(view.queryByText('30 min · Simple')).toBeNull();
    expect(view.getByText('2 h 30 min · dont 1 h de pose')).toBeTruthy();
    expect(view.queryByText(/Technique · \d+ phases/)).toBeNull();
  });

  it('opens the existing Service editor with only its stable id', async () => {
    const view = await renderCatalog();

    await act(async () => {
      fireEvent.press(view.getByText('Brushing 1'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/services/[serviceId]',
      params: { serviceId: 'service-brushing-brushing-1' },
    });
  });

  it('opens the create flow', async () => {
    const view = await renderCatalog();

    await act(async () => {
      fireEvent.press(view.getByLabelText('Ajouter une prestation'));
    });

    expect(mockPush).toHaveBeenCalledWith('/services/new');
  });

  it('moves a deactivated Service out of the active group without removing it', async () => {
    const view = await renderCatalog();

    expect(view.getByText('5')).toBeTruthy();
    expect(view.getByText('11')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('deactivate-brushing-1'));
    });

    // The Service is kept; only the active/inactive split changes.
    expect(view.getByTestId('catalog-count').props.children).toBe(16);
    expect(view.queryByText('5')).toBeNull();
    expect(view.getByText('4')).toBeTruthy();
    expect(view.getByText('11')).toBeTruthy();
  });
});

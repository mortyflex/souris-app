import { act, fireEvent, render } from '@testing-library/react-native';

import { createInitialClients } from '../../data/initial-clients';
import { prepareClientDirectory } from '../sort-clients';
import { ClientDirectoryScreen } from '../ClientDirectoryScreen';
import { ClientSessionProvider } from '../../session/ClientSessionProvider';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
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

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

function renderDirectory() {
  return render(
    <ClientSessionProvider>
      <ClientDirectoryScreen />
    </ClientSessionProvider>,
  );
}

const initialClients = createInitialClients();

describe('ClientDirectoryScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('renders the directory with the search field', async () => {
    const view = await renderDirectory();

    expect(view.getByText('Clientes')).toBeTruthy();
    expect(view.getByPlaceholderText('Rechercher une cliente')).toBeTruthy();
  });

  it('finds "Léa" by searching "lea" (accent-insensitive)', async () => {
    const view = await renderDirectory();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'lea');
    });

    expect(view.getByText('Léa Martin')).toBeTruthy();
  });

  it('finds a client by phone with ordinary formatting differences', async () => {
    const withPhone = initialClients.find((client) => client.phone);
    expect(withPhone).toBeDefined();
    if (!withPhone) return;
    const spacedPhone = (withPhone.phone ?? '').replace(/(\d{2})(?=\d)/g, '$1 ');

    const view = await renderDirectory();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), spacedPhone);
    });

    expect(
      view.getByText(`${withPhone.firstName} ${withPhone.lastName ?? ''}`.trim()),
    ).toBeTruthy();
  });

  it('restores the alphabetical directory when the search is cleared', async () => {
    const view = await renderDirectory();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'lea');
    });
    expect(view.getByText('Léa Martin')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), '');
    });

    expect(view.queryByText('Léa Martin')).toBeNull();
    const firstSorted = prepareClientDirectory(initialClients, '')[0];
    expect(view.getByText(`${firstSorted.firstName} ${firstSorted.lastName ?? ''}`.trim())).toBeTruthy();
  });

  it('opens the Client Profile for the tapped client using clientId only', async () => {
    const view = await renderDirectory();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'léa');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Léa Martin'));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/clients/[clientId]',
      params: { clientId: 'client-agenda-lea' },
    });
  });

  it('adds a client from the directory and shows it immediately', async () => {
    const view = await renderDirectory();

    await act(async () => {
      fireEvent.press(view.getByTestId('add-client-directory'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Prénom'), 'Zélie');
    });
    await act(async () => {
      fireEvent.changeText(view.getByLabelText('Nom'), 'Deville');
    });
    await act(async () => {
      fireEvent.press(view.getByText('Ajouter la cliente'));
    });

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'zélie');
    });

    expect(view.getByText('Zélie Deville')).toBeTruthy();
  });
});

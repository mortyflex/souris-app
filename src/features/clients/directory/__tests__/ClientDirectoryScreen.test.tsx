import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Pressable } from 'react-native';

import { createInitialClients } from '../../data/initial-clients';
import { prepareClientDirectory } from '../sort-clients';
import { ClientDirectoryScreen } from '../ClientDirectoryScreen';
import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

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

function LifecycleProbe() {
  const { archiveClient, restoreClient } = useClientSession();
  return (
    <>
      <Pressable testID="archive-lea" onPress={() => archiveClient('client-agenda-lea')} />
      <Pressable testID="restore-lea" onPress={() => restoreClient('client-agenda-lea')} />
    </>
  );
}

function renderDirectory() {
  return render(
    <TestPersistenceProvider>
      <ClientSessionProvider>
        <ClientDirectoryScreen />
        <LifecycleProbe />
      </ClientSessionProvider>
    </TestPersistenceProvider>,
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

  it('lists every Client under Actives without an Archivées group when nothing is archived', async () => {
    const view = await renderDirectory();

    expect(view.getByTestId('client-group-active')).toBeTruthy();
    expect(view.queryByTestId('client-group-archived')).toBeNull();
    expect(view.queryByText('Archivée')).toBeNull();
  });

  it('moves an archived Client under a secondary Archivées group with a subtle indicator', async () => {
    const view = await renderDirectory();

    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'martin');
    });

    expect(view.getByTestId('client-group-active')).toBeTruthy();
    expect(view.getByTestId('client-group-archived')).toBeTruthy();
    const archivedRow = within(view.getByTestId('client-row-client-agenda-lea'));
    expect(archivedRow.getByText('Léa Martin')).toBeTruthy();
    expect(archivedRow.getByText('Archivée')).toBeTruthy();
    expect(view.getByLabelText('Ouvrir la fiche de Léa Martin, archivée')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByText('Léa Martin'));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/clients/[clientId]',
      params: { clientId: 'client-agenda-lea' },
    });
  });

  it('keeps an archived Client discoverable through search and restores her to Actives', async () => {
    const view = await renderDirectory();

    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'léa martin');
    });
    expect(view.getByTestId('client-group-archived')).toBeTruthy();
    expect(view.queryByTestId('client-group-active')).toBeNull();
    expect(view.getByText('Léa Martin')).toBeTruthy();

    await act(async () => {
      fireEvent.press(view.getByTestId('restore-lea'));
    });

    expect(view.getByTestId('client-group-active')).toBeTruthy();
    expect(view.queryByTestId('client-group-archived')).toBeNull();
    expect(view.queryByText('Archivée')).toBeNull();
    expect(view.getByText('Léa Martin')).toBeTruthy();
  });
});

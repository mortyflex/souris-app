import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { createInitialClients } from '../../data/initial-clients';
import { prepareClientDirectory } from '../sort-clients';
import { ClientDirectoryScreen } from '../ClientDirectoryScreen';
import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleFloatingReveal } from '@/shared/ui/testing/sheet-transitions';
import { screenWatermarkOptics } from '@/shared/ui/ScreenWatermarkIcon';
import { appointmentPastels, colors, radii } from '@/shared/ui/theme';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(effect, [effect]);
  },
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
  const { activeClients, archiveClient, restoreClient, updateClient } = useClientSession();
  return (
    <>
      <Text testID="session-active-count">{activeClients.length}</Text>
      <Pressable testID="archive-lea" onPress={() => archiveClient('client-agenda-lea')} />
      <Pressable testID="restore-lea" onPress={() => restoreClient('client-agenda-lea')} />
      <Pressable
        testID="give-lea-birthday-and-notes"
        onPress={() =>
          updateClient({
            id: 'client-agenda-lea',
            firstName: 'Léa',
            lastName: 'Martin',
            birthday: { month: 9, day: 21 },
            notes: 'Allergie au PPD',
          })
        }
      />
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

  it('renders the Produits-style header: title, search, no eyebrow, no top text action', async () => {
    const view = await renderDirectory();

    expect(view.getByRole('header', { name: 'Clientes' })).toBeTruthy();
    expect(view.queryByText('CLIENTES')).toBeNull();
    expect(view.queryByText('Ajouter une cliente')).toBeNull();
    expect(view.getByPlaceholderText('Rechercher une cliente')).toBeTruthy();
    expect(view.getByPlaceholderText('Rechercher une cliente').props.autoFocus).toBeFalsy();
    await settleFloatingReveal();
    const create = view.getByTestId('add-client-directory');
    expect(create.props.accessibilityRole).toBe('button');
    expect(create.props.accessibilityLabel).toBe('Ajouter une cliente');
  });

  it('shows the total of ACTIVE clients in a pill next to the title, derived from the session and deaf to search', async () => {
    const view = await renderDirectory();
    // The session's own active collection is the one source of the total.
    const total = Number(view.getByTestId('session-active-count').props.children);
    expect(total).toBeGreaterThan(1);
    const count = () => view.getByTestId('clients-header-count');

    // Beside the untouched « Clientes » title: white figures in a soft-violet pill.
    const title = view.getByRole('header', { name: 'Clientes' });
    const pill = count().parent!;
    expect(pill.parent).toBe(title.parent);
    expect(count().props.children).toBe(total);
    expect(count().props.accessibilityLabel).toBe(`${total} clientes actives`);
    expect(StyleSheet.flatten(count().props.style)).toMatchObject({ color: colors.background });
    expect(StyleSheet.flatten(pill.props.style)).toMatchObject({
      backgroundColor: appointmentPastels.lilac.accent,
      borderRadius: radii.pill,
    });
    expect(StyleSheet.flatten(count().props.style).fontSize).toBeLessThan(
      StyleSheet.flatten(title.props.style).fontSize,
    );

    // Search narrows the list, never the total.
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'lea');
    });
    expect(count().props.children).toBe(total);
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), '');
    });

    // An archived Client stays listed (Archivées) but leaves the total; restoring brings her back.
    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });
    expect(count().props.children).toBe(total - 1);
    // She is still on the screen, under Archivées (searched: the long list is virtualized).
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'Léa Martin');
    });
    expect(view.getByTestId('client-group-archived')).toBeTruthy();
    expect(count().props.children).toBe(total - 1);

    await act(async () => {
      fireEvent.press(view.getByTestId('restore-lea'));
    });
    expect(count().props.children).toBe(total);
  });

  it('lets the list scroll above the native tab bar through the system content inset', async () => {
    const view = await renderDirectory();
    const lists = view.container.queryAll((node) => node.type === 'RCTScrollView');
    expect(lists).toHaveLength(1);
    expect(lists[0].props.contentInsetAdjustmentBehavior).toBe('automatic');
  });

  it('anchors the decorative clients watermark, hidden from accessibility and touches', async () => {
    const view = await renderDirectory();

    expect(view.queryByTestId('screen-watermark-clients')).toBeNull();
    const watermark = view.getByTestId('screen-watermark-clients', { includeHiddenElements: true });
    expect(watermark.props.pointerEvents).toBe('none');
    expect(watermark.props.accessibilityElementsHidden).toBe(true);
    // The people symbol gets its optical variant so the heads and shoulders
    // stay readable around the header; Produits keeps the reference geometry.
    expect(screenWatermarkOptics.clients.scale).toBeGreaterThan(screenWatermarkOptics.products.scale);
    expect(screenWatermarkOptics.clients.rise).toBeGreaterThan(screenWatermarkOptics.products.rise);
    expect(view.getByRole('header', { name: 'Clientes' })).toBeTruthy();
    expect(view.getByPlaceholderText('Rechercher une cliente')).toBeTruthy();
    await settleFloatingReveal();
    expect(view.getByTestId('add-client-directory')).toBeTruthy();
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

  it('adds a client through the floating + and shows it immediately', async () => {
    const view = await renderDirectory();

    expect(view.queryByTestId('client-form-sheet')).toBeNull();
    await settleFloatingReveal();
    await act(async () => {
      fireEvent.press(view.getByTestId('add-client-directory'));
    });
    expect(view.getByTestId('client-form-sheet')).toBeTruthy();
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

  it('shows a compact birthday on the row when one exists — and nothing at all otherwise', async () => {
    const view = await renderDirectory();
    const rowIds = () =>
      view.getAllByTestId(/^client-row-(?!birthday-)/).map((row) => row.props.testID as string);
    // The directory is virtualized: narrow it so the rows under test are mounted.
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'martin');
    });

    // No Client of the seed has a birthday: no birthday UI, no placeholder.
    expect(view.queryAllByTestId(/^client-row-birthday-/)).toHaveLength(0);
    expect(view.queryByText(/anniversaire/i)).toBeNull();
    const countBefore = view.getByTestId('session-active-count').props.children;
    const orderBefore = rowIds();
    expect(orderBefore).toContain('client-row-client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByTestId('give-lea-birthday-and-notes'));
    });

    const badge = view.getByTestId('client-row-birthday-client-agenda-lea');
    expect(within(badge).getByText('21 sept.')).toBeTruthy();
    expect(view.queryByText(/2026|septembre 20/)).toBeNull();
    expect(view.getAllByTestId(/^client-row-birthday-/)).toHaveLength(1);
    expect(view.getByTestId('client-row-client-agenda-lea').props.accessibilityLabel).toBe(
      'Ouvrir la fiche de Léa Martin, anniversaire le 21 septembre',
    );

    // Notes never reach the directory, and neither field moves the count or the order.
    expect(view.queryByText(/Allergie/)).toBeNull();
    expect(view.getByTestId('session-active-count').props.children).toBe(countBefore);
    expect(rowIds()).toEqual(orderBefore);
  });

  it('does not search notes or birthdays', async () => {
    const view = await renderDirectory();
    await act(async () => {
      fireEvent.press(view.getByTestId('give-lea-birthday-and-notes'));
    });

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'allergie');
    });
    expect(view.getByText('Aucune cliente trouvée')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'sept');
    });
    expect(view.getByText('Aucune cliente trouvée')).toBeTruthy();
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

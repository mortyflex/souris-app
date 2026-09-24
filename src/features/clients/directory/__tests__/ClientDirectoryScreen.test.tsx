import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { createInitialClients } from '../../data/initial-clients';
import { prepareClientDirectory } from '../sort-clients';
import { ClientDirectoryScreen } from '../ClientDirectoryScreen';
import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleFloatingReveal } from '@/shared/ui/testing/sheet-transitions';
import { screenWatermarkOptics } from '@/shared/ui/ScreenWatermarkIcon';
import { radii, semanticColors } from '@/shared/ui/theme';

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
  beforeAll(() => {
    // The birthday-today state reads the local date. Léa's test birthday is
    // 21 septembre: pin an ordinary day, the birthday tests move it themselves.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 7, 26, 10, 0));
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

  it('keeps the « Clientes » title free of any count: the total belongs to the Actives section', async () => {
    const view = await renderDirectory();

    expect(view.getByRole('header', { name: 'Clientes' })).toBeTruthy();
    expect(view.queryByTestId('clients-header-count')).toBeNull();
  });

  it('opens a directory without archives with the Produits section header: « Actives » and the count pill of its rows', async () => {
    const view = await renderDirectory();
    // Unsearched, the Actives rows are exactly the session's active Clients.
    const total = Number(view.getByTestId('session-active-count').props.children);
    expect(total).toBeGreaterThan(1);
    const activeCount = () => view.getByTestId('client-group-active-count');

    // No archived Client: no tabs, the shared SectionHeader of Produits.
    expect(view.queryByTestId('client-tabs')).toBeNull();
    const header = view.getByTestId('client-group-active');
    expect(within(header).getByText('Actives')).toBeTruthy();
    expect(view.queryByText('ACTIVES')).toBeNull();
    expect(StyleSheet.flatten(header.props.style)).toMatchObject({
      flexDirection: 'row',
      justifyContent: 'space-between',
    });
    expect(activeCount().props.children).toBe(total);
    expect(StyleSheet.flatten(activeCount().parent!.props.style)).toMatchObject({
      backgroundColor: semanticColors.surfaceLavenderStrong,
      borderRadius: radii.pill,
    });

    // Search narrows the section — and its count — exactly like « Actifs ».
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'Léa Martin');
    });
    const searched = view.getAllByTestId(/^client-row-(?!birthday)/).length;
    expect(activeCount().props.children).toBe(searched);
    expect(searched).toBeLessThan(total);
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

  it('marks the row of a Client whose birthday is TODAY — badge, words and accessibility', async () => {
    jest.setSystemTime(new Date(2026, 8, 21, 9, 0));
    const view = await renderDirectory();
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'martin');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('give-lea-birthday-and-notes'));
    });

    // The birthday slot turns into the « Aujourd'hui » badge: words, not colour alone.
    const badge = view.getByTestId('client-row-birthday-today-client-agenda-lea');
    expect(within(badge).getByText("Aujourd'hui")).toBeTruthy();
    expect(view.queryByTestId('client-row-birthday-client-agenda-lea')).toBeNull();
    expect(view.queryByText('21 sept.')).toBeNull();
    // Existing row information is preserved; the birthday is spoken.
    const row = view.getByTestId('client-row-client-agenda-lea');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe(
      "Ouvrir la fiche de Léa Martin, anniversaire aujourd'hui",
    );
    // Same row geometry as any other row.
    expect(StyleSheet.flatten(row.props.style).minHeight).toBe(60);

    // Every other row stays plain: no badge, no birthday words.
    expect(view.getAllByTestId(/^client-row-birthday-today-/)).toHaveLength(1);
    const otherRows = view
      .getAllByTestId(/^client-row-(?!birthday-)/)
      .filter((other) => other.props.testID !== 'client-row-client-agenda-lea');
    expect(otherRows.length).toBeGreaterThan(0);
    for (const other of otherRows) {
      expect(other.props.accessibilityLabel).not.toMatch(/anniversaire/i);
    }
  });

  it('keeps the normal compact date when the birthday is another day', async () => {
    jest.setSystemTime(new Date(2026, 8, 22, 9, 0));
    const view = await renderDirectory();
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'martin');
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('give-lea-birthday-and-notes'));
    });

    expect(view.queryAllByTestId(/^client-row-birthday-today-/)).toHaveLength(0);
    expect(view.queryByText("Aujourd'hui")).toBeNull();
    expect(
      within(view.getByTestId('client-row-birthday-client-agenda-lea')).getByText('21 sept.'),
    ).toBeTruthy();
    expect(view.getByTestId('client-row-client-agenda-lea').props.accessibilityLabel).toBe(
      'Ouvrir la fiche de Léa Martin, anniversaire le 21 septembre',
    );
  });

  it('never celebrates an archived Client: her row keeps the secondary compact date', async () => {
    jest.setSystemTime(new Date(2026, 8, 21, 9, 0));
    const view = await renderDirectory();
    await act(async () => {
      fireEvent.press(view.getByTestId('give-lea-birthday-and-notes'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('client-tab-archived'));
    });

    expect(view.queryAllByTestId(/^client-row-birthday-today-/)).toHaveLength(0);
    expect(view.getByTestId('client-row-birthday-client-agenda-lea')).toBeTruthy();
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

  it('shows no tabs while nothing is archived: every Client under the Actives section', async () => {
    const view = await renderDirectory();

    expect(view.queryByTestId('client-tabs')).toBeNull();
    expect(view.getByTestId('client-group-active')).toBeTruthy();
    expect(view.queryByTestId('client-group-archived')).toBeNull();
    expect(view.queryByText('Archivée')).toBeNull();
  });

  it('switches between Actives and Archivées tabs, one list at a time, counts from the session', async () => {
    const view = await renderDirectory();
    const total = Number(view.getByTestId('session-active-count').props.children);

    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });

    // Tabs appear; Actives selected by default, no heading repeating the tab.
    const tabs = view.getByTestId('client-tabs');
    expect(tabs.props.accessibilityRole).toBe('tablist');
    const activeTab = view.getByTestId('client-tab-active');
    const archivedTab = view.getByTestId('client-tab-archived');
    expect(activeTab.props.accessibilityRole).toBe('tab');
    expect(activeTab.props.accessibilityState).toMatchObject({ selected: true });
    expect(archivedTab.props.accessibilityState).toMatchObject({ selected: false });
    expect(activeTab.props.accessibilityLabel).toBe(`Actives, ${total - 1}`);
    expect(archivedTab.props.accessibilityLabel).toBe('Archivées, 1');
    expect(view.getByTestId('client-tab-active-count')).toHaveTextContent(String(total - 1));
    expect(view.getByTestId('client-tab-archived-count')).toHaveTextContent('1');
    expect(view.queryByTestId('client-group-active')).toBeNull();
    expect(view.queryByTestId('client-row-client-agenda-lea')).toBeNull();
    expect(view.queryByText('Archivée')).toBeNull();

    // Archivées: only archived Clients, with their subtle indicator; the row still opens her profile.
    await act(async () => {
      fireEvent.press(archivedTab);
    });
    expect(view.getByTestId('client-tab-archived').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(view.getAllByTestId(/^client-row-(?!birthday)/).map((row) => row.props.testID)).toEqual([
      'client-row-client-agenda-lea',
    ]);
    const archivedRow = within(view.getByTestId('client-row-client-agenda-lea'));
    expect(archivedRow.getByText('Archivée')).toBeTruthy();
    expect(view.getByLabelText('Ouvrir la fiche de Léa Martin, archivée')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByText('Léa Martin'));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/clients/[clientId]',
      params: { clientId: 'client-agenda-lea' },
    });

    // Back to Actives: no archived row.
    await act(async () => {
      fireEvent.press(view.getByTestId('client-tab-active'));
    });
    expect(view.queryByTestId('client-row-client-agenda-lea')).toBeNull();
    expect(view.getAllByTestId(/^client-row-(?!birthday)/).length).toBeGreaterThan(0);
  });

  it('searches only the selected tab, never touching the tab counts', async () => {
    const view = await renderDirectory();
    const total = Number(view.getByTestId('session-active-count').props.children);
    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'léa martin');
    });
    // On Actives, the archived Léa is not a result.
    expect(view.queryByTestId('client-row-client-agenda-lea')).toBeNull();
    expect(view.getByTestId('client-tab-active-count')).toHaveTextContent(String(total - 1));
    expect(view.getByTestId('client-tab-archived-count')).toHaveTextContent('1');

    // The query survives the switch: on Archivées she is found.
    await act(async () => {
      fireEvent.press(view.getByTestId('client-tab-archived'));
    });
    expect(view.getByTestId('client-row-client-agenda-lea')).toBeTruthy();

    // A query with no archived match: the usual search empty state, tabs kept.
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'introuvable');
    });
    expect(view.getByText('Aucune cliente trouvée')).toBeTruthy();
    expect(view.getByTestId('client-tabs')).toBeTruthy();
  });

  it('drops the tabs when the last archived Client is restored, back on Actives', async () => {
    const view = await renderDirectory();
    const total = Number(view.getByTestId('session-active-count').props.children);
    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });
    await act(async () => {
      fireEvent.press(view.getByTestId('client-tab-archived'));
    });

    await act(async () => {
      fireEvent.press(view.getByTestId('restore-lea'));
    });

    expect(view.queryByTestId('client-tabs')).toBeNull();
    expect(view.getByTestId('client-group-active-count').props.children).toBe(total);
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher une cliente'), 'léa martin');
    });
    expect(view.getByTestId('client-row-client-agenda-lea')).toBeTruthy();
    expect(view.queryByText('Archivée')).toBeNull();
  });
});

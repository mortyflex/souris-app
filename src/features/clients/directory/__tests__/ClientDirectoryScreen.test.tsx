import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { createInitialClients } from '../../data/initial-clients';
import { prepareClientDirectory } from '../sort-clients';
import { ClientDirectoryScreen } from '../ClientDirectoryScreen';
import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { settleFloatingReveal } from '@/shared/ui/testing/sheet-transitions';
import { directoryListStyles } from '@/shared/ui/directory-list';
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
    // Léa's test birthday is 21 septembre: pin an ordinary day, the birthday
    // test moves it itself.
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

    expect(view.getByRole('header', { name: 'Clientèle' })).toBeTruthy();
    expect(view.queryByText('CLIENTES')).toBeNull();
    expect(view.queryByText('Ajouter un client')).toBeNull();
    expect(view.getByPlaceholderText('Rechercher un client')).toBeTruthy();
    expect(view.getByPlaceholderText('Rechercher un client').props.autoFocus).toBeFalsy();
    await settleFloatingReveal();
    const create = view.getByTestId('add-client-directory');
    expect(create.props.accessibilityRole).toBe('button');
    expect(create.props.accessibilityLabel).toBe('Ajouter un client');
  });

  it('keeps the « Clientèle » title free of any count: the total belongs to the Actifs section', async () => {
    const view = await renderDirectory();

    expect(view.getByRole('header', { name: 'Clientèle' })).toBeTruthy();
    expect(view.queryByTestId('clients-header-count')).toBeNull();
  });

  it('opens a directory without archives with the Produits section header: « Actifs » and the count pill of its rows', async () => {
    const view = await renderDirectory();
    // Unsearched, the Actifs rows are exactly the session's active Clients.
    const total = Number(view.getByTestId('session-active-count').props.children);
    expect(total).toBeGreaterThan(1);
    const activeCount = () => view.getByTestId('client-group-active-count');

    // No archived Client: no tabs, the shared SectionHeader of Produits.
    expect(view.queryByTestId('client-tabs')).toBeNull();
    const header = view.getByTestId('client-group-active');
    expect(within(header).getByText('Actifs')).toBeTruthy();
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
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'Léa Martin');
    });
    const searched = view.getAllByTestId(/^client-row-/).length;
    expect(activeCount().props.children).toBe(searched);
    expect(searched).toBeLessThan(total);
  });

  it('lays its rows on the Produits directory grid: gutter-flush, hairline separators, same rhythm', async () => {
    const view = await renderDirectory();

    const rows = view.getAllByTestId(/^client-row-/);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      const style = StyleSheet.flatten(row.props.style);
      expect(style).toMatchObject(directoryListStyles.row);
      expect(style).toMatchObject({
        borderBottomColor: semanticColors.borderSubtle,
        borderBottomWidth: StyleSheet.hairlineWidth,
      });
      expect(style.minHeight).toBe(72);
      // No inset of its own: the row sits on the shared screen gutter.
      expect(style.marginHorizontal).toBeUndefined();
      expect(style.paddingHorizontal).toBeUndefined();
      // Thumbnail → copy → the Produits chevron, decorative and silent.
      const id = (row.props.testID as string).replace('client-row-', '');
      const chevron = within(row).getByTestId(`client-directory-chevron-${id}`, {
        includeHiddenElements: true,
      });
      expect(chevron.props.accessibilityElementsHidden).toBe(true);
      expect(chevron.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(chevron.props.pointerEvents).toBe('none');
    }
    // The chevron is not a button either: the rows are the only stops.
    expect(view.queryAllByTestId(/^client-directory-chevron-/)).toHaveLength(0);
    // The separator is a border, never an element: no extra accessibility stop.
    expect(view.getAllByRole('button', { name: /^Ouvrir la fiche de / })).toHaveLength(rows.length);
    // The « Actifs » header sits on the same gutter as the rows.
    expect(StyleSheet.flatten(view.getByTestId('client-group-active').props.style)).toMatchObject(
      directoryListStyles.sectionHeader,
    );
    expect(
      StyleSheet.flatten(view.getByTestId('client-group-active').props.style).paddingHorizontal,
    ).toBeUndefined();
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
    expect(view.getByRole('header', { name: 'Clientèle' })).toBeTruthy();
    expect(view.getByPlaceholderText('Rechercher un client')).toBeTruthy();
    await settleFloatingReveal();
    expect(view.getByTestId('add-client-directory')).toBeTruthy();
  });

  it('finds "Léa" by searching "lea" (accent-insensitive)', async () => {
    const view = await renderDirectory();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'lea');
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
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), spacedPhone);
    });

    expect(
      view.getByText(`${withPhone.firstName} ${withPhone.lastName ?? ''}`.trim()),
    ).toBeTruthy();
  });

  it('restores the alphabetical directory when the search is cleared', async () => {
    const view = await renderDirectory();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'lea');
    });
    expect(view.getByText('Léa Martin')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), '');
    });

    expect(view.queryByText('Léa Martin')).toBeNull();
    const firstSorted = prepareClientDirectory(initialClients, '')[0];
    expect(view.getByText(`${firstSorted.firstName} ${firstSorted.lastName ?? ''}`.trim())).toBeTruthy();
  });

  it('opens the Client Profile for the tapped client using clientId only', async () => {
    const view = await renderDirectory();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'léa');
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
      fireEvent.press(view.getByText('Ajouter le client'));
    });

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'zélie');
    });

    expect(view.getByText('Zélie Deville')).toBeTruthy();
  });

  it('keeps birthdays out of the rows — no date, no today badge, nothing spoken — the profile owns them', async () => {
    // Her birthday, TODAY: the directory still shows the plain row.
    jest.setSystemTime(new Date(2026, 8, 21, 9, 0));
    const view = await renderDirectory();
    const rowIds = () =>
      view.getAllByTestId(/^client-row-/).map((row) => row.props.testID as string);
    // The directory is virtualized: narrow it so the rows under test are mounted.
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'martin');
    });
    const countBefore = view.getByTestId('session-active-count').props.children;
    const orderBefore = rowIds();
    expect(orderBefore).toContain('client-row-client-agenda-lea');

    await act(async () => {
      fireEvent.press(view.getByTestId('give-lea-birthday-and-notes'));
    });

    expect(view.queryAllByTestId(/^client-(row|directory)-.*birthday/)).toHaveLength(0);
    expect(view.queryByText('21 sept.')).toBeNull();
    expect(view.queryByText("Aujourd'hui")).toBeNull();
    const row = view.getByTestId('client-row-client-agenda-lea');
    expect(row.props.accessibilityLabel).toBe('Ouvrir la fiche de Léa Martin');
    // Same row as any other: the shared grid, the Produits chevron.
    expect(StyleSheet.flatten(row.props.style)).toMatchObject(directoryListStyles.row);
    expect(within(row).getByTestId('client-directory-chevron-client-agenda-lea', { includeHiddenElements: true })).toBeTruthy();
    for (const other of view.getAllByTestId(/^client-row-/)) {
      expect(other.props.accessibilityLabel).not.toMatch(/anniversaire/i);
    }

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
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'allergie');
    });
    expect(view.getByText('Aucun client trouvé')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'sept');
    });
    expect(view.getByText('Aucun client trouvé')).toBeTruthy();
  });

  it('shows no tabs while nothing is archived: every Client under the Actifs section', async () => {
    const view = await renderDirectory();

    expect(view.queryByTestId('client-tabs')).toBeNull();
    expect(view.getByTestId('client-group-active')).toBeTruthy();
    expect(view.queryByTestId('client-group-archived')).toBeNull();
    expect(view.queryByText('Archivé')).toBeNull();
  });

  it('switches between Actifs and Archivés tabs, one list at a time, counts from the session', async () => {
    const view = await renderDirectory();
    const total = Number(view.getByTestId('session-active-count').props.children);

    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });

    // Tabs appear; Actifs selected by default, no heading repeating the tab.
    const tabs = view.getByTestId('client-tabs');
    expect(tabs.props.accessibilityRole).toBe('tablist');
    const activeTab = view.getByTestId('client-tab-active');
    const archivedTab = view.getByTestId('client-tab-archived');
    expect(activeTab.props.accessibilityRole).toBe('tab');
    expect(activeTab.props.accessibilityState).toMatchObject({ selected: true });
    expect(archivedTab.props.accessibilityState).toMatchObject({ selected: false });
    expect(activeTab.props.accessibilityLabel).toBe(`Actifs, ${total - 1}`);
    expect(archivedTab.props.accessibilityLabel).toBe('Archivés, 1');
    expect(view.getByTestId('client-tab-active-count')).toHaveTextContent(String(total - 1));
    expect(view.getByTestId('client-tab-archived-count')).toHaveTextContent('1');
    expect(view.queryByTestId('client-group-active')).toBeNull();
    expect(view.queryByTestId('client-row-client-agenda-lea')).toBeNull();
    expect(view.queryByText('Archivé')).toBeNull();

    // Archivés: only archived Clients, with their subtle indicator; the row still opens her profile.
    await act(async () => {
      fireEvent.press(archivedTab);
    });
    expect(view.getByTestId('client-tab-archived').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(view.getAllByTestId(/^client-row-/).map((row) => row.props.testID)).toEqual([
      'client-row-client-agenda-lea',
    ]);
    const archivedRow = within(view.getByTestId('client-row-client-agenda-lea'));
    expect(archivedRow.getByText('Archivé')).toBeTruthy();
    expect(view.getByLabelText('Ouvrir la fiche de Léa Martin, archivé')).toBeTruthy();
    await act(async () => {
      fireEvent.press(view.getByText('Léa Martin'));
    });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/clients/[clientId]',
      params: { clientId: 'client-agenda-lea' },
    });

    // Back to Actifs: no archived row.
    await act(async () => {
      fireEvent.press(view.getByTestId('client-tab-active'));
    });
    expect(view.queryByTestId('client-row-client-agenda-lea')).toBeNull();
    expect(view.getAllByTestId(/^client-row-/).length).toBeGreaterThan(0);
  });

  it('searches only the selected tab, never touching the tab counts', async () => {
    const view = await renderDirectory();
    const total = Number(view.getByTestId('session-active-count').props.children);
    await act(async () => {
      fireEvent.press(view.getByTestId('archive-lea'));
    });

    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'léa martin');
    });
    // On Actifs, the archived Léa is not a result.
    expect(view.queryByTestId('client-row-client-agenda-lea')).toBeNull();
    expect(view.getByTestId('client-tab-active-count')).toHaveTextContent(String(total - 1));
    expect(view.getByTestId('client-tab-archived-count')).toHaveTextContent('1');

    // The query survives the switch: on Archivés she is found.
    await act(async () => {
      fireEvent.press(view.getByTestId('client-tab-archived'));
    });
    expect(view.getByTestId('client-row-client-agenda-lea')).toBeTruthy();

    // A query with no archived match: the usual search empty state, tabs kept.
    await act(async () => {
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'introuvable');
    });
    expect(view.getByText('Aucun client trouvé')).toBeTruthy();
    expect(view.getByTestId('client-tabs')).toBeTruthy();
  });

  it('drops the tabs when the last archived Client is restored, back on Actifs', async () => {
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
      fireEvent.changeText(view.getByPlaceholderText('Rechercher un client'), 'léa martin');
    });
    expect(view.getByTestId('client-row-client-agenda-lea')).toBeTruthy();
    expect(view.queryByText('Archivé')).toBeNull();
  });
});

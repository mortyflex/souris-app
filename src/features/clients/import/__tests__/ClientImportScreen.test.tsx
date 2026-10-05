// Souris — « Importer ma clientèle » screen (fictional data only)

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import type { Client } from '@/domain/clients';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import type { FirstRunSeed } from '@/persistence/seed';
import { bindLocalDatabaseToBusiness } from '@/persistence/stores/business-profile';
import * as clientStore from '@/persistence/stores/clients';
import { countSyncOutboxRows } from '@/persistence/sync/outbox';
import { createTestSeed, remoteBusinessProfile } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';

import { ClientSessionProvider, useClientSession } from '../../session/ClientSessionProvider';
import { ClientImportScreen } from '../ClientImportScreen';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

// The latest removal guard of the screen: a test plays the native back
// gesture / hardware back by calling it while it is enabled.
const mockRemovalGuard: { enabled: boolean; onPrevent: () => void } = { enabled: false, onPrevent: () => {} };

jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (enabled: boolean, onPrevent: () => void) => {
    mockRemovalGuard.enabled = enabled;
    mockRemovalGuard.onPrevent = onPrevent;
  },
}));

/** A native back attempt: prevented (the callback runs) or let through (the route leaves). */
async function nativeBack() {
  await act(async () => {
    if (mockRemovalGuard.enabled) mockRemovalGuard.onPrevent();
    else mockBack();
  });
}

jest.mock('expo-symbols', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return { SymbolView: () => React.createElement(React.Fragment, null) };
});

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const sophie: Client = { id: 'client-sophie', firstName: 'Sophie', lastName: 'Martin', phone: '06 12 34 56 78' };
const archivedEmma: Client = {
  id: 'client-emma',
  firstName: 'Emma',
  lastName: 'Durand',
  phone: '07 11 22 33 44',
  archivedAt: new Date('2026-05-01T10:00:00.000Z'),
};

const seed = (): FirstRunSeed => createTestSeed({ clients: [sophie, archivedEmma], appointments: [] });

function openBoundDatabase(): SourisDatabase {
  const db = openTestDatabase();
  bootstrapPersistence(db, seed);
  bindLocalDatabaseToBusiness(db, remoteBusinessProfile);
  return db;
}

function SessionProbe() {
  const { clients } = useClientSession();
  return <Text testID="session-client-count">{clients.length}</Text>;
}

type Rendered = Awaited<ReturnType<typeof render>>;

async function renderImport(db = openBoundDatabase()) {
  const view = await render(
    <TestPersistenceProvider createSeed={seed} database={db}>
      <ClientSessionProvider>
        <ClientImportScreen />
        <SessionProbe />
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
  return { view, db };
}

async function press(view: Rendered, testID: string) {
  await act(async () => fireEvent.press(view.getByTestId(testID)));
}

async function pasteAndAnalyze(view: Rendered, text: string) {
  await act(async () => fireEvent.changeText(view.getByTestId('client-import-paste-input'), text));
  await press(view, 'client-import-analyze');
}

function sessionCount(view: Rendered): number {
  return Number(view.getByTestId('session-client-count').props.children);
}

const PASTED = [
  'Nadia Benali 07 45 67 89 12',
  'Lina 06 55 44 33 22 anniv 12/04',
  'Sophie Martin 0612345678',
  'Emma Durand +33 7 11 22 33 44',
  'Sophie MARTIN 06 00 00 00 01',
  '06 99 88 77 66',
].join('\n');

describe('ClientImportScreen', () => {
  beforeEach(() => {
    mockBack.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens straight on the paste step while paste is the only source, without the source choice', async () => {
    const { view } = await renderImport();

    expect(view.getByRole('header', { name: 'Importer ma clientèle' })).toBeTruthy();
    expect(view.getByText('Collez une liste de clients')).toBeTruthy();
    expect(view.getByTestId('client-import-paste-input')).toBeTruthy();
    expect(view.queryByText('Coller une liste')).toBeNull();
    expect(view.queryByTestId('client-import-source-paste')).toBeNull();
  });

  it('keeps « Analyser la liste » disabled for empty or whitespace-only text', async () => {
    const { view } = await renderImport();

    const analyze = () => view.getByTestId('client-import-analyze');
    expect(analyze().props.accessibilityState.disabled).toBe(true);
    await act(async () => fireEvent.changeText(view.getByTestId('client-import-paste-input'), '  \n \n'));
    expect(analyze().props.accessibilityState.disabled).toBe(true);
    await act(async () => fireEvent.changeText(view.getByTestId('client-import-paste-input'), 'Sophie'));
    expect(analyze().props.accessibilityState.disabled).toBe(false);
  });

  it('says so when the text holds nobody, and stays on the paste step', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(view, '12 34');

    expect(view.getByText('Aucun client détecté dans ce texte.')).toBeTruthy();
    expect(view.queryByTestId('client-import-detected')).toBeNull();
  });

  it('parses into the review with its counts and default selections', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(view, PASTED);

    expect(view.getByTestId('client-import-detected')).toHaveTextContent('6 clients détectés');
    expect(view.getByTestId('client-import-segment-new')).toHaveTextContent(/Nouveaux.*2/);
    expect(view.getByTestId('client-import-segment-duplicates')).toHaveTextContent(/Doublons.*3/);
    expect(view.getByTestId('client-import-segment-to-fix')).toHaveTextContent(/À corriger.*1/);
    // The compact density keeps the three counted labels on one line on a phone.
    expect(StyleSheet.flatten(view.getByTestId('client-import-segment-to-fix').props.style)).toMatchObject({
      paddingHorizontal: 6,
    });

    // Nouveaux: both ticked, the birthday shown.
    expect(view.getByTestId('client-import-check-paste-1').props.accessibilityState.checked).toBe(true);
    expect(view.getByTestId('client-import-check-paste-2').props.accessibilityState.checked).toBe(true);
    expect(view.getByText('Anniversaire : 12 avril')).toBeTruthy();
    expect(view.getByTestId('client-import-confirm')).toHaveTextContent('Importer 2 clients');
  });

  it('skips duplicates: exact ones folded and inspectable (archived named), possible ones opt-in', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(view, PASTED);
    await press(view, 'client-import-segment-duplicates');

    // Possible duplicate: same name as Sophie Martin, skipped until « Importer quand même ».
    expect(view.getByTestId('client-import-match-paste-5')).toHaveTextContent('Même nom que Sophie Martin');
    expect(view.queryByTestId('client-import-check-paste-5')).toBeNull();
    // Exact duplicates are folded.
    expect(view.getByTestId('client-import-exact-summary')).toHaveTextContent(/^2 doublons détectés — ignorés/);
    expect(view.queryByTestId('client-import-row-paste-3')).toBeNull();

    await press(view, 'client-import-exact-summary');
    expect(view.getByTestId('client-import-match-paste-3')).toHaveTextContent('Même numéro que Sophie Martin');
    expect(view.getByTestId('client-import-match-paste-4')).toHaveTextContent('Même numéro que Emma Durand (archivé)');
    // No way to import an exact duplicate.
    expect(view.queryByTestId('client-import-force-paste-3')).toBeNull();

    await press(view, 'client-import-force-paste-5');
    expect(view.getByTestId('client-import-force-paste-5')).toHaveTextContent(/Ne pas importer/);
    expect(view.getByTestId('client-import-confirm')).toHaveTextContent('Importer 3 clients');
  });

  it('unticks a new client and updates the button count', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(view, PASTED);

    await press(view, 'client-import-check-paste-1');
    expect(view.getByTestId('client-import-confirm')).toHaveTextContent('Importer 1 client');
    await press(view, 'client-import-check-paste-2');
    expect(view.getByTestId('client-import-confirm')).toHaveTextContent('Aucun client sélectionné');
    expect(view.getByTestId('client-import-confirm').props.accessibilityState.disabled).toBe(true);
  });

  it('corrects an invalid candidate in staging, which reclassifies it at once', async () => {
    const { view, db } = await renderImport();
    await pasteAndAnalyze(view, PASTED);
    await press(view, 'client-import-segment-to-fix');

    expect(within(view.getByTestId('client-import-row-paste-6')).getByText('⚠︎ Prénom manquant')).toBeTruthy();
    await press(view, 'client-import-edit-paste-6');
    expect(view.getByTestId('client-import-candidate-sheet')).toBeTruthy();
    expect(within(view.getByTestId('client-import-candidate-source')).getByText('06 99 88 77 66')).toBeTruthy();
    await act(async () => fireEvent.changeText(view.getByLabelText('Prénom'), 'Inès'));
    await press(view, 'client-import-candidate-save');

    expect(view.getByTestId('client-import-segment-to-fix')).toHaveTextContent(/À corriger.*0/);
    expect(view.getByTestId('client-import-segment-new')).toHaveTextContent(/Nouveaux.*3/);
    expect(view.getByTestId('client-import-confirm')).toHaveTextContent('Importer 3 clients');
    // Staging only: nothing written yet.
    expect(countSyncOutboxRows(db)).toBe(0);
    expect(sessionCount(view)).toBe(2);
  });

  it('imports the selected clients, each with its CLIENT outbox entry for the existing sync runner', async () => {
    const { view, db } = await renderImport();
    await pasteAndAnalyze(view, PASTED);

    await press(view, 'client-import-confirm');

    expect(view.getByTestId('client-import-result-title')).toHaveTextContent('2 clients importés');
    expect(view.queryByTestId('client-import-retry')).toBeNull();
    expect(sessionCount(view)).toBe(4);
    const stored = clientStore.loadClients(db);
    expect(stored.map((client) => client.firstName)).toEqual(['Sophie', 'Emma', 'Nadia', 'Lina']);
    expect(stored[3]).toMatchObject({ phone: '06 55 44 33 22', birthday: { month: 4, day: 12 } });
    expect(stored[3]).not.toHaveProperty('smsMarketingConsent');
    expect(countSyncOutboxRows(db)).toBe(2);

    await press(view, 'client-import-done');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('confirms the imported clients in a light summary, never the skipped duplicates', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(view, PASTED);

    await press(view, 'client-import-confirm');

    expect(view.getByTestId('client-import-result-title')).toHaveTextContent('2 clients importés');
    const list = within(view.getByTestId('client-import-result-list'));
    expect(list.getAllByText(/.+/).map((text) => text.props.children)).toEqual([
      'Nadia Benali',
      '07 45 67 89 12',
      'Lina',
      '06 55 44 33 22',
    ]);
    // Exact and possible duplicates were skipped: absent from the summary.
    expect(list.queryByText('Sophie Martin')).toBeNull();
    expect(list.queryByText('Sophie MARTIN')).toBeNull();
    expect(list.queryByText('Emma Durand')).toBeNull();
  });

  it('shows the final corrected values with one secondary line only when there is something to show', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(
      view,
      // The blank line keeps the lone number its own (nameless) candidate.
      'Maya Dupont anniv 14/05\nNina nina@example.com\nLina 06 11 22 33 44 lina@example.com\nZoé\n\n06 99 88 77 66',
    );
    // Correct the nameless line in staging before importing.
    await press(view, 'client-import-segment-to-fix');
    await press(view, 'client-import-edit-paste-5');
    await act(async () => fireEvent.changeText(view.getByLabelText('Prénom'), 'Inès'));
    await press(view, 'client-import-candidate-save');

    await press(view, 'client-import-confirm');

    expect(view.getByTestId('client-import-result-title')).toHaveTextContent('5 clients importés');
    expect(
      within(view.getByTestId('client-import-result-list'))
        .getAllByText(/.+/)
        .map((text) => text.props.children),
    ).toEqual([
      'Maya Dupont',
      'Anniversaire : 14 mai',
      'Nina',
      'nina@example.com',
      'Lina',
      '06 11 22 33 44 · lina@example.com',
      'Zoé',
      'Inès',
      '06 99 88 77 66',
    ]);

    await press(view, 'client-import-done');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('refreshes the review instead of importing when stored clients changed meanwhile', async () => {
    const { view, db } = await renderImport();
    await pasteAndAnalyze(view, PASTED);
    // Sync brought Nadia in while the review was open.
    clientStore.insertClient(db, { id: 'client-nadia', firstName: 'Nadia', phone: '+33745678912' });

    await press(view, 'client-import-confirm');

    expect(view.getByTestId('client-import-refreshed')).toBeTruthy();
    expect(view.getByTestId('client-import-confirm')).toHaveTextContent('Importer 1 client');
    await press(view, 'client-import-confirm');
    expect(view.getByTestId('client-import-result-title')).toHaveTextContent('1 client importé');
    expect(within(view.getByTestId('client-import-result-list')).getByText('Lina')).toBeTruthy();
    expect(within(view.getByTestId('client-import-result-list')).queryByText('Nadia Benali')).toBeNull();
  });

  it('presents a partial import and retries the rest without duplicates', async () => {
    const originalInsert = clientStore.insertClients;
    const insertSpy = jest
      .spyOn(clientStore, 'insertClients')
      .mockImplementationOnce(originalInsert)
      .mockImplementationOnce(() => {
        throw new Error('SQLITE_FULL');
      });
    // Letters-only fictional first names (a word with digits is not a name).
    const letters = (index: number) =>
      String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(97 + (index % 26));
    const lines = Array.from(
      { length: 150 },
      (_, index) => `Lou${letters(index)} 06 ${String(10_000_000 + index).replace(/(\d{2})(?=\d)/g, '$1 ')}`,
    );
    const { view, db } = await renderImport();
    await pasteAndAnalyze(view, lines.join('\n'));
    expect(view.getByTestId('client-import-confirm')).toHaveTextContent('Importer 150 clients');

    await press(view, 'client-import-confirm');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(view.getByTestId('client-import-result-title')).toHaveTextContent('100 clients importés');
    expect(view.getByTestId('client-import-result-failed')).toHaveTextContent(
      '50 clients n’ont pas pu être importés',
    );
    expect(view.getByTestId('client-import-result-message')).toHaveTextContent(
      'L’enregistrement a échoué. Vos clients déjà importés sont conservés.',
    );
    expect(view.queryByText(/SQLITE/)).toBeNull();
    expect(clientStore.loadClients(db)).toHaveLength(102);

    await press(view, 'client-import-retry');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(view.getByTestId('client-import-result-title')).toHaveTextContent('150 clients importés');
    expect(view.queryByTestId('client-import-retry')).toBeNull();
    expect(clientStore.loadClients(db)).toHaveLength(152);
    expect(countSyncOutboxRows(db)).toBe(150);
    expect(sessionCount(view)).toBe(152);
    insertSpy.mockRestore();
  });

  it('asks before leaving a staged review from the back button', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(view, PASTED);

    await press(view, 'client-import-back');

    expect(view.getByTestId('client-import-discard-dialog')).toBeTruthy();
    expect(view.getByText('Quitter l’import ?')).toBeTruthy();
    expect(view.getByText('Les informations analysées et vos corrections seront perdues.')).toBeTruthy();
    expect(view.getByText('Continuer l’import')).toBeTruthy();
    expect(view.getByText('Quitter')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('asks the same way for the native back gesture or hardware back', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(view, PASTED);

    expect(mockRemovalGuard.enabled).toBe(true);
    await nativeBack();

    expect(view.getByTestId('client-import-discard-dialog')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('stays in the review, corrections intact, when the professional continues', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(view, PASTED);
    await press(view, 'client-import-segment-to-fix');
    await press(view, 'client-import-edit-paste-6');
    await act(async () => fireEvent.changeText(view.getByLabelText('Prénom'), 'Inès'));
    await press(view, 'client-import-candidate-save');

    await press(view, 'client-import-back');
    await press(view, 'client-import-keep');

    expect(view.queryByTestId('client-import-discard-dialog')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
    expect(view.getByTestId('client-import-detected')).toHaveTextContent('6 clients détectés');
    expect(view.getByTestId('client-import-segment-new')).toHaveTextContent(/Nouveaux.*3/);
    expect(view.getByTestId('client-import-confirm')).toHaveTextContent('Importer 3 clients');
  });

  it('leaves the import once the professional confirms, without asking again', async () => {
    const { view, db } = await renderImport();
    await pasteAndAnalyze(view, PASTED);

    await nativeBack();
    await press(view, 'client-import-discard');

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockRemovalGuard.enabled).toBe(false);
    // Memory-only staging: nothing was written.
    expect(countSyncOutboxRows(db)).toBe(0);
  });

  it('leaves the import from the initial paste step at once, with no hidden source step and no dialog', async () => {
    const { view } = await renderImport();

    expect(mockRemovalGuard.enabled).toBe(false);
    await press(view, 'client-import-back');

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Coller une liste')).toBeNull();
    expect(view.queryByTestId('client-import-discard-dialog')).toBeNull();
  });

  it('keeps blocking any exit while the import runs, without the discard dialog', async () => {
    const letters = (index: number) =>
      String.fromCharCode(65 + Math.floor(index / 26)) + String.fromCharCode(97 + (index % 26));
    const lines = Array.from(
      { length: 150 },
      (_, index) => `Lou${letters(index)} 06 ${String(20_000_000 + index).replace(/(\d{2})(?=\d)/g, '$1 ')}`,
    );
    // Fake timers hold the run on its yield between two chunks.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    const { view } = await renderImport();
    await pasteAndAnalyze(view, lines.join('\n'));

    await act(async () => fireEvent.press(view.getByTestId('client-import-confirm')));
    // The first chunk is written; the run yields before the second one.
    expect(view.getByTestId('client-import-progress')).toBeTruthy();
    expect(mockRemovalGuard.enabled).toBe(true);
    expect(view.getByTestId('client-import-back').props.accessibilityState.disabled).toBe(true);
    await nativeBack();
    expect(view.queryByTestId('client-import-discard-dialog')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(10);
    });
    expect(view.getByTestId('client-import-result-title')).toHaveTextContent('150 clients importés');
  });

  it('asks nothing once the import is complete', async () => {
    const { view } = await renderImport();
    await pasteAndAnalyze(view, PASTED);
    await press(view, 'client-import-confirm');
    expect(view.getByTestId('client-import-result')).toBeTruthy();

    expect(mockRemovalGuard.enabled).toBe(false);
    await nativeBack();
    await press(view, 'client-import-back');

    expect(view.queryByTestId('client-import-discard-dialog')).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(2);
  });
});

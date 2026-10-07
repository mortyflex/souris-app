// BeautIzzy — Estimation tarifaire integration test
//
// Runs the real sheet over the development seed (synthetic address book,
// pilot catalog, Agenda fixtures) in an in-memory SQLite database. Proves:
// - exactly Prestations → Résumé: no Client step, search, list, creation or
//   heading — the sheet runs WITHOUT any Client session at all;
// - Services and Techniques are selected from the shared catalogue, at their
//   CURRENT catalog price, and totalled as « Total estimé »;
// - « Générer l’estimation » prints the document through the shared receipt
//   printer and writes NOTHING: every table of the database — Clients,
//   Appointments, Sales, payments, deposits, stock, sync outbox — is
//   byte-for-byte the same;
// - Fermer / Enregistrer / Partager reuse the shared export boundary.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import { PixelRatio, Pressable, StyleSheet, Text } from 'react-native';

import { eurosToCents, formatCompactEuroCents } from '@/shared/lib/money';
import { haptics } from '@/shared/lib/haptics';
import { receiptPrint, spacing } from '@/shared/ui/theme';
import type { SourisDatabase } from '@/persistence/database';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { usePersistence } from '@/providers/PersistenceProvider';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { ServiceCatalogProvider, useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';

import { EstimationCreationScreen } from '../EstimationCreationScreen';
import { ESTIMATION_SAVED } from '../EstimationTicket';
import {
  INSIGHTS_SHARE_BACKGROUND,
  INSIGHTS_SHARE_CARD_SIZE,
  INSIGHTS_SHARE_IMAGE_SIZE,
} from '@/features/insights/BusinessInsightsShareCard';
import { SHARE_CARD_BACKGROUND } from '@/shared/ui/ShareCardCanvas';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

// Native image capture, share sheet and Photos: the shared export boundary, observed.
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));
const mockMediaLibrary = jest.requireMock('expo-media-library') as {
  readonly requestPermissionsAsync: jest.Mock;
  readonly Asset: { readonly create: jest.Mock };
};
const mockViewShot = jest.requireMock('react-native-view-shot') as {
  readonly captureRef: jest.Mock;
  readonly releaseCapture: jest.Mock;
};
const mockSharing = jest.requireMock('expo-sharing') as {
  readonly isAvailableAsync: jest.Mock;
  readonly shareAsync: jest.Mock;
};

// The shared presentation components, observed (real rendering kept).
jest.mock('@/shared/ui/ReceiptPaper', () => {
  const actual = jest.requireActual('@/shared/ui/ReceiptPaper');
  return { ...actual, ReceiptPaper: jest.fn(actual.ReceiptPaper) };
});
jest.mock('@/shared/ui/ShareCardCanvas', () => {
  const actual = jest.requireActual('@/shared/ui/ShareCardCanvas');
  return { ...actual, ShareCardCanvas: jest.fn(actual.ShareCardCanvas) };
});
const mockReceiptPaper = jest.requireMock('@/shared/ui/ReceiptPaper').ReceiptPaper as jest.Mock;
const mockShareCardCanvas = jest.requireMock('@/shared/ui/ShareCardCanvas').ShareCardCanvas as jest.Mock;

jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { readonly children?: React.ReactNode }) =>
      React.createElement(View, props, children),
  };
});

const BRUSHING = 'service-brushing-brushing-1';
const BALAYAGE = 'technique-balayage-balayage-1';
const HIDDEN = { includeHiddenElements: true } as const;

/** The current catalog values of the two Services the tests pick. */
function CatalogProbe() {
  const { getServiceById } = useServiceCatalog();
  const { database, reloadSnapshot } = usePersistence();
  return (
    <>
      <Text testID="catalog-brushing">{String(getServiceById(BRUSHING)?.price)}</Text>
      <Text testID="catalog-balayage">{String(getServiceById(BALAYAGE)?.price)}</Text>
      <Pressable
        testID="reprice-balayage"
        onPress={() => {
          database.runSync(`UPDATE services SET price_cents = 6150 WHERE id = '${BALAYAGE}'`);
          reloadSnapshot();
        }}
      />
    </>
  );
}

// No ClientSessionProvider: the flow cannot even reach the Client session.
function renderEstimation(database: SourisDatabase) {
  return render(
    <TestPersistenceProvider database={database}>
      <ServiceCatalogProvider>
        <EstimationCreationScreen />
        <CatalogProbe />
      </ServiceCatalogProvider>
    </TestPersistenceProvider>,
  );
}

type View = Awaited<ReturnType<typeof renderEstimation>>;

/** Every row of every table, in a stable order: the whole persisted state. */
function dumpDatabase(database: SourisDatabase): string {
  const tables = database
    .getAllSync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .map(({ name }) => name);
  return JSON.stringify(
    tables.map((table) => [
      table,
      database
        .getAllSync<Record<string, unknown>>(`SELECT * FROM ${table}`)
        .map((row) => JSON.stringify(row))
        .sort(),
    ]),
  );
}

function dumpTable(database: SourisDatabase, table: string): string {
  return JSON.stringify(
    database.getAllSync<Record<string, unknown>>(`SELECT * FROM ${table}`).map((row) => JSON.stringify(row)).sort(),
  );
}

function count(database: SourisDatabase, table: string): number {
  return database.getFirstSync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n;
}

function sum(database: SourisDatabase, sql: string): number {
  return database.getFirstSync<{ n: number | null }>(sql)!.n ?? 0;
}

function operationalFigures(database: SourisDatabase) {
  return {
    clients: count(database, 'clients'),
    appointments: count(database, 'appointments'),
    appointmentItems: count(database, 'appointment_items'),
    sales: count(database, 'sales'),
    deposits: count(database, 'appointment_deposits'),
    paidAppointments: count(database, 'appointments WHERE paid_at IS NOT NULL'),
    paidSales: count(database, 'sales WHERE paid_at IS NOT NULL'),
    stock: sum(database, 'SELECT SUM(stock_quantity) AS n FROM products'),
    // What the Caisse adds up: checkouts, paid Sales and deposits.
    cashed:
      sum(database, 'SELECT SUM(COALESCE(card_amount_cents, 0) + COALESCE(cash_amount_cents, 0)) AS n FROM appointments') +
      sum(database, 'SELECT SUM(COALESCE(card_amount_cents, 0) + COALESCE(cash_amount_cents, 0)) AS n FROM sales') +
      sum(database, "SELECT SUM(amount_cents) AS n FROM appointment_deposits WHERE status = 'ACTIVE'"),
    outbox: count(database, 'sync_outbox'),
  };
}

async function press(view: View, testID: string) {
  await act(async () => {
    fireEvent.press(view.getByTestId(testID));
  });
}

async function continueStep(view: View) {
  await act(async () => {
    fireEvent.press(view.getByText('Continuer'));
  });
}

// The catalogue shows ONE category at a time: open the segment holding the card.
async function toggleService(view: View, name: string) {
  const card = { name: new RegExp(`^${name}, `) };
  for (const tab of ['catalog-category-SERVICE', 'catalog-category-TECHNIQUE']) {
    if (view.queryByRole('button', card)) break;
    await press(view, tab);
  }
  await act(async () => {
    fireEvent.press(view.getByRole('button', card));
  });
}

async function reachSummary(view: View) {
  await toggleService(view, 'Brushing 1');
  await toggleService(view, 'Balayage 1');
  await continueStep(view);
}

function price(view: View, testID: string): number {
  return Number(view.getByTestId(testID).props.children);
}

async function generate(view: View) {
  await act(async () => {
    fireEvent.press(view.getByText('Générer l’estimation'));
  });
  // The export copy measures itself: its height is the image height.
  await act(async () => {
    // The share canvas is at least the 9:16 story: 640 dp for an ordinary estimation.
    fireEvent(view.getByTestId('estimation-export-canvas', HIDDEN), 'layout', {
      nativeEvent: { layout: { height: 640, width: 360, x: 0, y: 0 } },
    });
  });
}

describe('EstimationCreationScreen', () => {
  let database: SourisDatabase;

  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 8, 24, 10, 0));
    mockBack.mockClear();
    database = openTestDatabase();
    mockViewShot.captureRef.mockReset().mockResolvedValue('/tmp/ReactNative/estimation.png');
    mockViewShot.releaseCapture.mockReset();
    mockSharing.isAvailableAsync.mockReset().mockResolvedValue(true);
    mockSharing.shareAsync.mockReset().mockResolvedValue(undefined);
    mockMediaLibrary.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true, status: 'granted' });
    mockMediaLibrary.Asset.create.mockReset().mockResolvedValue({ id: 'asset-1' });
  });

  it('opens on Prestations and walks exactly Prestations → Résumé → Générer l’estimation, with no Client anywhere', async () => {
    const view = await renderEstimation(database);

    // Two steps only: the stepper names them and counts them.
    expect(view.getByText('Estimation')).toBeTruthy();
    expect(view.getByLabelText('Étape 1 sur 2')).toBeTruthy();
    expect(view.getByLabelText('Prestations — étape en cours')).toBeTruthy();
    expect(view.getByLabelText('Résumé — à venir')).toBeTruthy();
    // No Client step, search, list, creation or heading.
    expect(view.queryByLabelText(/^Client/)).toBeNull();
    expect(view.queryByText('Client')).toBeNull();
    expect(view.queryByPlaceholderText('Rechercher un client')).toBeNull();
    expect(view.queryByTestId('client-picker-list')).toBeNull();
    expect(view.queryByText('Ajouter un client')).toBeNull();
    expect(view.queryByTestId('add-client-picker')).toBeNull();
    // Straight into the catalogue.
    expect(view.getByPlaceholderText('Rechercher une prestation')).toBeTruthy();
    expect(view.getByTestId('estimation-context-heading').props.children).toBe('ESTIMATION');
    expect(view.getByTestId('estimation-primary').props.accessibilityState).toMatchObject({ disabled: true });

    await toggleService(view, 'Brushing 1');
    await toggleService(view, 'Balayage 1');
    expect(view.getByTestId('estimation-selection-count').props.children).toBe('2 prestations sélectionnées');
    // The eyebrow never becomes a person's name.
    expect(view.getByTestId('estimation-context-heading').props.children).toBe('ESTIMATION');
    await continueStep(view);

    expect(view.getByLabelText('Étape 2 sur 2')).toBeTruthy();
    expect(view.getByLabelText('Prestations — terminée')).toBeTruthy();
    expect(view.getByLabelText('Résumé — étape en cours')).toBeTruthy();
    expect(view.queryByText(/\bclient/i)).toBeNull();
    expect(view.getByText('Générer l’estimation')).toBeTruthy();

    // Back to Prestations keeps the selection, through « Précédent »…
    await act(async () => {
      fireEvent.press(view.getByText('Précédent'));
    });
    expect(view.getByLabelText('Prestations — étape en cours')).toBeTruthy();
    expect(view.getByTestId('estimation-selection-count').props.children).toBe('2 prestations sélectionnées');
    await continueStep(view);
    // …and through the stepper.
    await act(async () => {
      fireEvent.press(view.getByLabelText('Prestations — terminée'));
    });
    expect(view.getByTestId('estimation-selection-names').props.children).toBe('Brushing 1 · Balayage 1');
    await continueStep(view);

    await generate(view);
    expect(view.getByTestId('estimation-document-paper')).toBeTruthy();
  });

  it('prices Services and Techniques at their current catalog price, totalled as « Total estimé »', async () => {
    const view = await renderEstimation(database);
    await reachSummary(view);

    const brushing = price(view, 'catalog-brushing');
    const balayage = price(view, 'catalog-balayage');
    const summary = within(view.getByTestId('estimation-summary'));
    expect(summary.getByLabelText(`Brushing 1, ${formatCompactEuroCents(eurosToCents(brushing))}`)).toBeTruthy();
    expect(summary.getByLabelText(`Balayage 1, ${formatCompactEuroCents(eurosToCents(balayage))}`)).toBeTruthy();
    const total = formatCompactEuroCents(eurosToCents(brushing) + eurosToCents(balayage));
    expect(view.getByTestId('estimation-summary-total').props.accessibilityLabel).toBe(`Total estimé, ${total}`);
    expect(summary.getByText('24 septembre 2026')).toBeTruthy();
    expect(summary.queryByText(/\bclient/i)).toBeNull();
    // A Technique is one commercial line: no phase, no pose time.
    expect(summary.queryByText(/pose|Application|Temps/i)).toBeNull();
    // No formal quote wording anywhere in the review.
    expect(view.queryByText(/devis|valable|TVA|HT\b|TTC/i)).toBeNull();

    // A catalog price change reaches the estimation at once: no copy is kept.
    await press(view, 'reprice-balayage');
    expect(summary.getByLabelText(`Balayage 1, ${formatCompactEuroCents(6150)}`)).toBeTruthy();
    expect(view.getByTestId('estimation-summary-total').props.accessibilityLabel).toBe(
      `Total estimé, ${formatCompactEuroCents(eurosToCents(brushing) + 6150)}`,
    );
  });

  it('prints the estimation document and writes nothing at all', async () => {
    const view = await renderEstimation(database);
    const figuresBefore = operationalFigures(database);
    const clientsBefore = dumpTable(database, 'clients');
    const seeded = dumpDatabase(database);
    expect(count(database, 'clients')).toBeGreaterThan(0); // a real address book
    await reachSummary(view);
    const brushing = price(view, 'catalog-brushing');
    const balayage = price(view, 'catalog-balayage');

    await generate(view);

    const paper = within(view.getByTestId('estimation-document-paper'));
    expect(paper.getByTestId('estimation-document-title').props.children).toBe('ESTIMATION TARIFAIRE');
    expect(paper.getByTestId('estimation-document-business').props.children).toBe('Maison Léa');
    expect(paper.getByTestId('estimation-document-date').props.children).toBe('24 septembre 2026');
    // Recipient-agnostic: no Client name, no « Client » / « Pour » section.
    expect(paper.queryByTestId('estimation-document-client')).toBeNull();
    expect(paper.queryByText(/client|^Pour\b|destinataire/i)).toBeNull();
    expect(paper.getByLabelText(`Brushing 1, ${formatCompactEuroCents(eurosToCents(brushing))}`)).toBeTruthy();
    expect(paper.getByLabelText(`Balayage 1, ${formatCompactEuroCents(eurosToCents(balayage))}`)).toBeTruthy();
    expect(paper.getByTestId('estimation-document-total').props.accessibilityLabel).toBe(
      `Total estimé, ${formatCompactEuroCents(eurosToCents(brushing) + eurosToCents(balayage))}`,
    );
    expect(paper.getByText('Estimation indicative basée sur les prestations sélectionnées.')).toBeTruthy();
    expect(paper.getByText('Créé avec')).toBeTruthy();
    expect(paper.getByLabelText('Créé avec BeautIzzy')).toBeTruthy();
    expect(paper.queryByText(/devis|valable|signature|bon pour accord|TVA|\bHT\b|TTC/i)).toBeNull();

    // Nothing was written by the review, nor by the generation.
    expect(count(database, 'appointments')).toBeGreaterThan(0); // a real, seeded database
    expect(dumpDatabase(database)).toBe(seeded);
    expect(operationalFigures(database)).toEqual(figuresBefore);
    expect(dumpTable(database, 'clients')).toBe(clientsBefore);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('feeds a receipt ticket out of the printer, like « Tops & tendances », never the share canvas', async () => {
    mockReceiptPaper.mockClear();
    const view = await renderEstimation(database);
    await reachSummary(view);
    await generate(view);

    // The printer-visible paper is the shared torn-edge ReceiptPaper…
    const ticketCalls = mockReceiptPaper.mock.calls.map(([props]) => props as { testID?: string });
    expect(ticketCalls.some((props) => props.testID === 'estimation-document-paper')).toBe(true);
    const ticket = view.getByTestId('estimation-document-paper');
    expect(within(ticket).getByTestId('estimation-document-title').props.children).toBe('ESTIMATION TARIFAIRE');
    // …holding the interior, never the export canvas or frame.
    expect(within(ticket).queryByTestId('estimation-export-canvas', HIDDEN)).toBeNull();
    expect(within(ticket).queryByTestId('estimation-export-frame', HIDDEN)).toBeNull();
    // The export composition lives off screen, outside the ticket.
    expect(within(view.getByTestId('estimation-offstage', HIDDEN)).getByTestId('estimation-export-frame', HIDDEN)).toBeTruthy();
  });

  it('exports through the SAME share canvas as « Tops & tendances »: 1080 × 1920 for an ordinary estimation', async () => {
    mockShareCardCanvas.mockClear();
    const view = await renderEstimation(database);
    await reachSummary(view);
    await generate(view);

    // The shared canvas, growable — Tops & tendances uses the same one, fixed.
    const canvasCalls = mockShareCardCanvas.mock.calls.map(([props]) => props as { height?: string; testID?: string });
    expect(canvasCalls.some((props) => props.testID === 'estimation-export-canvas' && props.height === 'growable')).toBe(true);
    const frame = view.getByTestId('estimation-export-frame', HIDDEN);
    const canvas = within(frame).getByTestId('estimation-export-canvas', HIDDEN);
    expect(within(canvas).getByTestId('estimation-export-document', HIDDEN)).toBeTruthy();
    // Same ground, same geometry, same margins as the Tops & tendances card.
    expect(StyleSheet.flatten(frame.props.style).backgroundColor).toBe(SHARE_CARD_BACKGROUND);
    expect(StyleSheet.flatten(canvas.props.style)).toMatchObject({
      backgroundColor: INSIGHTS_SHARE_BACKGROUND,
      width: INSIGHTS_SHARE_CARD_SIZE.width,
      minHeight: INSIGHTS_SHARE_CARD_SIZE.height,
      paddingBottom: spacing['3xl'] + spacing.base,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing['3xl'] + spacing.lg,
    });
    expect(StyleSheet.flatten(canvas.props.style).borderRadius).toBeUndefined();

    await press(view, 'estimation-save');
    // The capture is exactly the Tops & tendances image: 1080 × 1920 px.
    const ratio = PixelRatio.get();
    expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
      width: INSIGHTS_SHARE_IMAGE_SIZE.width / ratio,
      height: INSIGHTS_SHARE_IMAGE_SIZE.height / ratio,
    });
    const [target] = mockViewShot.captureRef.mock.calls[0] as [{ current: { props: { testID?: string } } }];
    expect(target.current.props.testID).toBe('estimation-export-frame');
  });

  it('closes through « Fermer », then leaves the sheet, without writing anything', async () => {
    const view = await renderEstimation(database);
    await reachSummary(view);
    const seeded = dumpDatabase(database);
    await generate(view);

    expect(view.getByTestId('estimation-close').props.accessibilityLabel).toBe('Fermer');
    await press(view, 'estimation-close');
    expect(mockBack).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(receiptPrint.dismiss);
    });
    expect(view.queryByTestId('estimation-document-paper')).toBeNull();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockViewShot.captureRef).not.toHaveBeenCalled();
    expect(mockMediaLibrary.Asset.create).not.toHaveBeenCalled();
    expect(dumpDatabase(database)).toBe(seeded);
  });

  it('saves the whole document to Photos through the shared save flow', async () => {
    const success = jest.spyOn(haptics, 'success');
    const view = await renderEstimation(database);
    await reachSummary(view);
    const seeded = dumpDatabase(database);
    await generate(view);

    const save = view.getByTestId('estimation-save');
    expect(save.props.accessibilityLabel).toBe('Enregistrer l’image');
    await press(view, 'estimation-save');

    expect(mockMediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, ['photo']);
    expect(mockViewShot.captureRef).toHaveBeenCalledTimes(1);
    const [target, options] = mockViewShot.captureRef.mock.calls[0] as [
      { current: { props: { testID?: string } } },
      Record<string, unknown>,
    ];
    // The dedicated off-screen export frame, never the on-screen paper.
    expect(target.current.props.testID).toBe('estimation-export-frame');
    expect(options).toMatchObject({ format: 'png', result: 'tmpfile' });
    expect(mockMediaLibrary.Asset.create).toHaveBeenCalledWith('file:///tmp/ReactNative/estimation.png');
    expect(view.getByTestId('estimation-notice').props.children).toBe(ESTIMATION_SAVED);
    expect(success).toHaveBeenCalledTimes(1);
    // Still open: the professional may share it too.
    expect(view.getByTestId('estimation-document-paper')).toBeTruthy();
    expect(dumpDatabase(database)).toBe(seeded);
    success.mockRestore();
  });

  it('shares the document image through the shared share flow', async () => {
    const view = await renderEstimation(database);
    await reachSummary(view);
    await generate(view);

    const share = view.getByTestId('estimation-share');
    expect(share.props.accessibilityLabel).toBe('Partager');
    await press(view, 'estimation-share');

    expect(mockSharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(mockSharing.shareAsync).toHaveBeenCalledWith('file:///tmp/ReactNative/estimation.png', {
      dialogTitle: 'Partager l’estimation',
      mimeType: 'image/png',
      UTI: 'public.png',
    });
    expect(mockViewShot.releaseCapture).toHaveBeenCalledWith('/tmp/ReactNative/estimation.png');
    expect(view.queryByTestId('estimation-notice')).toBeNull();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('exports a long estimation whole: every line, at the measured height', async () => {
    const view = await renderEstimation(database);
    const names = ['Brushing 1', 'Brushing 2', 'Brushing 3', 'Balayage 1', 'Balayage 2', 'Balayage 3'];
    for (const name of names) await toggleService(view, name);
    await continueStep(view);
    await act(async () => {
      fireEvent.press(view.getByText('Générer l’estimation'));
    });
    await act(async () => {
      fireEvent(view.getByTestId('estimation-export-canvas', HIDDEN), 'layout', {
        nativeEvent: { layout: { height: 1480.2, width: 360, x: 0, y: 0 } },
      });
    });

    // The on-screen paper scrolls; nothing is cut from it or from the image.
    expect(view.getByTestId('estimation-paper-scroll')).toBeTruthy();
    const paper = within(view.getByTestId('estimation-document-paper'));
    const exported = within(view.getByTestId('estimation-export-frame', HIDDEN));
    for (const [index, name] of names.entries()) {
      expect(paper.getByTestId(`estimation-document-line-${index}`).props.accessibilityLabel).toMatch(
        new RegExp(`^${name}, `),
      );
      expect(exported.getByText(name, HIDDEN)).toBeTruthy();
    }

    await press(view, 'estimation-share');
    expect(mockSharing.shareAsync).toHaveBeenCalledTimes(1);
    // The frame measures 1080 × (1481 × 3) device pixels: the whole document, sharp.
    const ratio = PixelRatio.get();
    const frame = view.getByTestId('estimation-export-frame', HIDDEN);
    expect(StyleSheet.flatten(frame.props.style)).toMatchObject({
      height: (1481 * 3) / ratio,
      width: 1080 / ratio,
    });
  });

  it('cancels from any step without writing anything', async () => {
    const view = await renderEstimation(database);
    const seeded = dumpDatabase(database);
    await toggleService(view, 'Balayage 1');
    await continueStep(view);

    expect(view.getByTestId('estimation-cancel').props.accessibilityLabel).toBe('Annuler l’estimation');
    await press(view, 'estimation-cancel');

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(dumpDatabase(database)).toBe(seeded);
  });
});

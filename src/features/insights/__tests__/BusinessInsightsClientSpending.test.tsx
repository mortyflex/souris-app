// BeautIzzy — « Tops & tendances »: client spending visibility, on screen AND in exports
//
// ONE eye on « Clients qui dépensent le plus » decides whether client amounts
// are written: on the paper and in the image saved to Photos or shared.
// Every opening starts hidden. The capture is mocked to read the off-screen
// share card AT THE MOMENT it is captured, so these tests check the very
// tree an exported image is made of — not a button state.

import { act, fireEvent, render, within } from '@testing-library/react-native';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { AppointmentSessionProvider } from '@/features/appointments/session/AppointmentSessionProvider';
import { CalendarBlockSessionProvider } from '@/features/calendar-blocks/session/CalendarBlockSessionProvider';
import { ClientSessionProvider } from '@/features/clients/session/ClientSessionProvider';
import { ProductCatalogProvider } from '@/features/products/session/ProductCatalogProvider';
import { SaleSessionProvider } from '@/features/sales/session/SaleSessionProvider';
import { bootstrapPersistence } from '@/persistence/bootstrap';
import type { SourisDatabase } from '@/persistence/database';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';
import { createDevelopmentSeed } from '@/providers/development-seed';
import { TestPersistenceProvider } from '@/providers/testing/TestPersistenceProvider';
import { receiptPrint } from '@/shared/ui/theme';

import {
  INSIGHTS_HIDE_CLIENT_SPENDING_LABEL,
  INSIGHTS_SHOW_CLIENT_SPENDING_LABEL,
} from '../BusinessInsightsReceipt';
import { BusinessInsightsTicket, INSIGHTS_SAVED } from '../BusinessInsightsTicket';
import { INSIGHTS_MASKED_AMOUNT, INSIGHTS_MASKED_AMOUNT_SPOKEN } from '../insights-receipt';

const mockPush = jest.fn();
const mockFocusEffects = new Set<() => void>();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    const React = jest.requireActual('react') as typeof import('react');
    React.useEffect(() => {
      mockFocusEffects.add(effect);
      effect();
      return () => {
        mockFocusEffects.delete(effect);
      };
    }, [effect]);
  },
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('@/shared/lib/image-pixel-size', () => ({ fitImageToPixelSize: jest.fn(async () => undefined) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  Asset: { create: jest.fn(async () => undefined) },
}));
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

const NOW = new Date(2026, 8, 16, 15, 0);
const HIDDEN = { includeHiddenElements: true } as const;
/** A written euro amount: `195,00 €`, `195 €`, `1 250 €`. */
const AMOUNT = /\d[\d\s  ]*(,\d{2})?\s?€/;

const mockCapture = captureRef as jest.MockedFunction<typeof captureRef>;

function seededDatabase(): SourisDatabase {
  const database = openTestDatabase();
  bootstrapPersistence(database, () => createDevelopmentSeed(NOW));
  return database;
}

function Screen() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <Pressable onPress={() => setVisible(true)} testID="open-insights">
        <Text>Tops & tendances</Text>
      </Pressable>
      <BusinessInsightsTicket anchor={NOW} onClose={() => setVisible(false)} visible={visible} />
    </>
  );
}

function renderScreen() {
  return render(
    <TestPersistenceProvider database={seededDatabase()}>
      <ClientSessionProvider>
        <AppointmentSessionProvider>
          <ProductCatalogProvider>
            <SaleSessionProvider>
              <CalendarBlockSessionProvider>
                <Screen />
              </CalendarBlockSessionProvider>
            </SaleSessionProvider>
          </ProductCatalogProvider>
        </AppointmentSessionProvider>
      </ClientSessionProvider>
    </TestPersistenceProvider>,
  );
}

type ScreenView = Awaited<ReturnType<typeof renderScreen>>;

const press = (view: ScreenView, testID: string) =>
  act(async () => fireEvent.press(view.getByTestId(testID)));
const settleDismiss = () =>
  act(async () => {
    jest.advanceTimersByTime(receiptPrint.dismiss);
  });
const regainFocus = () =>
  act(async () => {
    for (const effect of mockFocusEffects) effect();
  });
/** The spending page: the third category. */
const goToSpending = (view: ScreenView) => press(view, 'business-insights-page-indicator-spendingClients');
const toggle = (view: ScreenView) => view.getByTestId('business-insights-client-spending-toggle');

/** Every string a host subtree renders. */
function textsOf(node: { children: readonly unknown[] }): string[] {
  return node.children.flatMap((child) =>
    typeof child === 'string' ? [child] : typeof child === 'object' && child !== null ? textsOf(child as never) : [],
  );
}

/** The spending podium of the paper: its places' visible metric and spoken label. */
function paperPlaces(view: ScreenView) {
  return [1, 2, 3]
    .map((rank) => view.queryByTestId(`business-insights-podium-spendingClients-place-${rank}`))
    .filter((place) => place !== null)
    .map((place) => ({
      label: place.props.accessibilityLabel as string,
      texts: textsOf(place),
      capsules: capsulesIn(place),
    }));
}

/** How many frosted private capsules a subtree draws. */
function capsulesIn(node: { queryAll: (predicate: (n: { props: { testID?: unknown } }) => boolean) => unknown[] }): number {
  return node.queryAll((candidate) => String(candidate.props.testID ?? '').endsWith('-private-amount')).length;
}

/** Records the share card's texts at the moment each image is captured. */
function recordCaptures(view: ScreenView, capsules: number[] = []): string[][] {
  const captured: string[][] = [];
  mockCapture.mockImplementation(async () => {
    const card = view.getByTestId('business-insights-share-card', HIDDEN);
    captured.push(textsOf(card));
    capsules.push(capsulesIn(card));
    return '/tmp/insights.png';
  });
  return captured;
}

describe('BusinessInsightsTicket — client spending visibility', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    jest.setSystemTime(NOW);
    mockPush.mockClear();
    mockCapture.mockReset();
    (Sharing.shareAsync as jest.Mock).mockClear();
    (MediaLibrary.Asset.create as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens hidden, reveals and hides every client amount on the paper, without moving a place', async () => {
    const view = await renderScreen();
    await press(view, 'open-insights');
    await goToSpending(view);

    // Every opening starts hidden: the crossed eye offers to show them.
    expect(toggle(view).props.accessibilityLabel).toBe(INSIGHTS_SHOW_CLIENT_SPENDING_LABEL);
    expect(toggle(view).props.accessibilityRole).toBe('button');
    const hidden = paperPlaces(view);
    expect(hidden.length).toBeGreaterThan(0);
    for (const place of hidden) {
      expect(place.texts).toContain(INSIGHTS_MASKED_AMOUNT);
      expect(place.texts.join(' ')).not.toMatch(AMOUNT);
      expect(place.label).toMatch(new RegExp(`, ${INSIGHTS_MASKED_AMOUNT_SPOKEN}$`));
      // Drawn as the frosted private capsule, one per place.
      expect(place.capsules).toBe(1);
    }

    await act(async () => fireEvent.press(toggle(view)));
    expect(toggle(view).props.accessibilityLabel).toBe(INSIGHTS_HIDE_CLIENT_SPENDING_LABEL);
    const shown = paperPlaces(view);
    // Same places, same people, same order: only the amount is written now.
    expect(shown.map((place) => place.label.split(', ').slice(0, 2).join(', '))).toEqual(
      hidden.map((place) => place.label.split(', ').slice(0, 2).join(', ')),
    );
    const cents = shown.map((place) => {
      const amount = place.texts.find((text) => AMOUNT.test(text));
      expect(amount).toBeDefined();
      expect(place.texts).not.toContain(INSIGHTS_MASKED_AMOUNT);
      expect(place.capsules).toBe(0);
      return Number(amount!.replace(/[^\d]/g, ''));
    });
    // Still ranked by spending, highest first.
    expect([...cents].sort((a, b) => b - a)).toEqual(cents);

    await act(async () => fireEvent.press(toggle(view)));
    expect(toggle(view).props.accessibilityLabel).toBe(INSIGHTS_SHOW_CLIENT_SPENDING_LABEL);
    expect(paperPlaces(view)).toEqual(hidden);
    // Revenue on the paper is never touched by the eye.
    expect(view.getByTestId('business-insights-cash').props.accessibilityLabel).toMatch(AMOUNT);
  });

  it('saves and shares exactly the choice on screen: masked by default, written once revealed', async () => {
    const view = await renderScreen();
    const capsules: number[] = [];
    const captured = recordCaptures(view, capsules);
    await press(view, 'open-insights');
    await goToSpending(view);

    // Default (hidden): neither Photos nor the share sheet gets a client amount.
    await press(view, 'business-insights-save');
    expect(view.getByText(INSIGHTS_SAVED)).toBeTruthy();
    await press(view, 'business-insights-share');
    expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
    expect(captured).toHaveLength(2);
    for (const texts of captured) {
      expect(texts).toContain('Clients qui dépensent le plus');
      expect(texts).toContain(INSIGHTS_MASKED_AMOUNT);
      expect(texts.join(' ')).not.toMatch(AMOUNT);
    }

    // Revealed: the user chose to include them — both exports write them.
    await act(async () => fireEvent.press(toggle(view)));
    await press(view, 'business-insights-save');
    await press(view, 'business-insights-share');
    expect(captured).toHaveLength(4);
    for (const texts of captured.slice(2)) {
      expect(texts).not.toContain(INSIGHTS_MASKED_AMOUNT);
      expect(texts.join(' ')).toMatch(AMOUNT);
    }

    // Hidden again: masked again, at once.
    await act(async () => fireEvent.press(toggle(view)));
    await press(view, 'business-insights-share');
    expect(captured).toHaveLength(5);
    expect(captured[4]).toContain(INSIGHTS_MASKED_AMOUNT);
    expect(captured[4]!.join(' ')).not.toMatch(AMOUNT);

    // The exported card draws the SAME frosted capsule for every hidden client
    // place — none for revealed clients (Encaissé / Panier moyen are counted apart).
    const places = paperPlaces(view).length;
    expect(places).toBeGreaterThan(0);
    expect(capsules).toEqual([places, places, 0, 0, places]);
  });

  it('keeps business revenue frosted on the image whatever the client-spending choice', async () => {
    const view = await renderScreen();
    const cashTexts: string[][] = [];
    mockCapture.mockImplementation(async () => {
      for (const id of ['business-insights-share-card-cash', 'business-insights-share-card-average']) {
        cashTexts.push(textsOf(view.getByTestId(id, HIDDEN)));
      }
      return '/tmp/insights.png';
    });
    await press(view, 'open-insights');
    await goToSpending(view);
    await press(view, 'business-insights-save');
    await act(async () => fireEvent.press(toggle(view)));
    await press(view, 'business-insights-save');

    expect(cashTexts).toHaveLength(4);
    for (const texts of cashTexts) expect(texts).toEqual(['€']);
  });

  it('keeps the choice across period changes: hidden stays hidden, revealed stays revealed', async () => {
    const view = await renderScreen();
    await press(view, 'open-insights');
    await goToSpending(view);

    for (const period of ['year', 'week', 'day', 'month'] as const) {
      await press(view, `business-insights-period-${period}`);
      expect(toggle(view).props.accessibilityLabel).toBe(INSIGHTS_SHOW_CLIENT_SPENDING_LABEL);
      for (const place of paperPlaces(view)) expect(place.texts.join(' ')).not.toMatch(AMOUNT);
      const card = textsOf(view.getByTestId('business-insights-share-card', HIDDEN)).join(' ');
      expect(card).not.toMatch(AMOUNT);
    }
    await press(view, 'business-insights-period-year');
    await act(async () => fireEvent.press(toggle(view)));
    await press(view, 'business-insights-navigator-previous');
    await press(view, 'business-insights-navigator-next');
    expect(toggle(view).props.accessibilityLabel).toBe(INSIGHTS_HIDE_CLIENT_SPENDING_LABEL);
  });

  it('never opens a profile from the eye, keeps the choice over a profile visit, and forgets it on close', async () => {
    const view = await renderScreen();
    await press(view, 'open-insights');
    await goToSpending(view);

    await act(async () => fireEvent.press(toggle(view)));
    await settleDismiss();
    expect(mockPush).not.toHaveBeenCalled();
    expect(view.getByTestId('business-insights-receipt')).toBeTruthy();

    // A client place still opens the profile, by id.
    const place = view.getByTestId('business-insights-podium-spendingClients-place-1');
    expect(place.props.accessibilityRole).toBe('button');
    await act(async () => fireEvent.press(place));
    await settleDismiss();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0]).toMatchObject({ pathname: '/clients/[clientId]' });

    // Back from the profile: the ticket comes back as it was, amounts revealed.
    await regainFocus();
    expect(toggle(view).props.accessibilityLabel).toBe(INSIGHTS_HIDE_CLIENT_SPENDING_LABEL);
    expect(textsOf(view.getByTestId('business-insights-share-card', HIDDEN)).join(' ')).toMatch(AMOUNT);

    // A real close forgets it: the next opening is hidden again, paper and card.
    await press(view, 'business-insights-close');
    await settleDismiss();
    await press(view, 'open-insights');
    await goToSpending(view);
    expect(toggle(view).props.accessibilityLabel).toBe(INSIGHTS_SHOW_CLIENT_SPENDING_LABEL);
    for (const place of paperPlaces(view)) expect(place.texts.join(' ')).not.toMatch(AMOUNT);
    expect(textsOf(view.getByTestId('business-insights-share-card', HIDDEN)).join(' ')).not.toMatch(AMOUNT);
  });

  it('ignores the eye while an export is working, so the captured card never changes under it', async () => {
    const view = await renderScreen();
    let finish: (uri: string) => void = () => undefined;
    let capturedTexts: string[] = [];
    mockCapture.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          capturedTexts = textsOf(view.getByTestId('business-insights-share-card', HIDDEN));
          finish = resolve;
        }),
    );
    await press(view, 'open-insights');
    await goToSpending(view);

    await press(view, 'business-insights-save');
    await act(async () => fireEvent.press(toggle(view)));
    // Still hidden: the tap was ignored while saving.
    expect(toggle(view).props.accessibilityLabel).toBe(INSIGHTS_SHOW_CLIENT_SPENDING_LABEL);
    expect(textsOf(view.getByTestId('business-insights-share-card', HIDDEN)).join(' ')).not.toMatch(AMOUNT);
    await act(async () => finish('/tmp/insights.png'));
    expect(capturedTexts.join(' ')).not.toMatch(AMOUNT);

    // Once done, the eye works again.
    await act(async () => fireEvent.press(toggle(view)));
    expect(toggle(view).props.accessibilityLabel).toBe(INSIGHTS_HIDE_CLIENT_SPENDING_LABEL);
    expect(within(view.getByTestId('business-insights-receipt')).queryAllByText(INSIGHTS_MASKED_AMOUNT)).toHaveLength(0);
  });
});

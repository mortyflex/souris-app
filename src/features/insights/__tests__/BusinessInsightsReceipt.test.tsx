import { act, fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { getInsightsPeriod, type BusinessInsights } from '@/domain/insights';
import { haptics } from '@/shared/lib/haptics';
import { brandAssets } from '@/shared/ui/BrandMark';
import { RECEIPT_SIGNATURE_SIZE } from '@/shared/ui/ReceiptPaper';

import { BusinessInsightsReceipt } from '../BusinessInsightsReceipt';
import { INSIGHTS_CLIENT_PLACE_HINT, InsightsPodium } from '../components/InsightsPodium';
import { buildInsightsReceipt, type InsightsRankingSection } from '../insights-receipt';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const WIDTH = 320;
// The symbol is taller than wide; the wordmark is not.
const SYMBOL_SIGNATURE = {
  width: RECEIPT_SIGNATURE_SIZE,
  height: Math.round((RECEIPT_SIGNATURE_SIZE * brandAssets.symbol.height) / brandAssets.symbol.width),
};

function insights(overrides: Partial<BusinessInsights> = {}): BusinessInsights {
  return {
    period: getInsightsPeriod('MONTH', new Date(2026, 8, 22)),
    cash: { totalCents: 15000, cardCents: 15000, cashCents: 0, checkoutCount: 2 },
    completedAppointmentCount: 3,
    completedAppointmentValueCents: 19917,
    averageAppointmentValueCents: 6639,
    soldProductUnitCount: 4,
    topServices: [
      { serviceId: 's1', serviceName: 'Brushing 2', count: 6 },
      { serviceId: 's2', serviceName: 'Balayage 1', count: 4 },
      { serviceId: 's3', serviceName: 'Balayage 3', count: 4 },
    ],
    topProducts: [
      { productId: 'p1', productName: 'ACG Shampoo', unitCount: 3 },
      { productId: 'p2', productName: 'Huile', unitCount: 1 },
    ],
    topSpendingClients: [{ clientId: 'c1', spendingCents: 19500, completedAppointmentCount: 3 }],
    topLoyalClients: [],
    financialConflictCount: 0,
    isEmpty: false,
    ...overrides,
  };
}

const model = buildInsightsReceipt(insights(), (clientId) =>
  clientId === 'c1' ? ({ id: 'c1', firstName: 'Aaliyah', lastName: 'Benali' } as never) : undefined,
);

function section(key: InsightsRankingSection['key']): InsightsRankingSection {
  return model.sections.find((candidate) => candidate.key === key)!;
}

describe('InsightsPodium', () => {
  it('stands a full Top 3 with #1 first in reading order, each place ONE spoken element', async () => {
    const view = await render(<InsightsPodium section={section('services')} testID="podium" />);

    expect(view.getByRole('header', { name: 'Top prestations' })).toBeTruthy();
    const places = [1, 2, 3].map((rank) => view.getByTestId(`podium-place-${rank}`));
    expect(places.map((place) => place.props.accessibilityLabel)).toEqual([
      'Première place, Brushing 2, 6 prestations',
      'Deuxième place, Balayage 1, 4 prestations',
      'Troisième place, Balayage 3, 4 prestations',
    ]);
    // The tree keeps rank order (screen readers), whatever the visual place.
    const stage = places[0]!.parent!;
    expect(places.map((place) => stage.children.indexOf(place))).toEqual([0, 1, 2]);
    // The rank is written on its medal and, quietly, on its plinth — never colour alone.
    for (const [index, place] of places.entries()) {
      const rank = String(index + 1);
      expect(within(place).getAllByText(rank)).toHaveLength(2);
      expect(within(view.getByTestId(`podium-plinth-${rank}`)).getByText(rank)).toBeTruthy();
    }
  });

  it('shows two places without an empty third block', async () => {
    const view = await render(<InsightsPodium section={section('products')} testID="podium" />);
    expect(view.getByTestId('podium-place-1').props.accessibilityLabel).toBe('Première place, ACG Shampoo, 3 unités');
    expect(view.getByTestId('podium-place-2').props.accessibilityLabel).toBe('Deuxième place, Huile, 1 unité');
    expect(view.queryByTestId('podium-place-3')).toBeNull();
    expect(view.queryByText(/vendu/)).toBeNull();
  });

  it('shows one centred winner alone', async () => {
    const view = await render(<InsightsPodium section={section('spendingClients')} testID="podium" />);
    expect(view.getByTestId('podium-place-1').props.accessibilityLabel).toMatch(/^Première place, Aaliyah B., 195,00/);
    expect(view.queryByTestId('podium-place-2')).toBeNull();
    expect(view.queryByTestId('podium-place-3')).toBeNull();
  });

  it('shows one quiet category message instead of an empty podium', async () => {
    const view = await render(<InsightsPodium section={section('loyalClients')} testID="podium" />);
    expect(view.getByText('Aucun rendez-vous réalisé sur cette période')).toBeTruthy();
    expect(view.queryByTestId('podium-place-1')).toBeNull();
    expect(view.queryByText('1')).toBeNull();
  });

  it('opens a client from their place, by their stable id, as ONE button that looks the same', async () => {
    const onClientPress = jest.fn();
    const loyal: InsightsRankingSection = {
      ...section('loyalClients'),
      rows: [
        { key: 'c1', rank: 1, label: 'Aaliyah B.', value: '3 rdv', accessibilityLabel: 'Première place, Aaliyah B., 3 rendez-vous', clientId: 'c1' },
        { key: 'gone', rank: 2, label: 'Client inconnu', value: '2 rdv', accessibilityLabel: 'Deuxième place, Client inconnu, 2 rendez-vous' },
      ],
    };
    const view = await render(<InsightsPodium onClientPress={onClientPress} section={loyal} testID="podium" />);

    const place = view.getByTestId('podium-place-1');
    expect(place.props.accessibilityRole).toBe('button');
    expect(place.props.accessibilityLabel).toBe('Première place, Aaliyah B., 3 rendez-vous');
    expect(place.props.accessibilityHint).toBe(INSIGHTS_CLIENT_PLACE_HINT);
    // Same unit as before: medal digit, name, metric and plinth — no chevron, no extra text.
    expect(within(place).getAllByText('1')).toHaveLength(2);
    expect(within(place).getByText('Aaliyah B.')).toBeTruthy();
    expect(within(place).getByText('3 rdv')).toBeTruthy();
    expect(StyleSheet.flatten(place.props.style).width).toBe('36%');

    await act(async () => fireEvent.press(place));
    expect(onClientPress).toHaveBeenCalledTimes(1);
    expect(onClientPress).toHaveBeenCalledWith('c1');

    // A client who no longer exists keeps the place, but it opens nothing.
    const gone = view.getByTestId('podium-place-2');
    expect(gone.props.accessibilityRole).toBeUndefined();
    expect(gone.props.accessibilityLabel).toBe('Deuxième place, Client inconnu, 2 rendez-vous');
    await act(async () => fireEvent.press(gone));
    expect(onClientPress).toHaveBeenCalledTimes(1);
  });

  it('keeps a client place static without a handler, as on the share card', async () => {
    const loyal: InsightsRankingSection = {
      ...section('loyalClients'),
      rows: [{ key: 'c1', rank: 1, label: 'Aaliyah B.', value: '3 rdv', accessibilityLabel: 'Première place, Aaliyah B., 3 rendez-vous', clientId: 'c1' }],
    };
    const card = await render(<InsightsPodium layout="story" section={loyal} testID="podium" />);
    expect(card.getByTestId('podium-place-1').props.accessibilityRole).toBeUndefined();
    expect(card.queryByRole('button')).toBeNull();
  });

  it('keeps service places static even with a handler: they carry no client id', async () => {
    const onClientPress = jest.fn();
    const services = await render(
      <InsightsPodium onClientPress={onClientPress} section={section('services')} testID="podium" />,
    );
    expect(services.queryByRole('button')).toBeNull();
    await act(async () => fireEvent.press(services.getByTestId('podium-place-1')));
    expect(onClientPress).not.toHaveBeenCalled();
  });

  it('keeps the metric of a very long name, wrapping the name on two lines at most', async () => {
    const long: InsightsRankingSection = {
      ...section('services'),
      rows: [{ ...section('services').rows[0]!, label: 'Balayage signature lumière naturelle avec soin profond' }],
    };
    const view = await render(<InsightsPodium section={long} testID="podium" />);
    const place = view.getByTestId('podium-place-1');
    expect(within(place).getByText('Balayage signature lumière naturelle avec soin profond').props.numberOfLines).toBe(2);
    expect(within(place).getByText('6 prestations')).toBeTruthy();
  });
});

describe('BusinessInsightsReceipt — ranking carousel', () => {
  function renderReceipt() {
    return render(
      <BusinessInsightsReceipt
        model={model}
        nextLabel="Mois suivant"
        onNext={jest.fn()}
        onPeriodKindChange={jest.fn()}
        onPrevious={jest.fn()}
        periodKind="MONTH"
        periodLabel="Septembre 2026"
        previousLabel="Mois précédent"
        width={WIDTH}
      />,
    );
  }

  type ReceiptView = Awaited<ReturnType<typeof renderReceipt>>;
  const pagination = (view: ReceiptView) => view.getByTestId('business-insights-pagination');
  const isShown = (view: ReceiptView, key: string) =>
    !view.getByTestId(`business-insights-page-${key}`, { includeHiddenElements: true }).props
      .accessibilityElementsHidden;
  const swipeTo = async (view: ReceiptView, page: number) =>
    act(async () =>
      fireEvent(view.getByTestId('business-insights-rankings'), 'momentumScrollEnd', {
        nativeEvent: { contentOffset: { x: page * WIDTH, y: 0 } },
      }),
    );

  it('keeps the financial summary above ONE horizontally paged carousel of the four categories', async () => {
    const view = await renderReceipt();

    expect(view.getByLabelText('Encaissé, 150,00 €')).toBeTruthy();
    expect(view.getByLabelText('3 rendez-vous réalisés')).toBeTruthy();
    expect(view.getByLabelText('Panier moyen, 66,39 €')).toBeTruthy();
    const carousel = view.getByTestId('business-insights-rankings');
    expect(carousel.props.horizontal).toBe(true);
    expect(carousel.props.pagingEnabled).toBe(true);
    for (const key of ['services', 'products', 'spendingClients', 'loyalClients']) {
      expect(view.getByTestId(`business-insights-page-${key}`, { includeHiddenElements: true })).toBeTruthy();
    }
    // The first visible category is Top prestations.
    expect(pagination(view).props.accessibilityLabel).toBe('Top prestations, 1 sur 4');
    expect(isShown(view, 'services')).toBe(true);
    expect(isShown(view, 'products')).toBe(false);
    // The short week label is spoken in full; no share action yet.
    expect(view.getByRole('tab', { name: 'Semaine' })).toBeTruthy();
    expect(view.getByText('Sem.')).toBeTruthy();
    expect(view.queryByText(/Partager/)).toBeNull();
  });

  it('is ONE natural-height paper: only the carousel scrolls, and the wordmark closes it', async () => {
    const view = await renderReceipt();
    const receipt = view.getByTestId('business-insights-receipt');

    // The printer scrolls the whole paper on a short screen; nothing scrolls vertically inside it.
    const scrollViews = receipt.queryAll((node) => node.type === 'RCTScrollView');
    expect(scrollViews.map((node) => node.props.testID)).toEqual(['business-insights-rankings']);
    expect(StyleSheet.flatten(receipt.props.style).maxHeight).toBeUndefined();
    // The closing signature — the BeautIzzy symbol alone, never the wordmark — is part of
    // the paper, after the pagination.
    const footer = receipt.queryAll((node) => node.props.resizeMode === 'contain');
    expect(footer).toHaveLength(1);
    expect(StyleSheet.flatten(footer[0]!.props.style)).toMatchObject(SYMBOL_SIGNATURE);
    const order = receipt.queryAll(
      (node) => node === footer[0] || node.props.testID === 'business-insights-pagination',
    );
    expect(order[order.length - 1]).toBe(footer[0]);
  });

  it('follows swipes through every category, with ONE selection haptic per settled change', async () => {
    const selection = jest.spyOn(haptics, 'selection');
    const view = await renderReceipt();

    const expected = [
      [1, 'Top produits, 2 sur 4', 'products'],
      [2, 'Clients qui dépensent le plus, 3 sur 4', 'spendingClients'],
      [3, 'Clients les plus fidèles, 4 sur 4', 'loyalClients'],
    ] as const;
    for (const [page, label, key] of expected) {
      await swipeTo(view, page);
      expect(pagination(view).props.accessibilityLabel).toBe(label);
      expect(isShown(view, key)).toBe(true);
    }
    expect(selection).toHaveBeenCalledTimes(3);

    // Settling again on the same page is not a change.
    await swipeTo(view, 3);
    expect(selection).toHaveBeenCalledTimes(3);
    await swipeTo(view, 0);
    expect(pagination(view).props.accessibilityLabel).toBe('Top prestations, 1 sur 4');
    expect(selection).toHaveBeenCalledTimes(4);
    selection.mockRestore();
  });

  it('reports each settled category once, so « Partager » follows the screen', async () => {
    const onCategoryChange = jest.fn();
    const view = await render(
      <BusinessInsightsReceipt
        model={model}
        nextLabel="Mois suivant"
        onCategoryChange={onCategoryChange}
        onNext={jest.fn()}
        onPeriodKindChange={jest.fn()}
        onPrevious={jest.fn()}
        periodKind="MONTH"
        periodLabel="Septembre 2026"
        previousLabel="Mois précédent"
        width={WIDTH}
      />,
    );

    await swipeTo(view, 1);
    await swipeTo(view, 1);
    await act(async () => fireEvent.press(view.getByTestId('business-insights-page-indicator-loyalClients')));
    expect(onCategoryChange.mock.calls).toEqual([['products'], ['loyalClients']]);
  });

  it('hands client presses to the podiums, and can open on a given category', async () => {
    const onClientPress = jest.fn();
    const view = await render(
      <BusinessInsightsReceipt
        initialCategory="spendingClients"
        model={model}
        nextLabel="Mois suivant"
        onClientPress={onClientPress}
        onNext={jest.fn()}
        onPeriodKindChange={jest.fn()}
        onPrevious={jest.fn()}
        periodKind="MONTH"
        periodLabel="Septembre 2026"
        previousLabel="Mois précédent"
        width={WIDTH}
      />,
    );

    // The carousel starts on the asked category, offset included.
    expect(pagination(view).props.accessibilityLabel).toBe('Clients qui dépensent le plus, 3 sur 4');
    expect(view.getByTestId('business-insights-rankings').props.contentOffset).toEqual({ x: 2 * WIDTH, y: 0 });
    expect(isShown(view, 'spendingClients')).toBe(true);
    expect(isShown(view, 'services')).toBe(false);

    const place = view.getByTestId('business-insights-podium-spendingClients-place-1');
    expect(place.props.accessibilityRole).toBe('button');
    await act(async () => fireEvent.press(place));
    expect(onClientPress).toHaveBeenCalledWith('c1');
    // Service places stay static.
    expect(
      view.getByTestId('business-insights-podium-services-place-1', { includeHiddenElements: true }).props
        .accessibilityRole,
    ).toBeUndefined();
  });

  it('moves between categories from the page indicator and the adjustable actions', async () => {
    const view = await renderReceipt();

    await act(async () => fireEvent.press(view.getByTestId('business-insights-page-indicator-spendingClients')));
    expect(pagination(view).props.accessibilityLabel).toBe('Clients qui dépensent le plus, 3 sur 4');

    expect(pagination(view).props.accessibilityRole).toBe('adjustable');
    await act(async () =>
      fireEvent(pagination(view), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }),
    );
    expect(pagination(view).props.accessibilityLabel).toBe('Clients les plus fidèles, 4 sur 4');
    // Never past the last category.
    await act(async () =>
      fireEvent(pagination(view), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }),
    );
    expect(pagination(view).props.accessibilityLabel).toBe('Clients les plus fidèles, 4 sur 4');
    await act(async () =>
      fireEvent(pagination(view), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } }),
    );
    expect(pagination(view).props.accessibilityLabel).toBe('Clients qui dépensent le plus, 3 sur 4');
  });
});

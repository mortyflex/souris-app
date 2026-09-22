import { act, fireEvent, render, within } from '@testing-library/react-native';

import { getInsightsPeriod, type BusinessInsights } from '@/domain/insights';
import { haptics } from '@/shared/lib/haptics';

import { BusinessInsightsReceipt } from '../BusinessInsightsReceipt';
import { InsightsPodium } from '../components/InsightsPodium';
import { buildInsightsReceipt, type InsightsRankingSection } from '../insights-receipt';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const WIDTH = 320;

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
        maxHeight={900}
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

  it('follows swipes through every category, with ONE selection haptic per settled change', async () => {
    const selection = jest.spyOn(haptics, 'selection');
    const view = await renderReceipt();

    const expected = [
      [1, 'Top produits, 2 sur 4', 'products'],
      [2, 'Clientes qui dépensent le plus, 3 sur 4', 'spendingClients'],
      [3, 'Clientes les plus fidèles, 4 sur 4', 'loyalClients'],
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
        maxHeight={900}
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

  it('moves between categories from the page indicator and the adjustable actions', async () => {
    const view = await renderReceipt();

    await act(async () => fireEvent.press(view.getByTestId('business-insights-page-indicator-spendingClients')));
    expect(pagination(view).props.accessibilityLabel).toBe('Clientes qui dépensent le plus, 3 sur 4');

    expect(pagination(view).props.accessibilityRole).toBe('adjustable');
    await act(async () =>
      fireEvent(pagination(view), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }),
    );
    expect(pagination(view).props.accessibilityLabel).toBe('Clientes les plus fidèles, 4 sur 4');
    // Never past the last category.
    await act(async () =>
      fireEvent(pagination(view), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }),
    );
    expect(pagination(view).props.accessibilityLabel).toBe('Clientes les plus fidèles, 4 sur 4');
    await act(async () =>
      fireEvent(pagination(view), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } }),
    );
    expect(pagination(view).props.accessibilityLabel).toBe('Clientes qui dépensent le plus, 3 sur 4');
  });
});

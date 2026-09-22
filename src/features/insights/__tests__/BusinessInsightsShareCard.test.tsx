import { render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Client } from '@/domain/clients';
import { getInsightsPeriod, type BusinessInsights } from '@/domain/insights';
import { formatCompactEuroCents, formatEuroCents } from '@/shared/lib/money';

import { receiptPaper } from '@/shared/ui/theme';

import {
  BusinessInsightsShareCard,
  INSIGHTS_SHARE_BACKGROUND,
  INSIGHTS_SHARE_CARD_SIZE,
  INSIGHTS_SHARE_IMAGE_SIZE,
} from '../BusinessInsightsShareCard';
import { InsightsPodium } from '../components/InsightsPodium';
import { buildInsightsRankingSections, type InsightsRankingKey } from '../insights-receipt';
import { buildInsightsShareCard } from '../insights-share-card';

// Observed: rendering the card must never compute insights.
jest.mock('@/domain/insights', () => {
  const actual = jest.requireActual('@/domain/insights');
  return { ...actual, getBusinessInsights: jest.fn(actual.getBusinessInsights) };
});
const domain = jest.requireMock('@/domain/insights') as { readonly getBusinessInsights: jest.Mock };

const HIDDEN = { includeHiddenElements: true } as const;

function insights(overrides: Partial<BusinessInsights> = {}): BusinessInsights {
  return {
    period: getInsightsPeriod('MONTH', new Date(2026, 8, 22)),
    cash: { totalCents: 15000, cardCents: 15000, cashCents: 0, checkoutCount: 2 },
    completedAppointmentCount: 28,
    completedAppointmentValueCents: 185892,
    averageAppointmentValueCents: 6639,
    soldProductUnitCount: 4,
    topServices: [
      { serviceId: 's1', serviceName: 'Balayage signature lumière naturelle avec soin profond', count: 6 },
      { serviceId: 's2', serviceName: 'Balayage 1', count: 4 },
      { serviceId: 's3', serviceName: 'Balayage 3', count: 4 },
    ],
    topProducts: [{ productId: 'p1', productName: 'ACG Shampoo', unitCount: 1 }],
    topSpendingClients: [
      { clientId: 'client-amel', spendingCents: 19500, completedAppointmentCount: 3 },
      { clientId: 'client-nadia', spendingCents: 12345, completedAppointmentCount: 2 },
    ],
    topLoyalClients: [{ clientId: 'client-amel', spendingCents: 19500, completedAppointmentCount: 3 }],
    financialConflictCount: 1,
    isEmpty: false,
    ...overrides,
  };
}

const CLIENTS: Record<string, Client> = {
  'client-amel': { id: 'client-amel', firstName: 'Amel', lastName: 'Benali' } as Client,
  'client-nadia': { id: 'client-nadia', firstName: 'Nadia', lastName: 'Fares' } as Client,
};
const getClient = (id: string) => CLIENTS[id];

function renderCard(category: InsightsRankingKey, source = insights()) {
  return render(
    <BusinessInsightsShareCard
      model={buildInsightsShareCard(source, 'Septembre 2026', category, getClient)}
      testID="card"
    />,
  );
}

describe('BusinessInsightsShareCard', () => {
  it('is a fixed 9:16 layout, exported at 1080 × 1920', () => {
    expect(INSIGHTS_SHARE_CARD_SIZE.width / INSIGHTS_SHARE_CARD_SIZE.height).toBeCloseTo(9 / 16);
    expect(INSIGHTS_SHARE_IMAGE_SIZE).toEqual({ width: 1080, height: 1920 });
  });

  it('frames the period, the summary and the service podium with the Souris brand, and no control', async () => {
    const view = await renderCard('services');

    expect(view.getByText('Tops & tendances')).toBeTruthy();
    expect(view.getByTestId('card-period').props.children).toBe('Septembre 2026');
    expect(view.getByText('Encaissé sur la période')).toBeTruthy();
    expect(view.getByText('28 rendez-vous')).toBeTruthy();
    expect(view.queryByText(/réalisés/)).toBeNull();
    expect(view.getByText('Panier moyen', { exact: false })).toBeTruthy();
    expect(view.getByText('Créé avec')).toBeTruthy();
    expect(view.getByText('Top prestations')).toBeTruthy();
    for (const label of ['Balayage 1', 'Balayage 3', '6 prestations', '4 prestations']) {
      expect(view.getAllByText(label).length).toBeGreaterThan(0);
    }
    // The public card is not the ticket: no controls, no pagination, no conflict note.
    expect(view.queryByText(/Fermer|Partager|Mois|conflit/)).toBeNull();
    expect(view.queryByRole('button')).toBeNull();
  });

  it('keeps a long service name on two lines at most, with its metric', async () => {
    const view = await renderCard('services');
    const winner = within(view.getByTestId('card-highlight'));
    const name = winner.getByText('Balayage signature lumière naturelle avec soin profond', HIDDEN);
    expect(name.props.numberOfLines).toBe(2);
    expect(winner.getByText('6 prestations', HIDDEN)).toBeTruthy();
  });

  it('shows the product podium in units', async () => {
    const view = await renderCard('products');
    expect(view.getByText('Top produits')).toBeTruthy();
    expect(view.getByText('ACG Shampoo')).toBeTruthy();
    expect(view.getByText('1 unité')).toBeTruthy();
  });

  it.each([
    ['spendingClients', 'Clientes qui dépensent le plus', [['Amel B.', formatCompactEuroCents(19500)], ['Nadia F.', formatEuroCents(12345)]]],
    ['loyalClients', 'Clientes les plus fidèles', [['Amel B.', '3 rdv']]],
  ] as const)('stands the %s podium with « Prénom N. » names and visible metrics', async (category, title, placeTexts) => {
    const view = await renderCard(category);
    const highlight = within(view.getByTestId('card-highlight'));

    expect(highlight.getByText(title, HIDDEN)).toBeTruthy();
    for (const [name, metric] of placeTexts) {
      expect(highlight.getByText(name, HIDDEN)).toBeTruthy();
      expect(highlight.getByText(metric, HIDDEN)).toBeTruthy();
    }
    // Never a full last name, never a spelled-out (or truncated) « rendez-vous » on a place.
    expect(view.queryByText(/Benali|Fares/, HIDDEN)).toBeNull();
    expect(highlight.queryByText(/rendez-v/, HIDDEN)).toBeNull();
  });

  it('frosts « Encaissé » and « Panier moyen »: labels readable, no amount ever rendered', async () => {
    const view = await renderCard('services');

    expect(view.getByText('Encaissé sur la période')).toBeTruthy();
    expect(view.getByText('Panier moyen')).toBeTruthy();
    for (const testID of ['card-cash', 'card-average']) {
      const placeholder = within(view.getByTestId(testID));
      // Only the currency sign is written; the marks are shapes, not digits.
      expect(placeholder.getByText('€')).toBeTruthy();
      expect(placeholder.queryByText(/\d/)).toBeNull();
    }
    expect(view.queryByText(new RegExp(formatEuroCents(15000).split(',')[0]!))).toBeNull();
    expect(view.queryByText(/66,39/)).toBeNull();
  });

  it('prints a calm zero card for an empty period, without a ranking', async () => {
    const view = await renderCard(
      'services',
      insights({
        cash: { totalCents: 0, cardCents: 0, cashCents: 0, checkoutCount: 0 },
        completedAppointmentCount: 0,
        averageAppointmentValueCents: 0,
        soldProductUnitCount: 0,
        topServices: [],
        topProducts: [],
        topSpendingClients: [],
        topLoyalClients: [],
        isEmpty: true,
      }),
    );
    expect(view.getByText('0 rendez-vous')).toBeTruthy();
    expect(view.getByText('Une période toute calme ✨')).toBeTruthy();
    expect(view.queryByText('Top prestations')).toBeNull();
  });

  it('paints the warm paper full-bleed: the card is the whole image, never a rounded card on a ground', async () => {
    const view = await renderCard('services');
    const card = StyleSheet.flatten(view.getByTestId('card').props.style);
    expect(INSIGHTS_SHARE_BACKGROUND).toBe(receiptPaper.surface);
    expect(card).toMatchObject({
      backgroundColor: receiptPaper.surface,
      width: INSIGHTS_SHARE_CARD_SIZE.width,
      height: INSIGHTS_SHARE_CARD_SIZE.height,
    });
    expect(card.borderRadius).toBeUndefined();
    expect(card.margin ?? card.marginHorizontal ?? card.marginVertical).toBeUndefined();
  });

  it('never truncates a podium metric: wider places, and a second line rather than an ellipsis', async () => {
    const view = await renderCard('services');
    const highlight = within(view.getByTestId('card-highlight'));
    const metric = highlight.getByText('6 prestations', HIDDEN);
    expect(metric.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(metric.props.style).paddingHorizontal).toBe(0);
    // #1 stands on 40 % of the width, #2 and #3 on 30 %: the plinths still touch.
    const places = view.container.queryAll(
      (node) => node.props.accessibilityLabel?.startsWith?.('Première place') ?? false,
    );
    expect(StyleSheet.flatten(places[0]!.props.style).width).toBe('40%');
  });

  it('keeps the in-app receipt podium exactly as it was', async () => {
    const services = buildInsightsRankingSections(insights(), getClient)[0]!;
    const view = await render(<InsightsPodium section={services} testID="podium" />);
    const place = within(view.getByTestId('podium-place-1'));
    const metric = place.getByText('6 prestations');
    expect(metric.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(metric.props.style).paddingHorizontal).toBe(4);
    expect(StyleSheet.flatten(view.getByTestId('podium-place-1').props.style).width).toBe('36%');
    expect(StyleSheet.flatten(view.getByTestId('podium-place-2').props.style).width).toBe('32%');
  });

  it('lays every text out at a fixed size, whatever the device text size', async () => {
    const view = await renderCard('services');
    const texts = view.container.queryAll((node) => node.type === 'Text');
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) expect(text.props.allowFontScaling).toBe(false);
  });

  it('computes nothing: it renders the share model it is given, without any provider', async () => {
    domain.getBusinessInsights.mockClear();
    // No session, persistence or client provider around it: it needs none.
    const view = await renderCard('products');
    expect(view.getByText('ACG Shampoo')).toBeTruthy();
    expect(domain.getBusinessInsights).not.toHaveBeenCalled();
  });
});

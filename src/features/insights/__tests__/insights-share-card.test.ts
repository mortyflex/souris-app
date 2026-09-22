import type { Client } from '@/domain/clients';
import { getInsightsPeriod, type BusinessInsights } from '@/domain/insights';
import { formatCompactEuroCents, formatEuroCents } from '@/shared/lib/money';

import { buildInsightsReceipt, type InsightsRankingKey } from '../insights-receipt';
import { buildInsightsShareCard, INSIGHTS_SHARE_CALM_MESSAGE } from '../insights-share-card';

function insights(overrides: Partial<BusinessInsights> = {}): BusinessInsights {
  return {
    period: getInsightsPeriod('MONTH', new Date(2026, 8, 22)),
    cash: { totalCents: 15000, cardCents: 15000, cashCents: 0, checkoutCount: 2 },
    completedAppointmentCount: 28,
    completedAppointmentValueCents: 185892,
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
    topSpendingClients: [
      { clientId: 'client-amel', spendingCents: 19500, completedAppointmentCount: 3 },
      { clientId: 'client-nadia', spendingCents: 12345, completedAppointmentCount: 2 },
      { clientId: 'client-sara', spendingCents: 9900, completedAppointmentCount: 1 },
    ],
    topLoyalClients: [
      { clientId: 'client-nadia', spendingCents: 12345, completedAppointmentCount: 4 },
      { clientId: 'client-amel', spendingCents: 19500, completedAppointmentCount: 3 },
      { clientId: 'client-sara', spendingCents: 9900, completedAppointmentCount: 1 },
    ],
    financialConflictCount: 0,
    isEmpty: false,
    ...overrides,
  };
}

const CLIENTS: Record<string, Client> = {
  'client-amel': { id: 'client-amel', firstName: 'Amel', lastName: 'Benali' } as Client,
  'client-nadia': { id: 'client-nadia', firstName: 'Nadia', lastName: 'Fares' } as Client,
  'client-sara': { id: 'client-sara', firstName: 'Sara' } as Client,
};
const getClient = (id: string) => CLIENTS[id];

function podium(category: InsightsRankingKey, source = insights()) {
  const card = buildInsightsShareCard(source, 'Septembre 2026', category, getClient);
  if (card.highlight.kind !== 'ranking') throw new Error('expected a ranking');
  return card.highlight.section;
}

const places = (category: InsightsRankingKey) =>
  podium(category).rows.map(({ rank, label, value }) => [rank, label, value]);

describe('buildInsightsShareCard', () => {
  it('shows the service podium with names, ranks and counts', () => {
    expect(podium('services').title).toBe('Top prestations');
    expect(places('services')).toEqual([
      [1, 'Brushing 2', '6 prestations'],
      [2, 'Balayage 1', '4 prestations'],
      [3, 'Balayage 3', '4 prestations'],
    ]);
  });

  it('shows the product podium in units, singular and plural', () => {
    expect(podium('products').title).toBe('Top produits');
    expect(places('products')).toEqual([
      [1, 'ACG Shampoo', '3 unités'],
      [2, 'Huile', '1 unité'],
    ]);
  });

  it('names the highest-spending clients as « Prénom N. » with a compact amount, in rank order', () => {
    expect(podium('spendingClients').title).toBe('Clientes qui dépensent le plus');
    expect(places('spendingClients')).toEqual([
      [1, 'Amel B.', formatCompactEuroCents(19500)],
      [2, 'Nadia F.', formatEuroCents(12345)],
      [3, 'Sara', formatCompactEuroCents(9900)],
    ]);
  });

  it('names the most loyal clients as « Prénom N. » with their visits as « rdv », in rank order', () => {
    expect(podium('loyalClients').title).toBe('Clientes les plus fidèles');
    expect(places('loyalClients')).toEqual([
      [1, 'Nadia F.', '4 rdv'],
      [2, 'Amel B.', '3 rdv'],
      [3, 'Sara', '1 rdv'],
    ]);
  });

  it('never puts a full last name or a client id on the public card', () => {
    for (const category of ['spendingClients', 'loyalClients'] as const) {
      const serialized = JSON.stringify(buildInsightsShareCard(insights(), '2026', category, getClient));
      for (const fragment of ['Benali', 'Fares', 'client-']) {
        expect(serialized).not.toContain(fragment);
      }
      // What is drawn on a place never spells out « rendez-vous ».
      for (const { value } of podium(category).rows) expect(value).not.toMatch(/rendez-v/);
    }
  });

  it('keeps the ticket podium for services and products, and the ticket order and metrics for clients', () => {
    const source = insights();
    const receipt = buildInsightsReceipt(source, getClient);
    for (const section of receipt.sections) {
      const card = podium(section.key, source);
      expect(card.title).toBe(section.title);
      // Same places, same people, same order.
      expect(card.rows.map((row) => [row.rank, row.label])).toEqual(
        section.rows.map((row) => [row.rank, row.label]),
      );
      if (section.key === 'services' || section.key === 'products') expect(card).toEqual(section);
    }
    // The private ticket keeps readable names.
    expect(receipt.sections[2]!.rows[0]!.label).toBe('Amel B.');
  });

  it('keeps the quiet category message when a client ranking is empty', () => {
    expect(podium('loyalClients', insights({ topLoyalClients: [] }))).toMatchObject({
      title: 'Clientes les plus fidèles',
      rows: [],
      emptyMessage: 'Aucun rendez-vous réalisé sur cette période',
    });
  });

  it('keeps the completed count, worded short, and carries NO turnover amount at all', () => {
    const source = insights();
    const receipt = buildInsightsReceipt(source, getClient);
    const card = buildInsightsShareCard(source, 'Septembre 2026', 'services', getClient);

    expect(card.periodLabel).toBe('Septembre 2026');
    // Same completed count; the receipt keeps « réalisés », the card says it short.
    expect(receipt.completedAppointments).toBe('28 rendez-vous réalisés');
    expect(card.completedAppointments).toBe('28 rendez-vous');
    // « Encaissé » and « Panier moyen » stay in the ticket only.
    const serialized = JSON.stringify(card);
    expect(serialized).not.toContain(receipt.cashCollected);
    expect(serialized).not.toContain(receipt.averageAppointmentValue);
    expect(Object.keys(card).sort()).toEqual(['completedAppointments', 'highlight', 'periodLabel']);
    expect(
      buildInsightsShareCard(insights({ completedAppointmentCount: 1 }), '2026', 'services', getClient)
        .completedAppointments,
    ).toBe('1 rendez-vous');
  });

  it('never mentions a financial conflict on the shared card', () => {
    const card = buildInsightsShareCard(insights({ financialConflictCount: 2 }), '2026', 'services', getClient);
    expect(JSON.stringify(card)).not.toMatch(/conflit|CONFLICT/i);
  });

  it('prints a calm card for an empty period, whatever the category, without any ranking', () => {
    const empty = insights({
      cash: { totalCents: 0, cardCents: 0, cashCents: 0, checkoutCount: 0 },
      completedAppointmentCount: 0,
      completedAppointmentValueCents: 0,
      averageAppointmentValueCents: 0,
      soldProductUnitCount: 0,
      topServices: [],
      topProducts: [],
      topSpendingClients: [],
      topLoyalClients: [],
      isEmpty: true,
    });
    for (const category of ['services', 'products', 'spendingClients', 'loyalClients'] as const) {
      const card = buildInsightsShareCard(empty, 'Septembre 2030', category, getClient);
      expect(card.highlight).toEqual({ kind: 'calm', message: INSIGHTS_SHARE_CALM_MESSAGE });
      expect(card.completedAppointments).toBe('0 rendez-vous');
    }
    expect(INSIGHTS_SHARE_CALM_MESSAGE).toBe('Une période toute calme ✨');
  });
});


import type { Client } from '@/domain/clients';
import { getInsightsPeriod, type BusinessInsights } from '@/domain/insights';
import { formatEuroCents } from '@/shared/lib/money';

import {
  buildInsightsRankingSections,
  buildInsightsReceipt,
  formatCompletedAppointments,
  formatInsightsClientName,
  formatInsightsPeriod,
  getInsightsNavigationLabels,
} from '../insights-receipt';

const anchor = new Date(2026, 8, 22);

function insights(overrides: Partial<BusinessInsights> = {}): BusinessInsights {
  return {
    period: getInsightsPeriod('MONTH', anchor),
    cash: { totalCents: 0, cardCents: 0, cashCents: 0, checkoutCount: 0 },
    completedAppointmentCount: 0,
    completedAppointmentValueCents: 0,
    averageAppointmentValueCents: 0,
    soldProductUnitCount: 0,
    topServices: [],
    topProducts: [],
    topSpendingClients: [],
    topLoyalClients: [],
    financialConflictCount: 0,
    isEmpty: true,
    ...overrides,
  };
}

function client(id: string, firstName: string, lastName?: string): Client {
  return { id, firstName, ...(lastName ? { lastName } : {}) } as Client;
}

describe('formatInsightsPeriod', () => {
  it('words each kind of period in French', () => {
    expect(formatInsightsPeriod(getInsightsPeriod('DAY', anchor))).toBe('22 sept. 2026');
    expect(formatInsightsPeriod(getInsightsPeriod('WEEK', anchor))).toBe('21 – 27 sept. 2026');
    expect(formatInsightsPeriod(getInsightsPeriod('MONTH', anchor))).toBe('Septembre 2026');
    expect(formatInsightsPeriod(getInsightsPeriod('YEAR', anchor))).toBe('2026');
  });

  it('names both months, or both years, when a week spans them', () => {
    expect(formatInsightsPeriod(getInsightsPeriod('WEEK', new Date(2026, 9, 1)))).toBe('28 sept. – 4 oct. 2026');
    expect(formatInsightsPeriod(getInsightsPeriod('WEEK', new Date(2027, 0, 1)))).toBe(
      '28 déc. 2026 – 3 janv. 2027',
    );
  });

  it('labels the arrows after the period they move by', () => {
    expect(getInsightsNavigationLabels('DAY')).toEqual({ previous: 'Jour précédent', next: 'Jour suivant' });
    expect(getInsightsNavigationLabels('YEAR')).toEqual({ previous: 'Année précédente', next: 'Année suivante' });
  });
});

describe('formatInsightsClientName', () => {
  it('shows the first name and the initial of the last name only', () => {
    expect(formatInsightsClientName(client('a', ' Amel ', 'benali'))).toBe('Amel B.');
    expect(formatInsightsClientName(client('b', 'Nadia'))).toBe('Nadia');
    expect(formatInsightsClientName(undefined)).toBe('Client inconnu');
  });
});

describe('buildInsightsReceipt', () => {
  it('words counts with French singular and plural', () => {
    expect(formatCompletedAppointments(0)).toBe('0 rendez-vous réalisés');
    expect(formatCompletedAppointments(1)).toBe('1 rendez-vous réalisé');
    expect(formatCompletedAppointments(32)).toBe('32 rendez-vous réalisés');
  });

  it('renders the rankings with their rank, value and spoken position', () => {
    const clients = new Map([
      ['amel', client('amel', 'Amel', 'Benali')],
      ['nadia', client('nadia', 'Nadia', 'Fares')],
    ]);
    const model = buildInsightsReceipt(
      insights({
        isEmpty: false,
        cash: { totalCents: 842000, cardCents: 842000, cashCents: 0, checkoutCount: 40 },
        completedAppointmentCount: 32,
        averageAppointmentValueCents: 7400,
        topServices: [
          { serviceId: 's1', serviceName: 'Balayage', count: 18 },
          { serviceId: 's2', serviceName: 'Frange', count: 1 },
        ],
        topProducts: [
          { productId: 'p1', productName: 'Shampooing', unitCount: 12 },
          { productId: 'p2', productName: 'Huile', unitCount: 1 },
        ],
        topSpendingClients: [{ clientId: 'amel', spendingCents: 62000, completedAppointmentCount: 7 }],
        topLoyalClients: [
          { clientId: 'amel', spendingCents: 62000, completedAppointmentCount: 7 },
          { clientId: 'nadia', spendingCents: 1000, completedAppointmentCount: 1 },
        ],
      }),
      (clientId) => clients.get(clientId),
    );

    expect(model.cashCollected).toBe(formatEuroCents(842000));
    expect(model.completedAppointments).toBe('32 rendez-vous réalisés');
    expect(model.averageAppointmentValue).toBe(formatEuroCents(7400));
    expect(model.activityNote).toBeUndefined();
    expect(model.sections.map((section) => section.title)).toEqual([
      'Top prestations',
      'Top produits',
      'Clients qui dépensent le plus',
      'Clients les plus fidèles',
    ]);

    const [services, products, spending, loyal] = model.sections;
    // The domain order is kept as is: rank 1 is the first domain row.
    expect(services!.rows.map((row) => [row.rank, row.label, row.value])).toEqual([
      [1, 'Balayage', '18 prestations'],
      [2, 'Frange', '1 prestation'],
    ]);
    expect(services!.rows[0]!.accessibilityLabel).toBe('Première place, Balayage, 18 prestations');
    expect(products!.rows.map((row) => row.value)).toEqual(['12 unités', '1 unité']);
    expect(products!.rows.map((row) => row.value).join(' ')).not.toMatch(/vendu/);
    expect(products!.rows[0]!.accessibilityLabel).toBe('Première place, Shampooing, 12 unités');
    expect(spending!.rows[0]!.accessibilityLabel).toBe(`Première place, Amel B., ${formatEuroCents(62000)}`);
    expect(loyal!.rows.map((row) => row.accessibilityLabel)).toEqual([
      'Première place, Amel B., 7 rendez-vous',
      'Deuxième place, Nadia F., 1 rendez-vous',
    ]);
    // Written short, so it never truncates to « rendez-v… »; still spoken in full.
    expect(loyal!.rows.map((row) => row.value)).toEqual(['7 rdv', '1 rdv']);
  });

  it('carries the stable client id of a place only for a client who still exists, only on the ticket', () => {
    const clients = new Map([['amel', client('amel', 'Amel', 'Benali')]]);
    const source = insights({
      isEmpty: false,
      topServices: [{ serviceId: 's1', serviceName: 'Balayage', count: 18 }],
      topProducts: [{ productId: 'p1', productName: 'Shampooing', unitCount: 12 }],
      topSpendingClients: [
        { clientId: 'amel', spendingCents: 62000, completedAppointmentCount: 7 },
        { clientId: 'gone', spendingCents: 1000, completedAppointmentCount: 1 },
      ],
      topLoyalClients: [
        { clientId: 'gone', spendingCents: 1000, completedAppointmentCount: 9 },
        { clientId: 'amel', spendingCents: 62000, completedAppointmentCount: 7 },
      ],
    });
    const [services, products, spending, loyal] = buildInsightsReceipt(source, (id) => clients.get(id)).sections;

    // The id is the client's own, never derived from the displayed name.
    expect(spending!.rows.map((row) => [row.label, row.clientId])).toEqual([
      ['Amel B.', 'amel'],
      ['Client inconnu', undefined],
    ]);
    // A client who is gone keeps their rank and metric; only the id is missing.
    expect(loyal!.rows.map((row) => [row.rank, row.label, row.value, row.clientId])).toEqual([
      [1, 'Client inconnu', '9 rdv', undefined],
      [2, 'Amel B.', '7 rdv', 'amel'],
    ]);
    expect(loyal!.rows[0]).not.toHaveProperty('clientId');
    // Services and products never open anything.
    for (const row of [...services!.rows, ...products!.rows]) expect(row).not.toHaveProperty('clientId');
    // Nor does any public row, whoever the client is.
    for (const section of buildInsightsRankingSections(source, (id) => clients.get(id), 'public')) {
      for (const row of section.rows) expect(row).not.toHaveProperty('clientId');
    }
  });

  it('always keeps the four categories, never padded, each with its own empty message', () => {
    const model = buildInsightsReceipt(
      insights({ isEmpty: false, topServices: [{ serviceId: 's', serviceName: 'Coupe', count: 1 }] }),
      () => undefined,
    );
    expect(model.sections.map((section) => section.key)).toEqual([
      'services',
      'products',
      'spendingClients',
      'loyalClients',
    ]);
    expect(model.sections.map((section) => section.rows.length)).toEqual([1, 0, 0, 0]);
    expect(model.sections.map((section) => section.emptyMessage)).toEqual([
      'Aucune prestation sur cette période',
      'Aucun produit vendu sur cette période',
      'Aucune dépense sur cette période',
      'Aucun rendez-vous réalisé sur cette période',
    ]);
  });

  it('adds one quiet activity note only on a period without any activity', () => {
    expect(buildInsightsReceipt(insights(), () => undefined)).toMatchObject({
      isEmpty: true,
      activityNote: 'Aucune activité sur cette période',
      completedAppointments: '0 rendez-vous réalisés',
      cashCollected: formatEuroCents(0),
    });
    expect(
      buildInsightsReceipt(
        insights({ isEmpty: false, cash: { totalCents: 3000, cardCents: 3000, cashCents: 0, checkoutCount: 1 } }),
        () => undefined,
      ).activityNote,
    ).toBeUndefined();
  });

  it('mentions unresolved financial conflicts, and only then', () => {
    expect(buildInsightsReceipt(insights(), () => undefined).conflictNote).toBeUndefined();
    expect(buildInsightsReceipt(insights({ financialConflictCount: 1 }), () => undefined).conflictNote).toBe(
      '1 rendez-vous avec un conflit financier à résoudre n’est pas compté dans l’activité.',
    );
    expect(buildInsightsReceipt(insights({ financialConflictCount: 2 }), () => undefined).conflictNote).toBe(
      '2 rendez-vous avec un conflit financier à résoudre ne sont pas comptés dans l’activité.',
    );
  });
});

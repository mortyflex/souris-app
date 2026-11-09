import { getAppointmentDaySummary, type Appointment } from '@/domain/appointments';
import {
  getCashRegisterDayInterval,
  getCashRegisterPeriodBreakdown,
  type CashRegisterPeriodBreakdown,
  type CashRegisterSources,
} from '@/domain/cash-register';
import type { Sale, SaleAdjustment } from '@/domain/sales';
import { formatEuroCents } from '@/shared/lib/money';

import {
  buildDaySummaryReceipt,
  buildSummaryEncashment,
  formatArticleCount,
  formatDaySummaryCount,
  formatDaySummaryDate,
} from '../day-summary-receipt';

const day = new Date(2026, 8, 21);
const encashmentOf = (sources: CashRegisterSources): CashRegisterPeriodBreakdown =>
  getCashRegisterPeriodBreakdown(sources, getCashRegisterDayInterval(day));
const nothingCollected = encashmentOf({ appointments: [], sales: [] });

function appointment(overrides: Partial<Appointment> & Pick<Appointment, 'id'>): Appointment {
  return {
    businessId: 'business-a',
    clientId: 'client-julie',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 8, 21, 9, 5),
    status: 'SCHEDULED',
    items: [
      {
        id: 'cut',
        serviceId: 'cut',
        order: 0,
        serviceName: 'Coupe',
        serviceType: 'SERVICE',
        price: 42,
        phases: [{ id: 'cut-phase', name: 'Coupe', durationMinutes: 45, requiresStaff: true }],
      },
    ],
    ...overrides,
  };
}

const clientLabels: Record<string, string> = { 'client-julie': 'Julie Martin' };
const getClientLabel = (clientId: string) => clientLabels[clientId] ?? 'Client inconnu';

describe('day summary receipt', () => {
  it('writes the full French date, whatever the day', () => {
    expect(formatDaySummaryDate(day)).toBe('Lundi 21 septembre');
    expect(formatDaySummaryDate(new Date(2027, 0, 1))).toBe('Vendredi 1 janvier');
  });

  it('counts Appointments in words', () => {
    expect(formatDaySummaryCount(0)).toBe('Aucun rendez-vous');
    expect(formatDaySummaryCount(1)).toBe('1 rendez-vous');
    expect(formatDaySummaryCount(7)).toBe('7 rendez-vous');
  });

  it('words one row per Appointment from its snapshots and its Client', () => {
    const paid = appointment({
      id: 'paid',
      status: 'COMPLETED',
      payment: { paidAt: new Date(2026, 8, 21, 10, 0), cardAmountCents: 4200, cashAmountCents: 0 },
    });
    const upcoming = appointment({
      id: 'upcoming',
      clientId: 'client-gone',
      startAt: new Date(2026, 8, 21, 14, 30),
    });
    const summary = getAppointmentDaySummary({ appointments: [upcoming, paid], sales: [] }, day);

    const model = buildDaySummaryReceipt(summary, day, getClientLabel, encashmentOf({ appointments: [upcoming, paid], sales: [] }));

    expect(model.title).toBe('Résumé du jour');
    expect(model.activity).toBeUndefined();
    expect(model.isEmpty).toBe(false);
    expect(model.countLabel).toBe('2 rendez-vous');
    expect(model.rows).toEqual([
      {
        key: 'paid',
        time: '09:05',
        serviceLabel: 'Coupe',
        clientLabel: 'Julie Martin',
        amount: formatEuroCents(4200),
        collected: true,
        accessibilityLabel: `09:05, Coupe, Julie Martin, ${formatEuroCents(4200)}, encaissé`,
      },
      {
        key: 'upcoming',
        time: '14:30',
        serviceLabel: 'Coupe',
        clientLabel: 'Client inconnu',
        amount: formatEuroCents(4200),
        collected: false,
        accessibilityLabel: `14:30, Coupe, Client inconnu, ${formatEuroCents(4200)}`,
      },
    ]);
    expect(model.potentialRevenue).toBe(formatEuroCents(8400));
    expect(model.metrics).toEqual([
      { key: 'collected', label: 'Déjà encaissé', value: formatEuroCents(4200) },
      { key: 'remaining', label: 'Reste à encaisser', value: formatEuroCents(4200) },
      { key: 'duration', label: 'Temps total', value: '1 h 30 min' },
      { key: 'averageBasket', label: 'Panier moyen', value: formatEuroCents(4200) },
    ]);
  });

  it('stays neutral on a free day', () => {
    const model = buildDaySummaryReceipt(
      getAppointmentDaySummary({ appointments: [], sales: [] }, day),
      day,
      getClientLabel,
      nothingCollected,
    );

    expect(model.isEmpty).toBe(true);
    expect(model.countLabel).toBe('Aucun rendez-vous');
    expect(model.rows).toEqual([]);
    expect(model.potentialRevenue).toBe(formatEuroCents(0));
    expect(model.metrics.map((metric) => metric.value)).toEqual([
      formatEuroCents(0),
      formatEuroCents(0),
      '0 min',
      formatEuroCents(0),
    ]);
    // Encaissements at zero too: never hidden, never an error — and no counter without an article.
    expect(model.encashment.lines.map((line) => [line.label, line.value])).toEqual([
      ['Rendez-vous', formatEuroCents(0)],
      ['Ventes de produits', formatEuroCents(0)],
      ['Total encaissé', formatEuroCents(0)],
    ]);
    expect(model.encashment.lines.every((line) => line.count === undefined)).toBe(true);
    expect(model.encashment.lines[1]?.accessibilityLabel).toBe(`Ventes de produits, ${formatEuroCents(0)}`);
  });

  describe('« Encaissements du jour » — the Caisse of the day, by origin', () => {
    const at = (hour: number, minute = 0) => new Date(2026, 8, 21, hour, minute);
    const paidAppointment = appointment({
      id: 'paid',
      status: 'COMPLETED',
      items: [
        {
          id: 'gel',
          serviceId: 'gel',
          order: 0,
          serviceName: 'Pose gel',
          serviceType: 'SERVICE',
          price: 150,
          phases: [{ id: 'gel-phase', name: 'Pose', durationMinutes: 90, requiresStaff: true }],
        },
      ],
      payment: { paidAt: at(10, 30), cardAmountCents: 15000, cashAmountCents: 0 },
    });
    const productSale: Sale = {
      id: 'sale',
      businessId: 'business-a',
      completedAt: at(11),
      items: [
        { id: 'l1', productId: 'oil', productName: 'Huile cuticules', unitPrice: 12, quantity: 1 },
        { id: 'l2', productId: 'shampoo', productName: 'Shampooing doux', unitPrice: 16.5, quantity: 2 },
      ],
      payment: { paidAt: at(11), cardAmountCents: 4500, cashAmountCents: 0 },
    };
    const refund: SaleAdjustment = {
      id: 'refund',
      businessId: 'business-a',
      saleId: 'sale',
      kind: 'REFUND',
      reason: 'CUSTOMER_REFUND',
      staffMemberId: 'staff-a',
      items: [],
      refundCardCents: 1000,
      refundCashCents: 0,
      initialStatus: 'SETTLED',
      status: 'SETTLED',
      refundedAt: at(17),
      settledAt: at(17),
      recordedAt: at(17),
    };

    it('150 € of Appointments + 45 € of products: 195 € collected, the articles counted', () => {
      const sources = { appointments: [paidAppointment], sales: [productSale] };
      const model = buildDaySummaryReceipt(
        getAppointmentDaySummary(sources, day),
        day,
        getClientLabel,
        encashmentOf(sources),
      );

      expect(model.encashment.title).toBe('Encaissements du jour');
      expect(model.encashment.lines).toEqual([
        {
          key: 'appointments',
          label: 'Rendez-vous',
          value: formatEuroCents(15000),
          accessibilityLabel: `Rendez-vous, ${formatEuroCents(15000)}`,
        },
        {
          key: 'productSales',
          label: 'Ventes de produits',
          // 1 oil + 2 shampoos: physical units, no product name.
          count: '(3 articles)',
          value: formatEuroCents(4500),
          accessibilityLabel: `Ventes de produits, 3 articles, ${formatEuroCents(4500)}`,
        },
        {
          key: 'total',
          label: 'Total encaissé',
          value: formatEuroCents(19500),
          accessibilityLabel: `Total encaissé, ${formatEuroCents(19500)}`,
        },
      ]);
      expect(model.encashment.note).toBeUndefined();
      // The Appointment figures keep their meaning: the day's Appointments only.
      expect(model.potentialRevenue).toBe(formatEuroCents(15000));
      expect(model.metrics[0]).toEqual({ key: 'collected', label: 'Déjà encaissé', value: formatEuroCents(15000) });
    });

    it('counts articles, not products: one article, then one product ×4', () => {
      expect(formatArticleCount(1)).toBe('1 article');
      expect(formatArticleCount(6)).toBe('6 articles');
      const sale = (quantity: number): Sale => ({
        ...productSale,
        items: [{ id: 'l', productId: 'oil', productName: 'Huile cuticules', unitPrice: 12, quantity }],
        payment: { paidAt: at(11), cardAmountCents: 1200 * quantity, cashAmountCents: 0 },
      });
      const one = buildSummaryEncashment(encashmentOf({ appointments: [], sales: [sale(1)] }), 'Encaissements du jour');
      expect(one.lines[1]).toMatchObject({ count: '(1 article)', value: formatEuroCents(1200) });
      expect(one.lines[1]?.accessibilityLabel).toBe(`Ventes de produits, 1 article, ${formatEuroCents(1200)}`);
      const four = buildSummaryEncashment(encashmentOf({ appointments: [], sales: [sale(4)] }), 'Encaissements du jour');
      expect(four.lines[1]).toMatchObject({ count: '(4 articles)', value: formatEuroCents(4800) });
      // However many products: ONE line, no product name anywhere in the block.
      expect(JSON.stringify(four)).not.toMatch(/Huile/);
    });

    it('an unpaid Sale adds no article and no money', () => {
      const unpaid: Sale = { ...productSale, id: 'unpaid', payment: undefined };
      const encashment = buildSummaryEncashment(
        encashmentOf({ appointments: [], sales: [unpaid, productSale] }),
        'Encaissements du jour',
      );
      expect(encashment.lines[1]).toMatchObject({ count: '(3 articles)', value: formatEuroCents(4500) });
    });

    it('a 10 € refund settled the same day: its own line, 185 € collected', () => {
      const encashment = buildSummaryEncashment(
        encashmentOf({ appointments: [paidAppointment], sales: [productSale], saleAdjustments: [refund] }),
        'Encaissements du jour',
      );
      expect(encashment.lines.map((line) => [line.key, line.value])).toEqual([
        ['appointments', formatEuroCents(15000)],
        ['productSales', formatEuroCents(4500)],
        ['refunds', formatEuroCents(-1000)],
        ['total', formatEuroCents(18500)],
      ]);
      expect(encashment.lines[2]?.accessibilityLabel).toBe(`Remboursements, ${formatEuroCents(-1000)}`);
      // The refund is money: the articles sold stay 3.
      expect(encashment.lines[1]?.count).toBe('(3 articles)');
    });

    it('says that products sold during an Appointment are collected with it', () => {
      const revente: Sale = {
        id: 'revente',
        businessId: 'business-a',
        appointmentId: 'paid',
        completedAt: at(10, 30),
        items: [{ id: 'r1', productId: 'oil', productName: 'Huile cuticules', unitPrice: 12, quantity: 1 }],
      };
      const encashment = buildSummaryEncashment(
        encashmentOf({ appointments: [paidAppointment], sales: [revente] }),
        'Encaissements du jour',
      );
      expect(encashment.note).toBe('Les produits vendus pendant un rendez-vous sont encaissés avec celui-ci.');
      // Never counted under « Ventes de produits »: its money is in the Appointment checkout.
      expect(encashment.lines.find((line) => line.key === 'productSales')?.count).toBeUndefined();
    });
  });
});

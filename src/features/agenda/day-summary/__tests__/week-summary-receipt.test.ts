import {
  getAppointmentDaySummary,
  getAppointmentPeriodActivity,
  getAppointmentPeriodSummary,
  type Appointment,
} from '@/domain/appointments';
import {
  getCashRegisterDayInterval,
  getCashRegisterDaysInterval,
  getCashRegisterPeriodBreakdown,
  type CashRegisterSources,
} from '@/domain/cash-register';
import type { Sale } from '@/domain/sales';
import { formatEuroCents } from '@/shared/lib/money';

import { buildDaySummaryReceipt, buildSummaryMetrics } from '../day-summary-receipt';
import { buildWeekSummaryReceipt, formatWeekSummaryRange } from '../week-summary-receipt';

const monday = new Date(2026, 8, 21);
const week = { firstDay: monday, lastDay: new Date(2026, 8, 27) };
const weekEncashment = (sources: CashRegisterSources) =>
  getCashRegisterPeriodBreakdown(sources, getCashRegisterDaysInterval(week.firstDay, week.lastDay));

function appointment(overrides: Partial<Appointment> & Pick<Appointment, 'id'>): Appointment {
  return {
    businessId: 'business-a',
    clientId: 'client-julie',
    staffMemberId: 'staff-a',
    startAt: new Date(2026, 8, 21, 9, 0),
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

describe('week summary receipt', () => {
  it('writes the week range in full French, the year once', () => {
    expect(formatWeekSummaryRange(monday)).toBe('21 – 27 septembre 2026');
    expect(formatWeekSummaryRange(new Date(2026, 8, 28))).toBe('28 septembre – 4 octobre 2026');
    expect(formatWeekSummaryRange(new Date(2026, 11, 28))).toBe('28 décembre 2026 – 3 janvier 2027');
  });

  it('words the week on the paper of the day: same total, same breakdown', () => {
    const appointments = [
      appointment({
        id: 'paid',
        status: 'COMPLETED',
        payment: { paidAt: new Date(2026, 8, 21, 10, 0), cardAmountCents: 4200, cashAmountCents: 0 },
      }),
      appointment({ id: 'upcoming', startAt: new Date(2026, 8, 25, 14, 0) }),
      appointment({ id: 'cancelled', startAt: new Date(2026, 8, 23, 9, 0), status: 'CANCELLED' }),
      appointment({ id: 'absent', startAt: new Date(2026, 8, 24, 9, 0), status: 'NO_SHOW' }),
    ];
    const summary = getAppointmentPeriodSummary({ appointments, sales: [] }, week);

    const model = buildWeekSummaryReceipt(
      summary,
      getAppointmentPeriodActivity(appointments, week),
      monday,
      weekEncashment({ appointments, sales: [] }),
    );

    expect(model.title).toBe('Résumé de la semaine');
    expect(model.dateLabel).toBe('21 – 27 septembre 2026');
    expect(model.countLabel).toBe('2 rendez-vous');
    expect(model.isEmpty).toBe(false);
    // No Appointment list: the week's big picture only.
    expect(model.rows).toEqual([]);
    expect(model.activity).toEqual([
      { key: 'completed', label: 'Réalisés', value: '1', accessibilityLabel: '1 rendez-vous réalisé' },
      { key: 'planned', label: 'Prévus', value: '1', accessibilityLabel: '1 rendez-vous prévu' },
      { key: 'cancelled', label: 'Annulés', value: '1', accessibilityLabel: '1 rendez-vous annulé' },
      { key: 'noShow', label: 'Absences', value: '1', accessibilityLabel: '1 absence' },
    ]);
    expect(model.potentialRevenue).toBe(formatEuroCents(8400));
    expect(model.metrics).toEqual(buildSummaryMetrics(summary));
    expect(model.metrics).toEqual([
      { key: 'collected', label: 'Déjà encaissé', value: formatEuroCents(4200) },
      { key: 'remaining', label: 'Reste à encaisser', value: formatEuroCents(4200) },
      { key: 'duration', label: 'Temps total', value: '1 h 30 min' },
      { key: 'averageBasket', label: 'Panier moyen', value: formatEuroCents(4200) },
    ]);
  });

  it('prints a zero week without a special state', () => {
    const summary = getAppointmentPeriodSummary({ appointments: [], sales: [] }, week);
    const model = buildWeekSummaryReceipt(
      summary,
      getAppointmentPeriodActivity([], week),
      monday,
      weekEncashment({ appointments: [], sales: [] }),
    );

    expect(model.countLabel).toBe('Aucun rendez-vous');
    expect(model.isEmpty).toBe(true);
    expect(model.activity?.map((line) => [line.value, line.accessibilityLabel])).toEqual([
      ['0', '0 rendez-vous réalisé'],
      ['0', '0 rendez-vous prévu'],
      ['0', '0 rendez-vous annulé'],
      ['0', '0 absence'],
    ]);
    expect(model.potentialRevenue).toBe(formatEuroCents(0));
    expect(model.encashment.lines.map((line) => line.value)).toEqual([
      formatEuroCents(0),
      formatEuroCents(0),
      formatEuroCents(0),
    ]);
  });

  it('adds the week’s Caisse: Appointments and product sales of the seven days, the articles counted', () => {
    const appointments = [
      appointment({
        id: 'paid',
        status: 'COMPLETED',
        payment: { paidAt: new Date(2026, 8, 21, 10, 0), cardAmountCents: 4200, cashAmountCents: 0 },
      }),
    ];
    const sale = (id: string, paidAt: Date, quantity: number): Sale => ({
      id,
      businessId: 'business-a',
      completedAt: paidAt,
      items: [{ id: `${id}-1`, productId: 'polish', productName: 'Vernis', unitPrice: 9, quantity }],
      payment: { paidAt, cardAmountCents: 900 * quantity, cashAmountCents: 0 },
    });
    // Tuesday and Sunday 23:59 are in; the next Monday 00:00 is not.
    const sales = [
      sale('tue', new Date(2026, 8, 22, 11), 2),
      sale('sun', new Date(2026, 8, 27, 23, 59), 1),
      sale('next', new Date(2026, 8, 28, 0, 0), 5),
    ];
    const summary = getAppointmentPeriodSummary({ appointments, sales }, week);

    const model = buildWeekSummaryReceipt(
      summary,
      getAppointmentPeriodActivity(appointments, week),
      monday,
      weekEncashment({ appointments, sales }),
    );

    expect(model.encashment.title).toBe('Encaissements de la semaine');
    // Tuesday ×2 + Sunday ×1 = 3 articles; next Monday's 5 belong to the next week.
    expect(model.encashment.lines.map((line) => [line.label, line.count, line.value])).toEqual([
      ['Rendez-vous', undefined, formatEuroCents(4200)],
      ['Ventes de produits', '(3 articles)', formatEuroCents(2700)],
      ['Total encaissé', undefined, formatEuroCents(6900)],
    ]);
    // « Déjà encaissé » stays the Appointments' money.
    expect(model.metrics[0]?.value).toBe(formatEuroCents(4200));
  });

  it('leaves the day receipt figures untouched by the shared breakdown', () => {
    const day = monday;
    const sources = { appointments: [appointment({ id: 'a' })], sales: [] };
    const summary = getAppointmentDaySummary(sources, day);
    const encashment = getCashRegisterPeriodBreakdown(sources, getCashRegisterDayInterval(day));
    expect(buildDaySummaryReceipt(summary, day, () => 'Julie', encashment).metrics).toEqual(buildSummaryMetrics(summary));
  });
});

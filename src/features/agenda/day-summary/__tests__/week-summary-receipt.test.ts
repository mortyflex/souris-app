import {
  getAppointmentDaySummary,
  getAppointmentPeriodActivity,
  getAppointmentPeriodSummary,
  type Appointment,
} from '@/domain/appointments';
import { formatEuroCents } from '@/shared/lib/money';

import { buildDaySummaryReceipt, buildSummaryMetrics } from '../day-summary-receipt';
import { buildWeekSummaryReceipt, formatWeekSummaryRange } from '../week-summary-receipt';

const monday = new Date(2026, 8, 21);
const week = { firstDay: monday, lastDay: new Date(2026, 8, 27) };

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

    const model = buildWeekSummaryReceipt(summary, getAppointmentPeriodActivity(appointments, week), monday);

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
    const model = buildWeekSummaryReceipt(summary, getAppointmentPeriodActivity([], week), monday);

    expect(model.countLabel).toBe('Aucun rendez-vous');
    expect(model.isEmpty).toBe(true);
    expect(model.activity?.map((line) => [line.value, line.accessibilityLabel])).toEqual([
      ['0', '0 rendez-vous réalisé'],
      ['0', '0 rendez-vous prévu'],
      ['0', '0 rendez-vous annulé'],
      ['0', '0 absence'],
    ]);
    expect(model.potentialRevenue).toBe(formatEuroCents(0));
  });

  it('leaves the day receipt figures untouched by the shared breakdown', () => {
    const day = monday;
    const summary = getAppointmentDaySummary({ appointments: [appointment({ id: 'a' })], sales: [] }, day);
    expect(buildDaySummaryReceipt(summary, day, () => 'Julie').metrics).toEqual(buildSummaryMetrics(summary));
  });
});

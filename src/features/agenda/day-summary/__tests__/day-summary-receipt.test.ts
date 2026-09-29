import { getAppointmentDaySummary, type Appointment } from '@/domain/appointments';
import { formatEuroCents } from '@/shared/lib/money';

import {
  buildDaySummaryReceipt,
  formatDaySummaryCount,
  formatDaySummaryDate,
} from '../day-summary-receipt';

const day = new Date(2026, 8, 21);

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

    const model = buildDaySummaryReceipt(summary, day, getClientLabel);

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
  });
});

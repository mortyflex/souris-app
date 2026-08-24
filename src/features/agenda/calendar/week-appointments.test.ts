import type { Appointment, AppointmentItem } from '@/domain/appointments';

import {
  getWeekAppointmentServiceSummary,
  groupAppointmentsByLocalDay,
} from './week-appointments';

function appointment(id: string, startAt: Date, itemNames: readonly string[]): Appointment {
  const items: AppointmentItem[] = itemNames.map((serviceName, index) => ({
    id: `${id}-item-${index}`,
    serviceId: `${id}-service-${index}`,
    order: index,
    serviceName,
    serviceType: 'SERVICE',
    price: 40,
    phases: [{
      id: `${id}-phase-${index}`,
      name: serviceName,
      durationMinutes: 30,
      requiresStaff: true,
    }],
  }));
  return {
    id,
    businessId: 'business-a',
    clientId: `client-${id}`,
    staffMemberId: 'staff-a',
    startAt,
    status: 'SCHEDULED',
    items,
  };
}

function fixture(id: string, startAt: Date, clientName = id) {
  return { appointment: appointment(id, startAt, ['Coupe']), clientName };
}

describe('Agenda week appointment helpers', () => {
  it('groups same-day appointments, sorts them, and preserves empty days', () => {
    const monday = new Date(2026, 7, 24);
    const days = [monday, new Date(2026, 7, 25), new Date(2026, 7, 26)];
    const grouped = groupAppointmentsByLocalDay(
      [
        fixture('late', new Date(2026, 7, 24, 11, 0)),
        fixture('early', new Date(2026, 7, 24, 9, 0)),
        fixture('tuesday', new Date(2026, 7, 25, 10, 0)),
      ],
      days,
    );

    expect(grouped[0].appointments.map(({ appointment: value }) => value.id)).toEqual(['early', 'late']);
    expect(grouped[1].appointments.map(({ appointment: value }) => value.id)).toEqual(['tuesday']);
    expect(grouped[2].appointments).toHaveLength(0);
  });

  it('does not let input order control day rendering', () => {
    const days = [new Date(2026, 7, 24)];
    const values = [
      fixture('b', new Date(2026, 7, 24, 10, 0)),
      fixture('a', new Date(2026, 7, 24, 9, 0)),
    ];

    const forward = groupAppointmentsByLocalDay(values, days);
    const reverse = groupAppointmentsByLocalDay([...values].reverse(), days);

    expect(forward).toEqual(reverse);
  });

  it('summarizes one and multiple ordered services without duplicate names', () => {
    expect(getWeekAppointmentServiceSummary(appointment('one', new Date(), ['Coupe']))).toBe('Coupe');
    expect(
      getWeekAppointmentServiceSummary(appointment('two', new Date(), ['Coloration', 'Coupe'])),
    ).toBe('Coloration + Coupe');
    expect(
      getWeekAppointmentServiceSummary(appointment('duplicate', new Date(), ['Coupe', 'Coupe', 'Brushing'])),
    ).toBe('Coupe + Brushing');
  });
});

import type { Appointment, AppointmentItem, AppointmentStatus } from '@/domain/appointments';

import { getOperationalAgendaEntries } from '../operational-visibility';

import {
  getWeekAppointmentServiceSummary,
  groupAppointmentsByLocalDay,
} from './week-appointments';

function appointment(
  id: string,
  startAt: Date,
  itemNames: readonly string[],
  status: AppointmentStatus = 'SCHEDULED',
): Appointment {
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
    status,
    items,
  };
}

function fixture(id: string, startAt: Date, status?: AppointmentStatus) {
  return { appointment: appointment(id, startAt, ['Coupe'], status) };
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

  it('groups only operational rows after the Agenda visibility projection', () => {
    const monday = new Date(2026, 7, 24);
    const grouped = groupAppointmentsByLocalDay(
      getOperationalAgendaEntries([
        fixture('scheduled', new Date(2026, 7, 24, 9), 'SCHEDULED'),
        fixture('confirmed', new Date(2026, 7, 24, 10), 'CONFIRMED'),
        fixture('completed', new Date(2026, 7, 24, 11), 'COMPLETED'),
        fixture('cancelled', new Date(2026, 7, 24, 12), 'CANCELLED'),
        fixture('no-show', new Date(2026, 7, 24, 13), 'NO_SHOW'),
      ]),
      [monday],
    );

    expect(grouped[0].appointments.map(({ appointment: value }) => value.id)).toEqual([
      'scheduled',
      'confirmed',
      'completed',
    ]);
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

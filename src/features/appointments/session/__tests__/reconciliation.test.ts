import type { Appointment, AppointmentItem } from '@/domain/appointments';

import { reconcileAppointmentEntriesForLocalDay } from '../reconciliation';
import type { AppointmentSessionEntry } from '../types';

const item: AppointmentItem = {
  id: 'item-a',
  order: 0,
  phases: [{ id: 'phase-a', durationMinutes: 30, name: 'Coupe', requiresStaff: true }],
  price: 42,
  serviceId: 'service-a',
  serviceName: 'Coupe',
  serviceType: 'SERVICE',
};

function entry(
  id: string,
  startAt: Date,
  status: Appointment['status'],
): AppointmentSessionEntry {
  return {
    appointment: {
      businessId: 'business-a',
      clientId: 'client-a',
      id,
      items: [item],
      staffMemberId: 'staff-a',
      startAt,
      status,
    },
  };
}

describe('Appointment session reconciliation', () => {
  it('changes only eligible prior-local-day entries', () => {
    const previousDay = entry('previous', new Date(2026, 7, 29, 15), 'SCHEDULED');
    const sameDay = entry('same-day', new Date(2026, 7, 30, 9), 'SCHEDULED');
    const cancelled = entry('cancelled', new Date(2026, 7, 29, 10), 'CANCELLED');
    const values = [previousDay, sameDay, cancelled];

    const result = reconcileAppointmentEntriesForLocalDay(
      values,
      new Date(2026, 7, 30, 8),
    );

    expect(result).not.toBe(values);
    expect(result[0]).not.toBe(previousDay);
    expect(result[0].appointment.status).toBe('COMPLETED');
    expect(result[1]).toBe(sameDay);
    expect(result[2]).toBe(cancelled);
  });

  it('returns the same references when reconciliation has no work', () => {
    const values = [
      entry('same-day', new Date(2026, 7, 30, 9), 'SCHEDULED'),
      entry('completed', new Date(2026, 7, 29, 10), 'COMPLETED'),
    ];

    const result = reconcileAppointmentEntriesForLocalDay(
      values,
      new Date(2026, 7, 30, 8),
    );

    expect(result).toBe(values);
  });

  it('is idempotent after completing prior-day entries', () => {
    const first = reconcileAppointmentEntriesForLocalDay(
      [entry('previous', new Date(2026, 7, 29, 15), 'CONFIRMED')],
      new Date(2026, 7, 30, 8),
    );
    const second = reconcileAppointmentEntriesForLocalDay(
      first,
      new Date(2026, 7, 30, 8),
    );

    expect(second).toBe(first);
  });
});

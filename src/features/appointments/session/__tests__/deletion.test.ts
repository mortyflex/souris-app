import type { AppointmentStatus } from '@/domain/appointments';

import { removeAppointmentEntryById } from '../deletion';
import type { AppointmentSessionEntry } from '../types';

function entry(id: string, status: AppointmentStatus = 'SCHEDULED'): AppointmentSessionEntry {
  return {
    appointment: {
      id,
      businessId: 'business-a',
      clientId: 'client-a',
      staffMemberId: 'staff-a',
      startAt: new Date(2026, 7, 24, 10),
      status,
      items: [],
    },
  };
}

describe('removeAppointmentEntryById', () => {
  it('removes the exact id immutably and preserves every other entry', () => {
    const first = entry('first');
    const removed = entry('removed', 'COMPLETED');
    const last = entry('last');
    const source = [first, removed, last];

    const result = removeAppointmentEntryById(source, 'removed');

    expect(result).toEqual([first, last]);
    expect(result).not.toBe(source);
    expect(result[0]).toBe(first);
    expect(result[1]).toBe(last);
    expect(source).toEqual([first, removed, last]);
  });

  it('returns the same collection for an unknown id', () => {
    const source = [entry('first'), entry('second')];

    expect(removeAppointmentEntryById(source, 'unknown')).toBe(source);
  });
});

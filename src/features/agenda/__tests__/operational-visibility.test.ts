import type { AppointmentStatus } from '@/domain/appointments';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

import { getOperationalAgendaEntries } from '../operational-visibility';

function entry(id: string, status: AppointmentStatus): AppointmentSessionEntry {
  return {
    appointment: {
      id,
      businessId: 'business-a',
      clientId: `client-${id}`,
      staffMemberId: 'staff-a',
      startAt: new Date(2026, 7, 24, 14),
      status,
      items: [],
    },
  };
}

describe('getOperationalAgendaEntries', () => {
  it('keeps scheduled, confirmed, in-progress, and completed occupancy', () => {
    const entries = [
      entry('scheduled', 'SCHEDULED'),
      entry('confirmed', 'CONFIRMED'),
      entry('in-progress', 'IN_PROGRESS'),
      entry('completed', 'COMPLETED'),
    ];

    expect(
      getOperationalAgendaEntries(entries).map(({ appointment }) => appointment.id),
    ).toEqual(['scheduled', 'confirmed', 'in-progress', 'completed']);
  });

  it('removes cancelled and no-show records without mutating the source', () => {
    const scheduled = entry('scheduled', 'SCHEDULED');
    const cancelled = entry('cancelled', 'CANCELLED');
    const noShow = entry('no-show', 'NO_SHOW');
    const source = [cancelled, scheduled, noShow];

    const result = getOperationalAgendaEntries(source);

    expect(result).toEqual([scheduled]);
    expect(result[0]).toBe(scheduled);
    expect(source).toEqual([cancelled, scheduled, noShow]);
  });
});

import type { AppointmentStatus } from '@/domain/appointments';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

import { getOperationalAgendaEntries } from '../operational-visibility';
import { getMonthGridDays } from '@/shared/ui/month-grid';

import { getAppointmentDayDecoration, getAppointmentDayKeys } from './month';
import { getLocalDateKey, isSameLocalDay } from './week';

function entry(id: string, startAt: Date, status: AppointmentStatus = 'SCHEDULED'): AppointmentSessionEntry {
  return {
    appointment: {
      id,
      businessId: 'fixture-business',
      clientId: 'client-lea',
      staffMemberId: 'staff-amelie',
      startAt,
      status,
      items: [],
    },
  } as unknown as AppointmentSessionEntry;
}

describe('Agenda month calendar helpers', () => {
  it('marks a day once, however many appointments it holds, and leaves free days unmarked', () => {
    const keys = getAppointmentDayKeys([
      entry('a', new Date(2026, 8, 23, 9)),
      entry('b', new Date(2026, 8, 23, 11)),
      entry('c', new Date(2026, 8, 23, 17, 30)),
      entry('d', new Date(2026, 8, 25, 10)),
    ]);

    expect(keys.size).toBe(2);
    expect(keys.has(getLocalDateKey(new Date(2026, 8, 23)))).toBe(true);
    expect(keys.has(getLocalDateKey(new Date(2026, 8, 25)))).toBe(true);
    expect(keys.has(getLocalDateKey(new Date(2026, 8, 24)))).toBe(false);
  });

  it('files an appointment near midnight on the same local day as the Agenda day filter', () => {
    const lateEvening = new Date(2026, 8, 30, 23, 45);
    const earlyMorning = new Date(2026, 9, 1, 0, 15);
    const keys = getAppointmentDayKeys([entry('late', lateEvening), entry('early', earlyMorning)]);

    for (const day of getMonthGridDays(new Date(2026, 8, 1))) {
      const agendaShowsOne = [lateEvening, earlyMorning].some((startAt) => isSameLocalDay(startAt, day));
      expect(keys.has(getLocalDateKey(day))).toBe(agendaShowsOne);
    }
    expect(keys.has(getLocalDateKey(new Date(2026, 8, 30)))).toBe(true);
    expect(keys.has(getLocalDateKey(new Date(2026, 9, 1)))).toBe(true);
  });

  it('marks only what the Agenda shows: cancelled and no-show appointments release their day', () => {
    const keys = getAppointmentDayKeys(
      getOperationalAgendaEntries([
        entry('completed', new Date(2026, 8, 21, 10), 'COMPLETED'),
        entry('confirmed', new Date(2026, 8, 22, 10), 'CONFIRMED'),
        entry('cancelled', new Date(2026, 8, 23, 10), 'CANCELLED'),
        entry('no-show', new Date(2026, 8, 24, 10), 'NO_SHOW'),
      ]),
    );

    expect(keys.has(getLocalDateKey(new Date(2026, 8, 21)))).toBe(true);
    expect(keys.has(getLocalDateKey(new Date(2026, 8, 22)))).toBe(true);
    expect(keys.has(getLocalDateKey(new Date(2026, 8, 23)))).toBe(false);
    expect(keys.has(getLocalDateKey(new Date(2026, 8, 24)))).toBe(false);
  });

  it('decorates busy days with ONE dot, spoken in words, and leaves free days plain', () => {
    const keys = getAppointmentDayKeys([entry('a', new Date(2026, 8, 23, 9))]);

    expect(getAppointmentDayDecoration(keys, new Date(2026, 8, 23))).toEqual({
      dot: true,
      accessibilityDetail: 'rendez-vous prévus',
    });
    expect(getAppointmentDayDecoration(keys, new Date(2026, 8, 24))).toBeUndefined();
    // The Agenda never paints revenue intensity.
    expect(getAppointmentDayDecoration(keys, new Date(2026, 8, 23))).not.toHaveProperty('intensity');
  });
});

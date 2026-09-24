import type { AppointmentStatus } from '@/domain/appointments';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

import { getOperationalAgendaEntries } from '../operational-visibility';
import {
  addLocalMonths,
  getAppointmentDayKeys,
  getMonthGridDays,
  isSameLocalMonth,
  MONTH_GRID_DAY_COUNT,
  startOfLocalMonth,
} from './month';
import { getLocalDateKey, isSameLocalDay } from './week';

const ymd = (date: Date) => [date.getFullYear(), date.getMonth() + 1, date.getDate()];

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
  it('lays out six Monday-first weeks around the month, with real adjacent days', () => {
    // 1 September 2026 is a Tuesday.
    const days = getMonthGridDays(new Date(2026, 8, 23));

    expect(days).toHaveLength(MONTH_GRID_DAY_COUNT);
    expect(ymd(days[0]!)).toEqual([2026, 8, 31]);
    expect(days[0]!.getDay()).toBe(1);
    expect(ymd(days[1]!)).toEqual([2026, 9, 1]);
    expect(ymd(days[30]!)).toEqual([2026, 9, 30]);
    expect(ymd(days[41]!)).toEqual([2026, 10, 11]);
    expect(days[41]!.getDay()).toBe(0);
    // Every cell is a distinct local midnight.
    expect(new Set(days.map(getLocalDateKey)).size).toBe(MONTH_GRID_DAY_COUNT);
    expect(days.every((day) => day.getHours() === 0 && day.getMinutes() === 0)).toBe(true);
  });

  it('starts on the 1st when the month begins on a Monday', () => {
    // 1 June 2026 is a Monday.
    const days = getMonthGridDays(new Date(2026, 5, 15));
    expect(ymd(days[0]!)).toEqual([2026, 6, 1]);
  });

  it('browses months across a year boundary without drifting on short months', () => {
    expect(ymd(addLocalMonths(new Date(2026, 11, 1), 1))).toEqual([2027, 1, 1]);
    expect(ymd(addLocalMonths(new Date(2026, 0, 1), -1))).toEqual([2025, 12, 1]);
    // From a 31st the month still moves by exactly one.
    expect(ymd(addLocalMonths(startOfLocalMonth(new Date(2026, 0, 31)), 1))).toEqual([2026, 2, 1]);
    expect(isSameLocalMonth(new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59))).toBe(true);
    expect(isSameLocalMonth(new Date(2026, 8, 30), new Date(2026, 9, 1))).toBe(false);
  });

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
});

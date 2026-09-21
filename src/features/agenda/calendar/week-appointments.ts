import type { CalendarBlock } from '@/domain/calendar-blocks';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { getLocalDateKey } from './week';

export { formatAppointmentServiceSummary as getWeekAppointmentServiceSummary } from '@/features/appointments/presentation';

export interface WeekDayAppointments {
  readonly day: Date;
  readonly appointments: readonly AppointmentSessionEntry[];
}

/** One row of a Week day: a client Appointment or personal unavailability. */
export type WeekDayRow =
  | { readonly type: 'APPOINTMENT'; readonly key: string; readonly startAt: Date; readonly value: AppointmentSessionEntry }
  | { readonly type: 'CALENDAR_BLOCK'; readonly key: string; readonly startAt: Date; readonly calendarBlock: CalendarBlock };

export function groupAppointmentsByLocalDay(
  appointments: readonly AppointmentSessionEntry[],
  days: readonly Date[],
): readonly WeekDayAppointments[] {
  const grouped = new Map<string, AppointmentSessionEntry[]>();
  for (const day of days) {
    grouped.set(getLocalDateKey(day), []);
  }

  for (const appointment of appointments) {
    const dayAppointments = grouped.get(getLocalDateKey(appointment.appointment.startAt));
    if (dayAppointments) {
      dayAppointments.push(appointment);
    }
  }

  return days.map((day) => ({
    day,
    appointments: [...(grouped.get(getLocalDateKey(day)) ?? [])].sort(
      (a, b) =>
        a.appointment.startAt.getTime() - b.appointment.startAt.getTime() ||
        a.appointment.id.localeCompare(b.appointment.id),
    ),
  }));
}

/** The Calendar Blocks that START on `day` (a block never leaves its day), chronologically. */
export function getCalendarBlocksOfLocalDay(
  calendarBlocks: readonly CalendarBlock[],
  day: Date,
): readonly CalendarBlock[] {
  const dayKey = getLocalDateKey(day);
  return calendarBlocks
    .filter((calendarBlock) => getLocalDateKey(calendarBlock.startAt) === dayKey)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id));
}

/**
 * The rows of ONE Week day in chronological order: Appointments and Calendar
 * Blocks share the list, exactly as they share the Day timeline. At the same
 * start time the block comes first — it says why the slot is taken.
 */
export function mergeWeekDayRows(
  appointments: readonly AppointmentSessionEntry[],
  calendarBlocks: readonly CalendarBlock[],
): readonly WeekDayRow[] {
  const rows: WeekDayRow[] = [
    ...calendarBlocks.map((calendarBlock) => ({
      type: 'CALENDAR_BLOCK' as const,
      key: `calendar-block:${calendarBlock.id}`,
      startAt: calendarBlock.startAt,
      calendarBlock,
    })),
    ...appointments.map((value) => ({
      type: 'APPOINTMENT' as const,
      key: `appointment:${value.appointment.id}`,
      startAt: value.appointment.startAt,
      value,
    })),
  ];
  // Stable sort: blocks stay ahead of Appointments starting at the same minute.
  return rows.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

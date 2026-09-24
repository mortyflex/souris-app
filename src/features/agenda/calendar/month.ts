import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import type { MonthCalendarDayDecoration } from '@/shared/ui/MonthCalendarSheet';

import { getLocalDateKey } from './week';

/**
 * The local days holding at least one of `entries`, keyed like the Agenda
 * day filter (`getLocalDateKey`), so the calendar and the Day view always
 * agree on which day an Appointment belongs to. The caller decides which
 * entries count (the Agenda passes its operational entries).
 */
export function getAppointmentDayKeys(entries: readonly AppointmentSessionEntry[]): ReadonlySet<string> {
  return new Set(entries.map(({ appointment }) => getLocalDateKey(appointment.startAt)));
}

const APPOINTMENT_DAY: MonthCalendarDayDecoration = { dot: true, accessibilityDetail: 'rendez-vous prévus' };

/**
 * The Agenda decoration of the shared month calendar: ONE quiet dot on every
 * shown day holding appointments, adjacent-month days included.
 */
export function getAppointmentDayDecoration(
  appointmentDayKeys: ReadonlySet<string>,
  day: Date,
): MonthCalendarDayDecoration | undefined {
  return appointmentDayKeys.has(getLocalDateKey(day)) ? APPOINTMENT_DAY : undefined;
}

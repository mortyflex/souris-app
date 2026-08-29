import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { getLocalDateKey } from './week';

export { formatAppointmentServiceSummary as getWeekAppointmentServiceSummary } from '@/features/appointments/presentation';

export interface WeekDayAppointments {
  readonly day: Date;
  readonly appointments: readonly AppointmentSessionEntry[];
}

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

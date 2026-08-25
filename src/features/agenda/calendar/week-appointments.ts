import { getOrderedItems, type Appointment } from '@/domain/appointments';

import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { getLocalDateKey } from './week';

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

export function getWeekAppointmentServiceSummary(appointment: Appointment): string {
  const names = [...new Set(
    getOrderedItems(appointment)
      .map((item) => item.serviceName.trim())
      .filter((name) => name.length > 0),
  )];

  if (names.length <= 2) {
    return names.join(' + ');
  }

  const remaining = names.length - 2;
  return `${names.slice(0, 2).join(' + ')} + ${remaining} autre${remaining > 1 ? 's' : ''}`;
}

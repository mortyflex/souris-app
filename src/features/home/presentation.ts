// Souris — Accueil presentation
//
// Wording and selection for the Accueil tab. Nothing is computed about money
// or time here: the figures come from the domain day summary
// (`getAppointmentDaySummary`), the same source as « Résumé du jour ».

import { doesAppointmentOccupySchedule } from '@/domain/appointments';
import {
  formatAppointmentDate,
  formatAppointmentTime,
} from '@/features/appointments/presentation';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';

/** « Bonsoir » from 18:00, « Bonjour » before. */
export function formatHomeGreeting(now: Date): string {
  return now.getHours() >= 18 ? 'Bonsoir' : 'Bonjour';
}

/**
 * The next Appointment still to come: it occupies the schedule (the Agenda's
 * own rule — cancellations and no-shows are left out), is not completed, and
 * starts at or after `now`. The nearest one; ties keep a stable order by id.
 */
export function getNextAppointment(
  entries: readonly AppointmentSessionEntry[],
  now: Date,
): AppointmentSessionEntry | undefined {
  let next: AppointmentSessionEntry | undefined;
  for (const entry of entries) {
    const { appointment } = entry;
    if (!doesAppointmentOccupySchedule(appointment.status)) continue;
    if (appointment.status === 'COMPLETED') continue;
    if (appointment.startAt.getTime() < now.getTime()) continue;
    if (
      next === undefined ||
      appointment.startAt.getTime() < next.appointment.startAt.getTime() ||
      (appointment.startAt.getTime() === next.appointment.startAt.getTime() &&
        appointment.id.localeCompare(next.appointment.id) < 0)
    ) {
      next = entry;
    }
  }
  return next;
}

function localDayDistance(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((end - start) / 86_400_000);
}

/** `Aujourd’hui · 10:00`, `Demain · 09:30`, otherwise `Mer. 7 octobre · 14:00`. */
export function formatNextAppointmentWhen(startAt: Date, now: Date): string {
  const distance = localDayDistance(now, startAt);
  const day =
    distance === 0 ? 'Aujourd’hui' : distance === 1 ? 'Demain' : formatAppointmentDate(startAt);
  return `${day} · ${formatAppointmentTime(startAt)}`;
}

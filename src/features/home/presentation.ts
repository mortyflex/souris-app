// BeautIzzy — Accueil presentation
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

/**
 * `10:00` today — the card is already about today, so the day is not said —
 * `Demain · 09:30`, otherwise `Mer. 7 octobre · 14:00`.
 */
export function formatNextAppointmentWhen(startAt: Date, now: Date): string {
  const distance = localDayDistance(now, startAt);
  const time = formatAppointmentTime(startAt);
  if (distance === 0) return time;
  return `${distance === 1 ? 'Demain' : formatAppointmentDate(startAt)} · ${time}`;
}

const dayLongMonthFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const dayShortMonthFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/**
 * The seven days from `firstDay` for the « Cette semaine » card: never a year
 * (the week is the current one), and short enough for half a row.
 *
 *   `5–11 octobre` · `28 sept. – 4 oct.` · `28 déc. – 3 janv.`
 *
 * « Résumé de la semaine » keeps its own full wording (`formatWeekSummaryRange`).
 */
export function formatHomeWeekRange(firstDay: Date): string {
  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + 6);
  if (firstDay.getMonth() === lastDay.getMonth()) {
    return `${firstDay.getDate()}–${dayLongMonthFormatter.format(lastDay)}`;
  }
  return `${dayShortMonthFormatter.format(firstDay)} – ${dayShortMonthFormatter.format(lastDay)}`;
}

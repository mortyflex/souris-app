// BeautIzzy — Accueil presentation
//
// Wording and selection for the Accueil tab. Nothing is computed about money
// or time here: the figures come from the domain day summary
// (`getAppointmentDaySummary`), the same source as « Résumé du jour ».
//
// The one rule of its own is WHEN the greeting card reminds of an Appointment
// left to collect (`getHomeEncashmentInsight`): it reads the day summary rows
// as they are and only adds a moment — the planned end plus a grace period.

import {
  doesAppointmentOccupySchedule,
  getAppointmentEndAt,
  type Appointment,
  type AppointmentDaySummaryRow,
} from '@/domain/appointments';
import type { Client } from '@/domain/clients';
import {
  formatAppointmentDate,
  formatAppointmentTime,
} from '@/features/appointments/presentation';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import { getResolvedClientDisplayName } from '@/features/clients/presentation';

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

/**
 * BeautIzzy stores no actual end of an Appointment, only its planned one, and
 * the professional may simply be running late. The greeting card therefore
 * waits this long after the planned end before it reminds of anything. A Home
 * presentation rule: the Appointment lifecycle knows nothing of it.
 */
export const HOME_ENCASHMENT_GRACE_MINUTES = 15;

export interface HomeEncashmentInsight {
  /** The OLDEST Appointment left to collect: the one the card opens. */
  readonly appointment: Appointment;
  /** How many Appointments of today are left to collect, the oldest included. */
  readonly count: number;
}

/**
 * The Appointments of TODAY that still have money to collect, from the rows of
 * the day summary (`getAppointmentDaySummary`) — which already leave out
 * cancellations and no-shows and already know what is settled and what is
 * left. Nothing about money is decided here. A row qualifies when:
 *
 *   - it is not settled (`collected === false`);
 *   - something is left (`remainingCents > 0`): a fully prepaid visit awaits
 *     « Terminer », not a payment, and a free one owes nothing;
 *   - its planned end (`getAppointmentEndAt`, processing included) is at least
 *     `HOME_ENCASHMENT_GRACE_MINUTES` behind `now`.
 *
 * Whatever its status: an Appointment nobody completed by hand qualifies too.
 * The oldest by start time is the target (ties by id); undefined without any.
 */
export function getHomeEncashmentInsight(
  rows: readonly AppointmentDaySummaryRow[],
  now: Date,
): HomeEncashmentInsight | undefined {
  const latestEnd = now.getTime() - HOME_ENCASHMENT_GRACE_MINUTES * 60_000;
  const outstanding = rows
    .filter(
      (row) =>
        !row.collected &&
        row.remainingCents > 0 &&
        getAppointmentEndAt(row.appointment).getTime() <= latestEnd,
    )
    .map((row) => row.appointment)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || a.id.localeCompare(b.id));
  if (outstanding.length === 0) return undefined;
  return { appointment: outstanding[0], count: outstanding.length };
}

/** The two lines the greeting card shows under « Bonjour », and what it says aloud. */
export interface HomeEncashmentReminder {
  /** Secondary, ONE visual line: `09:00 · Alicia` (first name only), or `2 rendez-vous`. */
  readonly detail: string;
  /** The emphasis line: « Reste à encaisser » / « restent à encaisser ». */
  readonly emphasis: string;
  /** The whole reminder and its action, with the client name in full. */
  readonly accessibilityLabel: string;
}

/**
 * One Appointment is named by its time and its client; several are counted.
 * The narrow card SHOWS the first name alone, on every phone — the surname
 * would be cut on most of them — and SAYS the full display name. A client
 * without a first name, or one that no longer exists, keeps the display name.
 * « Reste à encaisser », never « pas encore encaissé »: a deposit may already
 * have been received.
 */
export function formatHomeEncashmentReminder(
  insight: HomeEncashmentInsight,
  client: Client | undefined,
): HomeEncashmentReminder {
  if (insight.count > 1) {
    return {
      detail: `${insight.count} rendez-vous`,
      emphasis: 'restent à encaisser',
      accessibilityLabel: `${insight.count} rendez-vous restent à encaisser. Ouvrir le plus ancien.`,
    };
  }
  const time = formatAppointmentTime(insight.appointment.startAt);
  const clientName = getResolvedClientDisplayName(client);
  return {
    detail: `${time} · ${client?.firstName.trim() || clientName}`,
    emphasis: 'Reste à encaisser',
    accessibilityLabel: `Rendez-vous de ${time} avec ${clientName}. Reste à encaisser. Ouvrir le rendez-vous.`,
  };
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

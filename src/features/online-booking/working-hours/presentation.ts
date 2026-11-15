// BeautIzzy — working hours copy and readings
//
// French product copy of Plus › Horaires and the ONE way a working day is put
// into words (overview rows, the day sheet, screen readers). Minutes are
// wall-clock minutes of the Business time zone: they are formatted as they
// are, never through a Date.

import type {
  IsoWeekday,
  WorkingDay,
  WorkingDayIssue,
  WorkingInterval,
  WorkingIntervalIssue,
} from '@/domain/online-booking';

export const WORKING_HOURS_TITLE = 'Horaires';
export const WORKING_HOURS_ROW_TITLE = 'Horaires';
export const WORKING_HOURS_ROW_META = 'Jours et heures de travail';

export const WORKING_HOURS_INTRO =
  'Les jours et les heures où vous travaillez. La réservation en ligne s’en servira pour proposer des créneaux ; votre agenda, lui, reste entièrement libre.';
export const WORKING_HOURS_OFFLINE_NOTICE = 'Connexion nécessaire pour afficher et modifier vos horaires.';
export const WORKING_HOURS_SAVED = 'Horaires enregistrés.';
export const WORKING_HOURS_SAVE_FAILURE =
  'Vos horaires n’ont pas été enregistrés. Vérifiez votre connexion et réessayez.';
export const WORKING_HOURS_SAVE_REFUSED =
  'Ces horaires n’ont pas pu être enregistrés. Vérifiez les plages et réessayez.';
export const WORKING_HOURS_BREAK_HINT = 'Une pause sépare deux plages horaires.';
export const WORKING_HOURS_ADD_INTERVAL = 'Ajouter une plage';
export const WORKING_HOURS_REMOVE_INTERVAL = 'Retirer';
export const WORKING_DAY_CLOSED = 'Fermé';

export const WORKING_DAY_ISSUE_MESSAGES: Readonly<Record<WorkingDayIssue, string>> = {
  INTERVAL_REQUIRED: 'Ajoutez une plage horaire, ou fermez ce jour.',
  TOO_MANY_INTERVALS: 'Quatre plages au maximum par jour.',
};

export const WORKING_INTERVAL_ISSUE_MESSAGES: Readonly<Record<WorkingIntervalIssue, string>> = {
  INVALID_MINUTE: 'Cette heure n’est pas valide.',
  END_NOT_AFTER_START: 'La fin doit être après le début.',
  OVERLAP: 'Cette plage chevauche une autre plage.',
};

const WEEKDAY_NAMES: Readonly<Record<IsoWeekday, string>> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
};

/** « Lundi ». */
export function formatWeekday(weekday: IsoWeekday): string {
  return WEEKDAY_NAMES[weekday];
}

/** « Horaires proposés à partir du lundi » — hours copied from another day into a closed one. */
export function formatSuggestedHoursSource(weekday: IsoWeekday): string {
  return `Horaires proposés à partir du ${WEEKDAY_NAMES[weekday].toLowerCase()}`;
}

export const WORKING_HOURS_SUGGESTION_HINT = 'Vous pouvez les modifier avant de les enregistrer.';

/** « Ouvert le lundi » — the switch of the day sheet. */
export function formatOpenSwitchLabel(weekday: IsoWeekday): string {
  return `Ouvert le ${WEEKDAY_NAMES[weekday].toLowerCase()}`;
}

const twoDigits = (value: number) => value.toString().padStart(2, '0');

/** « 09:00 »; the end of the day reads « 24:00 ». */
export function formatMinuteOfDay(minute: number): string {
  return `${twoDigits(Math.floor(minute / 60))}:${twoDigits(minute % 60)}`;
}

/** « 9 heures », « 12 heures 30 » — never « 09:00 » for a screen reader. */
export function formatSpokenMinuteOfDay(minute: number): string {
  const hour = Math.floor(minute / 60);
  const rest = minute % 60;
  const hours = `${hour} ${hour <= 1 ? 'heure' : 'heures'}`;
  return rest === 0 ? hours : `${hours} ${twoDigits(rest)}`;
}

/** « 09:00 – 12:00 ». */
export function formatWorkingInterval(interval: WorkingInterval): string {
  return `${formatMinuteOfDay(interval.startMinute)} – ${formatMinuteOfDay(interval.endMinute)}`;
}

/** « 09:00 – 12:00 · 14:00 – 19:00 », or « Fermé ». */
export function formatWorkingDaySummary(day: WorkingDay): string {
  if (!day.isOpen || day.intervals.length === 0) return WORKING_DAY_CLOSED;
  return day.intervals.map(formatWorkingInterval).join(' · ');
}

/** « Lundi, de 9 heures à 12 heures, puis de 14 heures à 19 heures », or « Mardi, fermé ». */
export function formatSpokenWorkingDay(day: WorkingDay): string {
  const name = WEEKDAY_NAMES[day.weekday];
  if (!day.isOpen || day.intervals.length === 0) return `${name}, fermé`;
  const ranges = day.intervals.map(
    (interval) =>
      `de ${formatSpokenMinuteOfDay(interval.startMinute)} à ${formatSpokenMinuteOfDay(interval.endMinute)}`,
  );
  return `${name}, ${ranges.join(', puis ')}`;
}

/** « Horaires à l’heure de Paris. » — the time zone every minute of the week is read in. */
export function describeWorkingHoursTimeZone(timeZone: string): string {
  if (timeZone === 'Europe/Paris') return 'Horaires à l’heure de Paris.';
  return `Horaires à l’heure locale (${timeZone}).`;
}

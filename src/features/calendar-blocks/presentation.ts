// BeautIzzy — Calendar Block wording
//
// « Indisponible » is the primary information everywhere a block appears; the
// reason is secondary. No client, service or price wording exists here.

import type { CalendarBlock, CalendarBlockConflict } from '@/domain/calendar-blocks';

export const CALENDAR_BLOCK_TITLE = 'Indisponible';

const twoDigits = (value: number) => value.toString().padStart(2, '0');

/** Local wall-clock time: « 10:05 ». */
export function formatBlockTime(date: Date): string {
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

/** « 10:00 – 11:30 ». */
export function formatBlockTimeRange(interval: Pick<CalendarBlock, 'startAt' | 'endAt'>): string {
  return `${formatBlockTime(interval.startAt)} – ${formatBlockTime(interval.endAt)}`;
}

/** « Lundi 21 sept. » */
export function formatBlockDate(date: Date): string {
  const value = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    weekday: 'long',
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Compact date of the form's Date row: « Mar. 25 août ». */
export function formatBlockDateShort(date: Date): string {
  const value = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Spoken date of the form's Date row: « mardi 25 août », never abbreviated. */
export function formatSpokenBlockDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
  }).format(date);
}

/** Spoken time: « 10 heures », « 11 heures 30 », « 1 heure 05 ». */
export function formatSpokenBlockTime(date: Date): string {
  const hour = date.getHours();
  const minute = date.getMinutes();
  const hours = `${hour} ${hour <= 1 ? 'heure' : 'heures'}`;
  return minute === 0 ? hours : `${hours} ${twoDigits(minute)}`;
}

/** « Indisponible, Déplacement, de 10 heures à 11 heures 30 » — never relies on colour. */
export function getCalendarBlockAccessibilityLabel(block: CalendarBlock): string {
  return `${CALENDAR_BLOCK_TITLE}, ${block.reason}, de ${formatSpokenBlockTime(block.startAt)} à ${formatSpokenBlockTime(block.endAt)}`;
}

export interface ScheduleConflictMessage {
  readonly message: string;
  /** A calmer second line naming what is in the way. */
  readonly detail: string;
}

/** A client Appointment would run into this block. */
export function describeCalendarBlockInTheWay(block: CalendarBlock): ScheduleConflictMessage {
  return {
    message: `Ce créneau est marqué comme indisponible de ${formatBlockTime(block.startAt)} à ${formatBlockTime(block.endAt)}.`,
    detail: `${CALENDAR_BLOCK_TITLE} — ${block.reason}`,
  };
}

/**
 * A quick edit of an existing Appointment (duration, order, removal) would push
 * one of its staff-required intervals into this block. Nothing was changed.
 */
export function describeAppointmentChangeIntoCalendarBlock(
  block: CalendarBlock,
): ScheduleConflictMessage {
  return {
    message: 'Ce changement ferait empiéter le rendez-vous sur un créneau indisponible.',
    detail: `${CALENDAR_BLOCK_TITLE} — ${block.reason}, ${formatBlockTime(block.startAt)}–${formatBlockTime(block.endAt)}`,
  };
}

/** What prevents saving a Calendar Block. */
export function describeCalendarBlockConflict(conflict: CalendarBlockConflict): ScheduleConflictMessage {
  if (conflict.type === 'CALENDAR_BLOCK') return describeCalendarBlockInTheWay(conflict.block);
  return {
    message: 'Un rendez-vous est déjà prévu sur ce créneau.',
    detail: `Rendez-vous de ${formatBlockTime(conflict.busyInterval.startAt)} à ${formatBlockTime(conflict.busyInterval.endAt)}`,
  };
}

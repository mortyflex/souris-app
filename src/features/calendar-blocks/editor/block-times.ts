// Souris — Calendar Block editor times
//
// A block is defined explicitly by a start and an end, both on the SAME local
// day as the Agenda day it was opened from, on the same 5-minute wheels as an
// Appointment start. Pure local wall-clock arithmetic — the same construction
// as `creation/draft-start.ts` — so no UTC conversion ever shifts a block.
//
//   start   [day start, latest end − one step]      (08:00 … 23:50)
//   end     (start, 23:55]                           the wheels' last minute
//
// Moving the start keeps the chosen duration (the end follows, clamped to the
// day). Moving the end never moves the start: an end that is not after the
// start is reported as invalid and explained inline, never silently "fixed".

import { START_TIME_MINUTE_STEP } from '@/features/appointments/creation/draft-start';
import { agenda } from '@/shared/ui/theme';

export interface BlockTimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

export interface BlockTimes {
  readonly startAt: Date;
  readonly endAt: Date;
}

/** A sensible first proposal: long enough to be a real pause, short enough to adjust in one flick. */
export const DEFAULT_BLOCK_DURATION_MINUTES = 30;

export const BLOCK_MINUTE_STEP = START_TIME_MINUTE_STEP;

/** Earliest start: the first hour the Agenda canvas shows. */
export const BLOCK_MIN_START_MINUTES = agenda.dayStartHour * 60;
/** Latest end: the last minute the wheels offer on the selected day. */
export const BLOCK_MAX_END_MINUTES = 24 * 60 - BLOCK_MINUTE_STEP;
const BLOCK_MAX_START_MINUTES = BLOCK_MAX_END_MINUTES - BLOCK_MINUTE_STEP;

/** Hours both wheels offer (inclusive). */
export const blockHourRange = {
  minHour: Math.ceil(BLOCK_MIN_START_MINUTES / 60),
  maxHour: Math.floor(BLOCK_MAX_END_MINUTES / 60),
} as const;

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function atMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** The proposal shown when the form opens: the Agenda start, then +30 minutes. */
export function createInitialBlockTimes(agendaStartAt: Date): BlockTimes {
  const start = clamp(minutesOfDay(agendaStartAt), BLOCK_MIN_START_MINUTES, BLOCK_MAX_START_MINUTES);
  return {
    startAt: atMinutes(agendaStartAt, start),
    endAt: atMinutes(agendaStartAt, Math.min(start + DEFAULT_BLOCK_DURATION_MINUTES, BLOCK_MAX_END_MINUTES)),
  };
}

export function isBlockIntervalValid(times: BlockTimes): boolean {
  return times.endAt.getTime() > times.startAt.getTime();
}

/** New start on the same local day; the end follows so the duration is kept. */
export function setBlockStartTime(times: BlockTimes, time: BlockTimeOfDay): BlockTimes {
  const previousDuration = Math.round((times.endAt.getTime() - times.startAt.getTime()) / 60_000);
  const duration = previousDuration > 0 ? previousDuration : DEFAULT_BLOCK_DURATION_MINUTES;
  const start = clamp(time.hour * 60 + time.minute, BLOCK_MIN_START_MINUTES, BLOCK_MAX_START_MINUTES);
  return {
    startAt: atMinutes(times.startAt, start),
    endAt: atMinutes(times.startAt, Math.min(start + duration, BLOCK_MAX_END_MINUTES)),
  };
}

/** New end on the start's local day. The start never moves. */
export function setBlockEndTime(times: BlockTimes, time: BlockTimeOfDay): BlockTimes {
  const end = clamp(time.hour * 60 + time.minute, BLOCK_MIN_START_MINUTES, BLOCK_MAX_END_MINUTES);
  return { startAt: times.startAt, endAt: atMinutes(times.startAt, end) };
}

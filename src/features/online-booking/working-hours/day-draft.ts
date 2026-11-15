// BeautIzzy — the working day being edited (Plus › Horaires › a day)
//
// UX shortcuts of the day sheet only — what is SAVED is decided by the domain
// (validateWorkingDay / normalizeWorkingDay) and by the server. Nothing here
// fixes a value behind the professional's back: an end typed before its
// start stays as typed and is explained inline.
//
//   opening a closed day   proposes the intervals of the closest earlier open
//                          day of the week (a working week rarely changes
//                          from one day to the next) and remembers WHICH day
//                          they come from, so the sheet can say so; else
//                          09:00 – 18:00, which comes from no day
//   « Ajouter une plage »  proposes the next three hours, one hour after the
//                          latest end (the break), else before the earliest
//                          start; nothing when the day has no room left
//
// The wheels offer a 5-minute grid from 00:00 to 23:55.

import {
  ISO_WEEKDAYS,
  WORKING_INTERVALS_MAX_PER_DAY,
  type IsoWeekday,
  type WorkingDay,
  type WorkingInterval,
} from '@/domain/online-booking';

export const WORKING_MINUTE_STEP = 5;
/** The last minute the wheels offer. */
export const WORKING_LAST_WHEEL_MINUTE = 23 * 60 + 55;

export const DEFAULT_WORKING_INTERVAL: WorkingInterval = { startMinute: 9 * 60, endMinute: 18 * 60 };

const PROPOSED_BREAK_MINUTES = 60;
const PROPOSED_INTERVAL_MINUTES = 3 * 60;

export interface WorkingDayDraft {
  readonly weekday: IsoWeekday;
  readonly isOpen: boolean;
  /** Kept while the day is switched off, so switching it back on restores them. */
  readonly intervals: readonly WorkingInterval[];
  /**
   * The day whose saved hours were copied into this draft when it was
   * switched on. Absent for the day's own saved hours and for the default
   * 09:00 – 18:00. Kept with the intervals it describes.
   */
  readonly suggestedFrom?: IsoWeekday;
}

export function toWorkingDayDraft(day: WorkingDay): WorkingDayDraft {
  return { weekday: day.weekday, isOpen: day.isOpen, intervals: day.intervals };
}

export interface OpeningProposal {
  readonly intervals: readonly WorkingInterval[];
  /** The open day they are copied from; absent for the default 09:00 – 18:00. */
  readonly sourceWeekday?: IsoWeekday;
}

/** The intervals proposed when a closed day is switched on, and where they come from. */
export function proposeOpeningIntervals(week: readonly WorkingDay[], weekday: IsoWeekday): OpeningProposal {
  const position = ISO_WEEKDAYS.indexOf(weekday);
  for (let back = 1; back < ISO_WEEKDAYS.length; back += 1) {
    const earlier = ISO_WEEKDAYS[(position - back + ISO_WEEKDAYS.length) % ISO_WEEKDAYS.length];
    const day = week.find((candidate) => candidate.weekday === earlier);
    if (day !== undefined && day.isOpen && day.intervals.length > 0) {
      return { intervals: day.intervals, sourceWeekday: day.weekday };
    }
  }
  return { intervals: [DEFAULT_WORKING_INTERVAL] };
}

/** The interval « Ajouter une plage » proposes; undefined when there is no room or no slot left. */
export function proposeNextInterval(intervals: readonly WorkingInterval[]): WorkingInterval | undefined {
  if (intervals.length >= WORKING_INTERVALS_MAX_PER_DAY) return undefined;
  if (intervals.length === 0) return DEFAULT_WORKING_INTERVAL;

  const latestEnd = Math.max(...intervals.map((interval) => interval.endMinute));
  const after = latestEnd + PROPOSED_BREAK_MINUTES;
  if (after + WORKING_MINUTE_STEP <= WORKING_LAST_WHEEL_MINUTE) {
    return { startMinute: after, endMinute: Math.min(after + PROPOSED_INTERVAL_MINUTES, WORKING_LAST_WHEEL_MINUTE) };
  }

  const earliestStart = Math.min(...intervals.map((interval) => interval.startMinute));
  const before = earliestStart - PROPOSED_BREAK_MINUTES;
  if (before - WORKING_MINUTE_STEP >= 0) {
    return { startMinute: Math.max(before - PROPOSED_INTERVAL_MINUTES, 0), endMinute: before };
  }
  return undefined;
}

export function switchWorkingDay(
  draft: WorkingDayDraft,
  isOpen: boolean,
  week: readonly WorkingDay[],
): WorkingDayDraft {
  if (!isOpen) return { ...draft, isOpen: false };
  // Intervals already in the draft come back as they were, with their origin.
  if (draft.intervals.length > 0) return { ...draft, isOpen: true };
  const proposal = proposeOpeningIntervals(week, draft.weekday);
  return {
    weekday: draft.weekday,
    isOpen: true,
    intervals: proposal.intervals,
    ...(proposal.sourceWeekday !== undefined ? { suggestedFrom: proposal.sourceWeekday } : {}),
  };
}

/** The day the shown hours were copied from, while they are shown; undefined otherwise. */
export function suggestionSourceOf(draft: WorkingDayDraft): IsoWeekday | undefined {
  return draft.isOpen ? draft.suggestedFrom : undefined;
}

export function addWorkingInterval(draft: WorkingDayDraft): WorkingDayDraft {
  const next = proposeNextInterval(draft.intervals);
  return next === undefined ? draft : { ...draft, intervals: [...draft.intervals, next] };
}

export function removeWorkingInterval(draft: WorkingDayDraft, index: number): WorkingDayDraft {
  // The last interval of an open day is never removed: closing the day is the switch.
  if (draft.intervals.length <= 1) return draft;
  return { ...draft, intervals: draft.intervals.filter((_, position) => position !== index) };
}

export type WorkingIntervalEdge = 'start' | 'end';

/** One edge moves; the other never follows. */
export function setWorkingIntervalEdge(
  draft: WorkingDayDraft,
  index: number,
  edge: WorkingIntervalEdge,
  minute: number,
): WorkingDayDraft {
  return {
    ...draft,
    intervals: draft.intervals.map((interval, position) => {
      if (position !== index) return interval;
      return edge === 'start' ? { ...interval, startMinute: minute } : { ...interval, endMinute: minute };
    }),
  };
}

/** The day the draft would save (the domain normalizes it). */
export function toWorkingDay(draft: WorkingDayDraft): WorkingDay {
  return { weekday: draft.weekday, isOpen: draft.isOpen, intervals: draft.isOpen ? draft.intervals : [] };
}

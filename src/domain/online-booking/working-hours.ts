// BeautIzzy — the weekly working hours of a Business
//
// Seven ISO weekdays (1 = Monday … 7 = Sunday), each open or closed. An open
// day is one to four working intervals; a break is the gap between two of
// them. An interval is a pair of WALL-CLOCK minutes after local midnight in
// the time zone of the Business (540 = 09:00, 1440 = the end of the day):
// never an instant, never a UTC offset, never converted through a Date. The
// server alone resolves a concrete date into instants
// (online_booking_working_intervals, docs/architecture/ONLINE_BOOKING.md §7).
//
// The server is authoritative; these are the SAME rules as its validation
// (online_booking_working_day_issue), so the professional is told what is
// wrong before anything is sent. Ends are exclusive, like every interval of
// the product: two adjacent intervals do not overlap.
//
// Working hours describe when online booking may one day propose a slot.
// They never constrain manual scheduling: nothing in the Agenda reads them.

export const MINUTES_PER_DAY = 24 * 60;
export const WORKING_INTERVALS_MAX_PER_DAY = 4;

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Monday first, as the week is shown. */
export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

export interface WorkingInterval {
  /** Minutes after local midnight, 0 … 1439. */
  readonly startMinute: number;
  /** Minutes after local midnight, EXCLUSIVE, 1 … 1440. */
  readonly endMinute: number;
}

export interface WorkingDay {
  readonly weekday: IsoWeekday;
  readonly isOpen: boolean;
  /** Ignored — and never saved — while the day is closed. */
  readonly intervals: readonly WorkingInterval[];
}

/** What is wrong with the day as a whole. */
export type WorkingDayIssue = 'INTERVAL_REQUIRED' | 'TOO_MANY_INTERVALS';

/** What is wrong with one interval. */
export type WorkingIntervalIssue = 'INVALID_MINUTE' | 'END_NOT_AFTER_START' | 'OVERLAP';

export interface WorkingDayValidation {
  readonly valid: boolean;
  readonly dayIssue?: WorkingDayIssue;
  /**
   * One entry per interval, in the order given. An interval that overlaps an
   * EARLIER one of the list carries the overlap; the earlier one stays clean.
   */
  readonly intervalIssues: readonly (WorkingIntervalIssue | undefined)[];
}

export function isIsoWeekday(value: unknown): value is IsoWeekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7;
}

/** A whole number of minutes between local midnight and the end of the day, both included. */
export function isMinuteOfDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MINUTES_PER_DAY;
}

function intervalIssueOf(interval: WorkingInterval): WorkingIntervalIssue | undefined {
  if (!isMinuteOfDay(interval.startMinute) || !isMinuteOfDay(interval.endMinute)) return 'INVALID_MINUTE';
  if (interval.endMinute <= interval.startMinute) return 'END_NOT_AFTER_START';
  return undefined;
}

function overlaps(left: WorkingInterval, right: WorkingInterval): boolean {
  return left.startMinute < right.endMinute && right.startMinute < left.endMinute;
}

/** THE validation of one day. A closed day is always valid: its intervals are not saved. */
export function validateWorkingDay(day: WorkingDay): WorkingDayValidation {
  if (!day.isOpen) {
    return { valid: true, intervalIssues: day.intervals.map(() => undefined) };
  }
  const own = day.intervals.map(intervalIssueOf);
  const intervalIssues = day.intervals.map((interval, index) => {
    if (own[index] !== undefined) return own[index];
    const overlapsEarlier = day.intervals
      .slice(0, index)
      .some((earlier, earlierIndex) => own[earlierIndex] === undefined && overlaps(earlier, interval));
    return overlapsEarlier ? ('OVERLAP' as const) : undefined;
  });
  const dayIssue: WorkingDayIssue | undefined =
    day.intervals.length === 0
      ? 'INTERVAL_REQUIRED'
      : day.intervals.length > WORKING_INTERVALS_MAX_PER_DAY
        ? 'TOO_MANY_INTERVALS'
        : undefined;
  return {
    valid: dayIssue === undefined && intervalIssues.every((issue) => issue === undefined),
    ...(dayIssue !== undefined ? { dayIssue } : {}),
    intervalIssues,
  };
}

/** The day as it is saved and shown: no interval when closed, ascending otherwise. */
export function normalizeWorkingDay(day: WorkingDay): WorkingDay {
  if (!day.isOpen) return { weekday: day.weekday, isOpen: false, intervals: [] };
  const intervals = [...day.intervals].sort(
    (left, right) => left.startMinute - right.startMinute || left.endMinute - right.endMinute,
  );
  return { weekday: day.weekday, isOpen: true, intervals };
}

export function closedWorkingDay(weekday: IsoWeekday): WorkingDay {
  return { weekday, isOpen: false, intervals: [] };
}

/** Two days that would be saved identically. */
export function isSameWorkingDay(left: WorkingDay, right: WorkingDay): boolean {
  const a = normalizeWorkingDay(left);
  const b = normalizeWorkingDay(right);
  return (
    a.weekday === b.weekday &&
    a.isOpen === b.isOpen &&
    a.intervals.length === b.intervals.length &&
    a.intervals.every(
      (interval, index) =>
        interval.startMinute === b.intervals[index].startMinute &&
        interval.endMinute === b.intervals[index].endMinute,
    )
  );
}

import { closedWorkingDay, ISO_WEEKDAYS, type WorkingDay, type WorkingInterval } from '@/domain/online-booking';

import {
  addWorkingInterval,
  DEFAULT_WORKING_INTERVAL,
  proposeNextInterval,
  proposeOpeningIntervals,
  removeWorkingInterval,
  setWorkingIntervalEdge,
  suggestionSourceOf,
  switchWorkingDay,
  toWorkingDay,
  toWorkingDayDraft,
  WORKING_LAST_WHEEL_MINUTE,
} from '../day-draft';

const at = (startMinute: number, endMinute: number): WorkingInterval => ({ startMinute, endMinute });
const closedWeek = ISO_WEEKDAYS.map(closedWorkingDay);
const withDays = (...days: WorkingDay[]) =>
  closedWeek.map((closed) => days.find((day) => day.weekday === closed.weekday) ?? closed);

describe('working day draft — opening a closed day', () => {
  it('proposes 09:00 – 18:00 when no day is open yet, from no day at all', () => {
    expect(proposeOpeningIntervals(closedWeek, 3)).toEqual({ intervals: [DEFAULT_WORKING_INTERVAL] });
    expect(DEFAULT_WORKING_INTERVAL).toEqual(at(540, 1080));
  });

  it('proposes the hours of the closest EARLIER open day, and names it', () => {
    const week = withDays(
      { weekday: 1, isOpen: true, intervals: [at(600, 1140)] },
      { weekday: 2, isOpen: true, intervals: [at(540, 720), at(840, 1140)] },
    );
    expect(proposeOpeningIntervals(week, 3)).toEqual({ intervals: [at(540, 720), at(840, 1140)], sourceWeekday: 2 });
    expect(proposeOpeningIntervals(week, 2)).toEqual({ intervals: [at(600, 1140)], sourceWeekday: 1 });
    expect(proposeOpeningIntervals(week, 5)).toEqual({ intervals: [at(540, 720), at(840, 1140)], sourceWeekday: 2 });
  });

  it('wraps around the week: Monday copies the last open day', () => {
    const week = withDays({ weekday: 6, isOpen: true, intervals: [at(540, 960)] });
    expect(proposeOpeningIntervals(week, 1)).toEqual({ intervals: [at(540, 960)], sourceWeekday: 6 });
  });

  it('switching a day on uses the proposal; switching it off keeps the intervals for a moment', () => {
    const week = withDays({ weekday: 1, isOpen: true, intervals: [at(600, 1140)] });
    const opened = switchWorkingDay(toWorkingDayDraft(closedWorkingDay(2)), true, week);
    expect(opened).toEqual({ weekday: 2, isOpen: true, intervals: [at(600, 1140)], suggestedFrom: 1 });

    const edited = setWorkingIntervalEdge(opened, 0, 'end', 1020);
    const off = switchWorkingDay(edited, false, week);
    expect(off.isOpen).toBe(false);
    expect(switchWorkingDay(off, true, week).intervals).toEqual([at(600, 1020)]);
  });
});

describe('working day draft — where the shown hours come from', () => {
  const week = withDays({ weekday: 1, isOpen: true, intervals: [at(600, 1140)] });

  it('names the source day only while copied hours are shown', () => {
    const closed = toWorkingDayDraft(closedWorkingDay(2));
    expect(suggestionSourceOf(closed)).toBeUndefined();
    const opened = switchWorkingDay(closed, true, week);
    expect(suggestionSourceOf(opened)).toBe(1);
    const off = switchWorkingDay(opened, false, week);
    expect(suggestionSourceOf(off)).toBeUndefined();
    // The same copied hours come back, so the same source does.
    expect(suggestionSourceOf(switchWorkingDay(off, true, week))).toBe(1);
  });

  it('the default 09:00 – 18:00 names no day', () => {
    const opened = switchWorkingDay(toWorkingDayDraft(closedWorkingDay(2)), true, closedWeek);
    expect(opened.intervals).toEqual([DEFAULT_WORKING_INTERVAL]);
    expect(suggestionSourceOf(opened)).toBeUndefined();
  });

  it('a day with its own saved hours names no day, closed then reopened', () => {
    const own = toWorkingDayDraft({ weekday: 3, isOpen: true, intervals: [at(480, 720)] });
    expect(suggestionSourceOf(own)).toBeUndefined();
    const reopened = switchWorkingDay(switchWorkingDay(own, false, week), true, week);
    expect(reopened.intervals).toEqual([at(480, 720)]);
    expect(suggestionSourceOf(reopened)).toBeUndefined();
  });

  it('keeps the source through edits of the copied hours', () => {
    const opened = switchWorkingDay(toWorkingDayDraft(closedWorkingDay(2)), true, week);
    expect(suggestionSourceOf(addWorkingInterval(setWorkingIntervalEdge(opened, 0, 'end', 720)))).toBe(1);
  });

  it('a closed draft never saves its remembered intervals', () => {
    expect(toWorkingDay({ weekday: 4, isOpen: false, intervals: [at(540, 720)] })).toEqual(closedWorkingDay(4));
  });
});

describe('working day draft — « Ajouter une plage »', () => {
  it('proposes three hours, one hour after the latest end (the break)', () => {
    expect(proposeNextInterval([at(540, 720)])).toEqual(at(780, 960));
    expect(proposeNextInterval([at(840, 1020), at(540, 720)])).toEqual(at(1080, 1260));
  });

  it('stays within the wheels', () => {
    expect(proposeNextInterval([at(540, 1260)])).toEqual(at(1320, WORKING_LAST_WHEEL_MINUTE));
  });

  it('proposes before the earliest start when the evening is full', () => {
    expect(proposeNextInterval([at(720, 1410)])).toEqual(at(480, 660));
    expect(proposeNextInterval([at(120, 1410)])).toEqual(at(0, 60));
  });

  it('proposes nothing when the day has no room left, or four intervals', () => {
    expect(proposeNextInterval([at(60, 1430)])).toBeUndefined();
    expect(proposeNextInterval([at(60, 120), at(180, 240), at(300, 360), at(420, 480)])).toBeUndefined();
  });

  it('adds the proposal at the end of the list, never reorders while editing', () => {
    const draft = { weekday: 1 as const, isOpen: true, intervals: [at(540, 720)] };
    expect(addWorkingInterval(draft).intervals).toEqual([at(540, 720), at(780, 960)]);
    const full = { ...draft, intervals: [at(60, 120), at(180, 240), at(300, 360), at(420, 480)] };
    expect(addWorkingInterval(full)).toBe(full);
  });
});

describe('working day draft — editing', () => {
  const draft = { weekday: 1 as const, isOpen: true, intervals: [at(540, 720), at(840, 1140)] };

  it('moves one edge; the other never follows, even past it', () => {
    expect(setWorkingIntervalEdge(draft, 0, 'start', 480).intervals).toEqual([at(480, 720), at(840, 1140)]);
    expect(setWorkingIntervalEdge(draft, 1, 'end', 600).intervals).toEqual([at(540, 720), at(840, 600)]);
  });

  it('removes an interval, but never the last one of an open day', () => {
    expect(removeWorkingInterval(draft, 0).intervals).toEqual([at(840, 1140)]);
    const single = { ...draft, intervals: [at(540, 720)] };
    expect(removeWorkingInterval(single, 0)).toBe(single);
  });
});

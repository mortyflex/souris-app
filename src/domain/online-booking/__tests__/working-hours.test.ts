import {
  closedWorkingDay,
  isIsoWeekday,
  isSameWorkingDay,
  ISO_WEEKDAYS,
  normalizeWorkingDay,
  validateWorkingDay,
  type WorkingDay,
  type WorkingInterval,
} from '../working-hours';

const at = (startMinute: number, endMinute: number): WorkingInterval => ({ startMinute, endMinute });
const open = (...intervals: WorkingInterval[]): WorkingDay => ({ weekday: 1, isOpen: true, intervals });

describe('working hours — the week', () => {
  it('is seven ISO weekdays, Monday first', () => {
    expect(ISO_WEEKDAYS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ISO_WEEKDAYS.every(isIsoWeekday)).toBe(true);
    expect([0, 8, 1.5, '1', null].some(isIsoWeekday)).toBe(false);
  });

  it('a closed day has no interval', () => {
    expect(closedWorkingDay(3)).toEqual({ weekday: 3, isOpen: false, intervals: [] });
  });
});

describe('working hours — validation (the server rules)', () => {
  it('accepts one interval, and a break between two', () => {
    expect(validateWorkingDay(open(at(540, 1080))).valid).toBe(true);
    expect(validateWorkingDay(open(at(540, 720), at(840, 1140))).valid).toBe(true);
  });

  it('accepts adjacent intervals: ends are exclusive', () => {
    expect(validateWorkingDay(open(at(540, 720), at(720, 900)))).toEqual({
      valid: true,
      intervalIssues: [undefined, undefined],
    });
  });

  it('accepts the whole day, 00:00 to 24:00', () => {
    expect(validateWorkingDay(open(at(0, 1440))).valid).toBe(true);
  });

  it('a closed day is always valid: its intervals are not saved', () => {
    expect(validateWorkingDay({ weekday: 2, isOpen: false, intervals: [] }).valid).toBe(true);
    expect(validateWorkingDay({ weekday: 2, isOpen: false, intervals: [at(720, 540), at(600, 700)] })).toEqual({
      valid: true,
      intervalIssues: [undefined, undefined],
    });
  });

  it('an open day needs an interval', () => {
    expect(validateWorkingDay(open())).toEqual({ valid: false, dayIssue: 'INTERVAL_REQUIRED', intervalIssues: [] });
  });

  it('allows four intervals, never five', () => {
    const four = [at(480, 540), at(600, 660), at(720, 780), at(840, 900)];
    expect(validateWorkingDay(open(...four)).valid).toBe(true);
    const five = validateWorkingDay(open(...four, at(960, 1020)));
    expect(five.valid).toBe(false);
    expect(five.dayIssue).toBe('TOO_MANY_INTERVALS');
  });

  it.each([
    ['an end before its start', at(720, 540)],
    ['an end equal to its start', at(540, 540)],
  ])('refuses %s', (_label, interval) => {
    expect(validateWorkingDay(open(interval)).intervalIssues).toEqual(['END_NOT_AFTER_START']);
  });

  it.each([
    ['a negative minute', at(-60, 540)],
    ['a minute after midnight', at(1380, 1441)],
    ['a fractional minute', at(540.5, 720)],
    ['a non-number', at(Number.NaN, 720)],
  ])('refuses %s', (_label, interval) => {
    expect(validateWorkingDay(open(interval)).intervalIssues).toEqual(['INVALID_MINUTE']);
  });

  it('marks the LATER interval of an overlap, whatever the order typed', () => {
    expect(validateWorkingDay(open(at(540, 780), at(720, 1080))).intervalIssues).toEqual([undefined, 'OVERLAP']);
    expect(validateWorkingDay(open(at(720, 1080), at(540, 780))).intervalIssues).toEqual([undefined, 'OVERLAP']);
  });

  it.each([
    ['a contained interval', [at(540, 1080), at(600, 660)]],
    ['identical intervals', [at(540, 720), at(540, 720)]],
    ['the same start', [at(540, 600), at(540, 720)]],
  ])('refuses %s', (_label, intervals) => {
    const validation = validateWorkingDay(open(...intervals));
    expect(validation.valid).toBe(false);
    expect(validation.intervalIssues[1]).toBe('OVERLAP');
  });

  it('an invalid interval never makes another one overlap', () => {
    expect(validateWorkingDay(open(at(1080, 540), at(600, 700))).intervalIssues).toEqual([
      'END_NOT_AFTER_START',
      undefined,
    ]);
  });

  it('detects an overlap with any earlier interval, not only the previous one', () => {
    expect(validateWorkingDay(open(at(540, 720), at(840, 900), at(700, 760))).intervalIssues).toEqual([
      undefined,
      undefined,
      'OVERLAP',
    ]);
  });
});

describe('working hours — the saved form', () => {
  it('sorts the intervals of an open day', () => {
    expect(normalizeWorkingDay(open(at(840, 1140), at(540, 720)))).toEqual(open(at(540, 720), at(840, 1140)));
  });

  it('drops the intervals of a closed day', () => {
    expect(normalizeWorkingDay({ weekday: 5, isOpen: false, intervals: [at(540, 720)] })).toEqual(closedWorkingDay(5));
  });

  it('never mutates the day it is given', () => {
    const day = open(at(840, 1140), at(540, 720));
    normalizeWorkingDay(day);
    expect(day.intervals).toEqual([at(840, 1140), at(540, 720)]);
  });

  it('compares days as they would be saved', () => {
    expect(isSameWorkingDay(open(at(840, 1140), at(540, 720)), open(at(540, 720), at(840, 1140)))).toBe(true);
    expect(
      isSameWorkingDay({ weekday: 1, isOpen: false, intervals: [at(540, 720)] }, closedWorkingDay(1)),
    ).toBe(true);
    expect(isSameWorkingDay(open(at(540, 720)), open(at(540, 725)))).toBe(false);
    expect(isSameWorkingDay(open(at(540, 720)), closedWorkingDay(1))).toBe(false);
    expect(isSameWorkingDay(open(at(540, 720)), { ...open(at(540, 720)), weekday: 2 })).toBe(false);
  });
});

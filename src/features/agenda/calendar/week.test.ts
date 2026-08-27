import {
  addLocalDays,
  followTodayChange,
  getStartOfWeek,
  getWeekDays,
  isSameLocalDay,
  shiftWeek,
} from './week';

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

describe('Agenda week calendar helpers', () => {
  it('uses Monday as the start of the week', () => {
    const monday = getStartOfWeek(localDate(2026, 8, 26));

    expect([monday.getFullYear(), monday.getMonth() + 1, monday.getDate()]).toEqual([2026, 8, 24]);
  });

  it('keeps Sunday in the week that started the previous Monday', () => {
    const sunday = getStartOfWeek(localDate(2026, 8, 30));

    expect(sunday.getDate()).toBe(24);
    expect(getWeekDays(localDate(2026, 8, 30))[6].getDate()).toBe(30);
  });

  it('handles a week crossing a month boundary', () => {
    const days = getWeekDays(localDate(2026, 9, 1));

    expect(days[0].getMonth() + 1).toBe(8);
    expect(days[0].getDate()).toBe(31);
    expect(days[1].getMonth() + 1).toBe(9);
    expect(days[1].getDate()).toBe(1);
  });

  it('handles a week crossing a year boundary', () => {
    const days = getWeekDays(localDate(2027, 1, 1));

    expect(days[0].getFullYear()).toBe(2026);
    expect(days[0].getMonth() + 1).toBe(12);
    expect(days[0].getDate()).toBe(28);
    expect(days[6].getFullYear()).toBe(2027);
    expect(days[6].getDate()).toBe(3);
  });

  it('shifts a selected calendar context by complete weeks', () => {
    const wednesday = localDate(2026, 8, 26);
    const previous = shiftWeek(wednesday, -1);
    const next = shiftWeek(wednesday, 1);

    expect(isSameLocalDay(previous, localDate(2026, 8, 19))).toBe(true);
    expect(isSameLocalDay(next, localDate(2026, 9, 2))).toBe(true);
    expect(addLocalDays(previous, 14).getDate()).toBe(2);
  });

  it('preserves the weekday when shifting weeks', () => {
    const wednesday = localDate(2026, 8, 19);
    const nextWeek = shiftWeek(wednesday, 1);
    const prevWeek = shiftWeek(wednesday, -1);

    expect(nextWeek.getDay()).toBe(wednesday.getDay());
    expect(prevWeek.getDay()).toBe(wednesday.getDay());
    expect(nextWeek.getDate()).toBe(26);
    expect(prevWeek.getDate()).toBe(12);
  });

  it('handles week shift crossing month boundary', () => {
    const monday = localDate(2026, 8, 31);
    const nextWeek = shiftWeek(monday, 1);

    expect(nextWeek.getMonth() + 1).toBe(9);
    expect(nextWeek.getDate()).toBe(7);
  });

  it('handles week shift crossing year boundary', () => {
    const monday = localDate(2026, 12, 28);
    const nextWeek = shiftWeek(monday, 1);

    expect(nextWeek.getFullYear()).toBe(2027);
    expect(nextWeek.getMonth() + 1).toBe(1);
    expect(nextWeek.getDate()).toBe(4);
  });

  it('always includes the selected day in its week', () => {
    const wednesday = localDate(2026, 8, 19);
    const weekDays = getWeekDays(wednesday);
    const containsWednesday = weekDays.some((day) => isSameLocalDay(day, wednesday));

    expect(containsWednesday).toBe(true);
    expect(weekDays.length).toBe(7);
  });
});

describe('followTodayChange', () => {
  it('moves a selection that tracked the previous today onto the new today', () => {
    const previousToday = localDate(2026, 8, 25);
    const nextToday = localDate(2026, 8, 26);

    const result = followTodayChange(previousToday, previousToday, nextToday);

    expect(isSameLocalDay(result, nextToday)).toBe(true);
  });

  it('keeps a deliberate selection of another day when today changes', () => {
    const previousToday = localDate(2026, 8, 25);
    const nextToday = localDate(2026, 8, 26);
    const otherDay = localDate(2026, 8, 28);

    const result = followTodayChange(otherDay, previousToday, nextToday);

    expect(isSameLocalDay(result, otherDay)).toBe(true);
  });
});

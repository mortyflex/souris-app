import { calculateDayIntervalLayout } from '../layout/day-layout';

function at(minutes: number): Date {
  return new Date(2026, 7, 24, 8, minutes);
}

describe('calculateDayIntervalLayout', () => {
  it('reuses a column for non-overlapping intervals in one overlap group', () => {
    const layout = calculateDayIntervalLayout([
      { id: 'a', startAt: at(0), endAt: at(180) },
      { id: 'b', startAt: at(15), endAt: at(30) },
      { id: 'c', startAt: at(45), endAt: at(60) },
    ]);

    expect(layout).toEqual([
      { id: 'a', startAt: at(0), endAt: at(180), column: 0, columnCount: 2 },
      { id: 'b', startAt: at(15), endAt: at(30), column: 1, columnCount: 2 },
      { id: 'c', startAt: at(45), endAt: at(60), column: 1, columnCount: 2 },
    ]);
  });

  it('does not treat touching intervals as overlapping', () => {
    const layout = calculateDayIntervalLayout([
      { id: 'first', startAt: at(0), endAt: at(30) },
      { id: 'second', startAt: at(30), endAt: at(75) },
    ]);

    expect(layout.map(({ id, column, columnCount }) => ({ id, column, columnCount }))).toEqual([
      { id: 'first', column: 0, columnCount: 1 },
      { id: 'second', column: 0, columnCount: 1 },
    ]);
  });

  it('produces the same assignments independent of input order', () => {
    const intervals = [
      { id: 'late', startAt: at(20), endAt: at(70) },
      { id: 'early', startAt: at(0), endAt: at(40) },
      { id: 'middle', startAt: at(10), endAt: at(30) },
    ];
    const forward = calculateDayIntervalLayout(intervals);
    const reverse = calculateDayIntervalLayout([...intervals].reverse());

    expect([...forward].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...reverse].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });
});

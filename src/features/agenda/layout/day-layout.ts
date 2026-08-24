export interface DayInterval {
  readonly id: string;
  readonly startAt: Date;
  readonly endAt: Date;
}

export interface DayIntervalLayout extends DayInterval {
  readonly column: number;
  readonly columnCount: number;
}

/**
 * Allocates the smallest reusable column set for each connected overlap group.
 * End times are exclusive, so appointments touching at a boundary do not overlap.
 */
export function calculateDayIntervalLayout(
  intervals: readonly DayInterval[],
): readonly DayIntervalLayout[] {
  const ordered = [...intervals].sort(
    (a, b) =>
      a.startAt.getTime() - b.startAt.getTime() ||
      a.endAt.getTime() - b.endAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  const result = new Map<string, DayIntervalLayout>();

  let groupStart = 0;
  while (groupStart < ordered.length) {
    let groupEnd = groupStart + 1;
    let connectedEnd = ordered[groupStart].endAt.getTime();

    while (
      groupEnd < ordered.length &&
      ordered[groupEnd].startAt.getTime() < connectedEnd
    ) {
      connectedEnd = Math.max(connectedEnd, ordered[groupEnd].endAt.getTime());
      groupEnd += 1;
    }

    const columnEnds: number[] = [];
    const groupLayouts: DayIntervalLayout[] = [];

    for (const interval of ordered.slice(groupStart, groupEnd)) {
      const start = interval.startAt.getTime();
      let column = columnEnds.findIndex((end) => end <= start);
      if (column === -1) {
        column = columnEnds.length;
      }
      columnEnds[column] = interval.endAt.getTime();
      groupLayouts.push({ ...interval, column, columnCount: 0 });
    }

    for (const layout of groupLayouts) {
      const complete = { ...layout, columnCount: columnEnds.length };
      result.set(layout.id, complete);
    }
    groupStart = groupEnd;
  }

  return intervals.map((interval) => result.get(interval.id) as DayIntervalLayout);
}

export function minutesFromDayStart(date: Date, startHour: number): number {
  return (date.getHours() - startHour) * 60 + date.getMinutes() + date.getSeconds() / 60;
}

// BeautIzzy — today's local calendar date, kept current
//
// The Clientes directory lives in a tab that can stay mounted for days, so
// « today » cannot be read once and kept: it is refreshed at the next local
// midnight and whenever the app returns to the foreground. The returned Date
// only changes when the local DAY changes, so consumers never re-render for a
// mere change of minute.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function millisecondsUntilNextLocalMidnight(now: Date): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return nextMidnight.getTime() - now.getTime();
}

export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => {
      const now = new Date();
      setToday((current) => (isSameLocalDay(current, now) ? current : now));
    };
    // One second past midnight: never fires a hair before the day turns.
    const midnightTimer = setTimeout(refresh, millisecondsUntilNextLocalMidnight(today) + 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(midnightTimer);
      subscription.remove();
    };
  }, [today]);

  return today;
}

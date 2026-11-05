// BeautIzzy — live seconds left before an expiry instant
//
// Re-reads the clock on each tick and whenever the app returns to the
// foreground, so a timer suspended in the background never stretches the
// wait. One pending timeout at a time, aligned on the next whole second;
// everything is released when the instant passes or the screen unmounts.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { cooldownRemainingSeconds } from './password-reset-cooldown';

export function useCooldownSeconds(endsAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      const current = Date.now();
      setNow(current);
      const left = endsAt - current;
      // Wake up exactly when the displayed second changes (or the wait ends).
      if (left > 0) timer = setTimeout(tick, left % 1000 || 1000);
    };
    // Immediately: `now` may predate this cooldown.
    timer = setTimeout(tick, 0);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      subscription.remove();
    };
  }, [endsAt]);

  return cooldownRemainingSeconds(endsAt, now);
}

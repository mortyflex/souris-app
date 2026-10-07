// BeautIzzy — Client Profile birthday celebration
//
// Decides the two things the profile needs:
//
//   isBirthday       today is the Client birthday → the reminder card shows,
//                    whatever the motion preference;
//   confettiVisible  the short burst is playing.
//
// Lifecycle: ONE celebration (one success haptic + one confetti burst) per
// profile ENTRY — that is, per mount of the screen. Leaving the profile and
// opening it again celebrates again, on purpose. Within one mount nothing can
// replay it:
//
//   - the haptic fires from an effect behind a per-mount ref, so a re-render
//     or a second run of the effect never fires it twice;
//   - the burst is derived state that ends for good once it has finished.
//
// Nothing is remembered outside the mounted screen: no session, no storage.
// Reduced motion keeps the card and the haptic and skips the confetti.
// An archived Client is no longer offered new business: no celebration.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { isClientArchived, isClientBirthdayOnDate, type Client } from '@/domain/clients';
import { haptics } from '@/shared/lib/haptics';

import { useToday } from './use-today';

interface BirthdayCelebration {
  readonly isBirthday: boolean;
  readonly confettiVisible: boolean;
  readonly onConfettiFinished: () => void;
}

export function useBirthdayCelebration(client: Client | undefined): BirthdayCelebration {
  const today = useToday();
  const reducedMotion = useReducedMotion();
  const hapticFired = useRef(false);
  const [confettiFinished, setConfettiFinished] = useState(false);
  const isBirthday =
    client !== undefined && !isClientArchived(client) && isClientBirthdayOnDate(client, today);

  useEffect(() => {
    if (!isBirthday || hapticFired.current) return;
    hapticFired.current = true;
    haptics.success();
  }, [isBirthday]);

  const onConfettiFinished = useCallback(() => setConfettiFinished(true), []);

  return {
    isBirthday,
    confettiVisible: isBirthday && !reducedMotion && !confettiFinished,
    onConfettiFinished,
  };
}

"use client";

import { useEffect, useRef } from "react";

import {
  CHECKING,
  createTurnstileLoader,
  renderChallenge,
  type ChallengeHandle,
  type ChallengeState,
} from "@/features/booking/challenge";

const loadTurnstile = createTurnstileLoader();

/**
 * Cloudflare Turnstile, managed mode: nothing is shown unless Cloudflare asks
 * the customer for an interaction. It reports its state — and its token — to
 * the flow. A change of `resetSignal` asks for a NEW token: after every send
 * (a token is single-use), or when the customer retries a failed check (the
 * script is then loaded again if it never arrived).
 *
 * Every rule is in `src/features/booking/challenge.ts`; this only wires it to
 * the page's life cycle.
 */
export function TurnstileWidget({
  siteKey,
  resetSignal,
  onChange,
}: {
  siteKey: string;
  resetSignal: number;
  onChange: (state: ChallengeState) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ChallengeHandle | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  const startRef = useRef<(() => void) | undefined>(undefined);
  const lastSignalRef = useRef(resetSignal);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    let active = true;
    let generation = 0;
    const report = (state: ChallengeState) => {
      if (active) onChangeRef.current(state);
    };
    const start = () => {
      generation += 1;
      const mine = generation;
      report(CHECKING);
      loadTurnstile().then(
        (api) => {
          if (!active || mine !== generation || containerRef.current === null) return;
          handleRef.current?.remove();
          handleRef.current = renderChallenge({ api, container: containerRef.current, siteKey, onChange: report });
        },
        () => {
          if (mine === generation) report({ status: "error" });
        },
      );
    };
    startRef.current = start;
    start();
    return () => {
      active = false;
      startRef.current = undefined;
      handleRef.current?.remove();
      handleRef.current = undefined;
      // A token left behind is never sent: the next widget starts from scratch.
      onChangeRef.current(CHECKING);
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal === lastSignalRef.current) return;
    lastSignalRef.current = resetSignal;
    if (handleRef.current !== undefined) handleRef.current.reset();
    else startRef.current?.();
  }, [resetSignal]);

  return <div ref={containerRef} className="w-full max-w-full" />;
}

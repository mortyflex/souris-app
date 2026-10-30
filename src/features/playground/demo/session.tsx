// BeautIzzy — Playground demo session (development ONLY)
//
// WHICH demo is being explored, and nothing else: the chosen profession and
// a generation counter. It lives in the signed-out `(auth)` layout, above the
// Playground landing and the `(demo)` group, so the choice made on the landing
// is what the demo runtime mounts — and it dies with the signed-out group: a
// professional who signs in leaves nothing of it behind.
//
// The data of a demo (clients, prestations, appointments) never lives here.
// It lives in the runtime (PlaygroundDemoRuntime.tsx), keyed by
// `activityType` + `generation`: starting a demo, resetting it or switching
// profession always yields a NEW generation, hence a new in-memory database
// seeded from the fixtures — nothing of a previous scenario can leak into the
// next one.
//
// A demo is either the profession's established Business, or — with
// `firstUse` — a Business that just finished its onboarding, at one of the
// first-use stages (scenarios/first-use.ts), with the « Premiers pas » guide on.
//
// No scenario is ever persisted: nothing survives a restart, by design.

import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import type { ProfessionId } from '@/domain/business';

import type { FirstUseRequest } from './scenarios';

export interface PlaygroundDemoScenarioRef {
  readonly activityType: ProfessionId;
  /** Strictly increasing within the session: every start or reset is a fresh runtime. */
  readonly generation: number;
  /** A just-onboarded Business at this stage; absent for the established demo. */
  readonly firstUse?: FirstUseRequest;
}

export interface PlaygroundDemoSessionValue {
  /** The demo being explored, or null outside a demo. */
  readonly scenario: PlaygroundDemoScenarioRef | null;
  /** Enters a NEW demo of this profession (a previous one, whatever its profession, is discarded). */
  readonly start: (activityType: ProfessionId, firstUse?: FirstUseRequest) => void;
  /** Restores the original dataset of the current profession: a new generation of the same demo. */
  readonly reset: () => void;
  /** Leaves the demo: no scenario. */
  readonly exit: () => void;
}

const PlaygroundDemoSessionContext = createContext<PlaygroundDemoSessionValue | null>(null);

export function PlaygroundDemoSessionProvider({ children }: PropsWithChildren) {
  const [scenario, setScenario] = useState<PlaygroundDemoScenarioRef | null>(null);
  // A counter, not state: `start` stays stable, so a closure captured earlier
  // (the onboarding preview's finish) still yields a NEW generation.
  const generation = useRef(0);

  const start = useCallback((activityType: ProfessionId, firstUse?: FirstUseRequest) => {
    generation.current += 1;
    setScenario({ activityType, generation: generation.current, ...(firstUse && { firstUse }) });
  }, []);

  const reset = useCallback(() => {
    if (scenario === null) return;
    start(scenario.activityType, scenario.firstUse);
  }, [scenario, start]);

  const exit = useCallback(() => setScenario(null), []);

  const value = useMemo(() => ({ scenario, start, reset, exit }), [scenario, start, reset, exit]);

  return (
    <PlaygroundDemoSessionContext.Provider value={value}>{children}</PlaygroundDemoSessionContext.Provider>
  );
}

export function usePlaygroundDemoSession(): PlaygroundDemoSessionValue {
  const value = useContext(PlaygroundDemoSessionContext);
  if (!value) {
    throw new Error('usePlaygroundDemoSession must be used inside PlaygroundDemoSessionProvider');
  }
  return value;
}

// BeautIzzy — Playground demo scenarios (development ONLY)
//
// ONE definition per demo profession, built on demand relative to `now`.
// The three professions of `PROFESSIONS` are the three demos; the real
// onboarding availability (HAIRDRESSING only) is a different rule and is
// never read here.

import type { ProfessionId } from '@/domain/business';

import { ESTHETICS_DEMO } from './esthetics';
import { HAIRDRESSING_DEMO } from './hairdressing';
import { NAILS_DEMO } from './nails';
import { buildDemoScenario, type DemoScenarioDefinition, type PlaygroundDemoScenario } from './scenario';

const DEFINITIONS: Readonly<Record<ProfessionId, DemoScenarioDefinition>> = {
  HAIRDRESSING: HAIRDRESSING_DEMO,
  NAILS: NAILS_DEMO,
  ESTHETICS: ESTHETICS_DEMO,
};

/** The original dataset of a profession's demo, relative to `now`. Deterministic. */
export function createPlaygroundDemoScenario(activityType: ProfessionId, now: Date): PlaygroundDemoScenario {
  return buildDemoScenario(DEFINITIONS[activityType], now);
}

export { getDemoBusinessId, DEMO_OWNER_USER_ID, type PlaygroundDemoScenario } from './scenario';

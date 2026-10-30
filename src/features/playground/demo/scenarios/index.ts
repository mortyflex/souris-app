// BeautIzzy — Playground demo scenarios (development ONLY)
//
// ONE definition per demo profession, built on demand relative to `now`.
// Every profession of `PROFESSIONS` has its demo; the real onboarding
// availability is a different rule and is never read here.

import type { ProfessionId } from '@/domain/business';

import { ESTHETICS_DEMO } from './esthetics';
import { HAIRDRESSING_DEMO } from './hairdressing';
import { NAILS_DEMO } from './nails';
import { WELLNESS_DEMO } from './wellness';
import { buildFirstUseScenario, type FirstUseRequest } from './first-use';
import { buildDemoScenario, type DemoScenarioDefinition, type PlaygroundDemoScenario } from './scenario';

const DEFINITIONS: Readonly<Record<ProfessionId, DemoScenarioDefinition>> = {
  HAIRDRESSING: HAIRDRESSING_DEMO,
  NAILS: NAILS_DEMO,
  ESTHETICS: ESTHETICS_DEMO,
  WELLNESS: WELLNESS_DEMO,
};

/**
 * The original dataset of a profession's demo, relative to `now` — the
 * established Business, or a just-onboarded one at a first-use stage.
 * Deterministic.
 */
export function createPlaygroundDemoScenario(
  activityType: ProfessionId,
  now: Date,
  firstUse?: FirstUseRequest,
): PlaygroundDemoScenario {
  const definition = DEFINITIONS[activityType];
  return firstUse ? buildFirstUseScenario(definition, firstUse, now) : buildDemoScenario(definition, now);
}

export {
  FIRST_USE_STAGES,
  type FirstUseOrigin,
  type FirstUseRequest,
  type FirstUseStage,
} from './first-use';

export { getDemoBusinessId, DEMO_OWNER_USER_ID, type PlaygroundDemoScenario } from './scenario';

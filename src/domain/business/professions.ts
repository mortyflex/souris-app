// BeautIzzy — Professions (domain)
//
// A profession is a primary activity BeautIzzy is built for, with its
// product availability. The identifier IS the stored `BusinessActivityType`:
// no second vocabulary exists, nothing new is persisted, and every value a
// Business already stores keeps reading exactly as before.
//
// Availability is a rule about NEW Businesses only: it decides what
// onboarding lets the professional choose. It is never applied to an
// existing Business — one created with any stored value resolves, binds
// and opens as always, whatever this table says about that value.
//
// Terminology, service categories and online-booking eligibility per
// profession belong to the catalogue presentation
// (`src/features/services/catalogue-presentation.ts`), never to this table.

import type { BusinessActivityType } from './types';

/**
 * `AVAILABLE`   — a new Business may be created with it: the validated
 *                 hairdressing workflow, and the professions opened to the
 *                 pilot professionals by product decision (October 2026).
 * `COMING_SOON` — announced in onboarding (« Bientôt disponible »), never
 *                 selectable until its workflows are ready. No profession is
 *                 announced today; the state stays for the next ones.
 */
export type ProfessionAvailability = 'AVAILABLE' | 'COMING_SOON';

export interface ProfessionDefinition {
  readonly id: BusinessActivityType;
  readonly availability: ProfessionAvailability;
}

/**
 * The professions BeautIzzy is prepared for, in product order. Hairdressing
 * is the validated Production workflow; nail services, esthetics and wellness
 * are opened for the pilot professionals (docs/product/LAUNCH_ROADMAP.md).
 * The other stored identifiers (`BARBER`, `LASHES_BROWS`, `MAKEUP`, `OTHER`)
 * remain valid stored values and keep their labels; they are simply not
 * offered to a new Business.
 */
export const PROFESSIONS = [
  { id: 'HAIRDRESSING', availability: 'AVAILABLE' },
  { id: 'NAILS', availability: 'AVAILABLE' },
  { id: 'ESTHETICS', availability: 'AVAILABLE' },
  { id: 'WELLNESS', availability: 'AVAILABLE' },
] as const satisfies readonly ProfessionDefinition[];

export type ProfessionId = (typeof PROFESSIONS)[number]['id'];

export function isProfessionId(activityType: BusinessActivityType): activityType is ProfessionId {
  return PROFESSIONS.some((profession) => profession.id === activityType);
}

/** The availability of a stored activity, or `undefined` for an identifier no longer offered. */
export function getProfessionAvailability(activityType: BusinessActivityType): ProfessionAvailability | undefined {
  return PROFESSIONS.find((profession) => profession.id === activityType)?.availability;
}

/** Whether a NEW Business may be created with this activity. Existing Businesses are never re-checked. */
export function isProfessionAvailable(activityType: BusinessActivityType): boolean {
  return getProfessionAvailability(activityType) === 'AVAILABLE';
}

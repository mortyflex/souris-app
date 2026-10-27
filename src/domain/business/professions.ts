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
// profession belong to the catalogue work (Step 2) and are deliberately not
// modelled here yet.

import type { BusinessActivityType } from './types';

/**
 * `AVAILABLE`   — the workflows were validated with a real professional; a new
 *                 Business may be created with it.
 * `COMING_SOON` — announced in onboarding (« Bientôt disponible »), never
 *                 selectable until its workflows are validated.
 */
export type ProfessionAvailability = 'AVAILABLE' | 'COMING_SOON';

export interface ProfessionDefinition {
  readonly id: BusinessActivityType;
  readonly availability: ProfessionAvailability;
}

/**
 * The professions BeautIzzy is prepared for, in product order. Hairdressing
 * is the validated Production workflow; nail services and esthetics are
 * announced. The other stored identifiers (`BARBER`, `LASHES_BROWS`,
 * `MAKEUP`, `WELLNESS`, `OTHER`) remain valid stored values and keep their
 * labels; they are simply not offered to a new Business.
 */
export const PROFESSIONS = [
  { id: 'HAIRDRESSING', availability: 'AVAILABLE' },
  { id: 'NAILS', availability: 'COMING_SOON' },
  { id: 'ESTHETICS', availability: 'COMING_SOON' },
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

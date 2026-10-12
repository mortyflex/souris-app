// BeautIzzy — starter prestations proposed during onboarding (pure)
//
// For a NEW Business only, right after its creation, onboarding proposes a
// short base of prestations matching the primary activity. The professional
// keeps, removes or skips them; only the kept ones are written, through the
// normal Service store, with FRESH identities (a UUID per Service, like a
// Service created by hand), so they sync like any other catalog record.
//
// This file is the designed onboarding base: it is NOT the development hair
// pilot catalogue, and nothing here is ever seeded automatically — the
// onboarding step is the only path, and an existing Business never passes
// through it.
//
// Prices: the domain requires a price (≥ 0), and BeautIzzy does not know the
// professional's tariffs. Every starter is created at 0 € — the neutral,
// editable default the catalog allows — and the step says so; the price is
// set in Prestations & tarifs. No market price is ever invented.
//
// Types follow the catalog rules (docs/domain/SERVICES.md §3): a SERVICE is
// one staff-required phase; a TECHNIQUE is used only where the client
// genuinely waits with something in place (« Temps de pose »), and then
// carries Application → Temps de pose → Finition.

import type { BusinessActivityType } from '@/domain/business';
import type { Service, ServiceType } from '@/domain/appointments';
import { PROCESSING_PHASE_NAME } from '@/features/services/editor/service-form';

export interface StarterPhase {
  readonly name: string;
  readonly durationMinutes: number;
  readonly requiresStaff: boolean;
}

export interface StarterService {
  /** Stable key inside the preset, for selection state only — never persisted. */
  readonly key: string;
  readonly name: string;
  readonly type: ServiceType;
  readonly phases: readonly StarterPhase[];
}

/** The catalog's neutral default: a price the professional sets afterwards. */
export const STARTER_SERVICE_PRICE = 0;

function service(key: string, name: string, durationMinutes: number): StarterService {
  return { key, name, type: 'SERVICE', phases: [{ name, durationMinutes, requiresStaff: true }] };
}

function technique(
  key: string,
  name: string,
  timing: { readonly application: number; readonly processing: number; readonly finishing: number },
): StarterService {
  return {
    key,
    name,
    type: 'TECHNIQUE',
    phases: [
      { name: 'Application', durationMinutes: timing.application, requiresStaff: true },
      { name: PROCESSING_PHASE_NAME, durationMinutes: timing.processing, requiresStaff: false },
      { name: 'Finition', durationMinutes: timing.finishing, requiresStaff: true },
    ],
  };
}

const presets: Record<BusinessActivityType, readonly StarterService[]> = {
  HAIRDRESSING: [
    service('cut-women', 'Coupe femme', 45),
    service('blow-dry', 'Brushing', 30),
    service('cut-blow-dry', 'Coupe + brushing', 60),
    technique('color', 'Coloration', { application: 30, processing: 35, finishing: 30 }),
    technique('balayage', 'Balayage', { application: 45, processing: 40, finishing: 30 }),
    technique('gloss', 'Patine', { application: 15, processing: 20, finishing: 15 }),
    service('cut-men', 'Coupe homme', 30),
    technique('care', 'Soin', { application: 10, processing: 15, finishing: 15 }),
  ],
  NAILS: [
    service('semi-permanent', 'Semi-permanent', 60),
    service('full-set', 'Pose complète', 90),
    service('infill', 'Remplissage', 75),
    service('removal', 'Dépose', 30),
    service('nail-art', 'Nail art', 30),
  ],
  ESTHETICS: [
    service('facial', 'Soin visage', 60),
    service('brow-wax', 'Épilation sourcils', 15),
    service('leg-wax', 'Épilation jambes', 30),
    service('body-treatment', 'Soin corps', 60),
  ],
  LASHES_BROWS: [
    technique('lash-lift', 'Rehaussement de cils', { application: 20, processing: 20, finishing: 15 }),
    technique('tint', 'Teinture', { application: 10, processing: 10, finishing: 10 }),
    technique('brow-lift', 'Brow lift', { application: 20, processing: 15, finishing: 10 }),
    service('brow-shaping', 'Restructuration sourcils', 30),
  ],
  MAKEUP: [
    service('day', 'Maquillage jour', 45),
    service('evening', 'Maquillage soirée', 60),
    service('bridal', 'Maquillage mariée', 90),
  ],
  BARBER: [
    service('cut', 'Coupe', 30),
    service('beard', 'Taille de barbe', 20),
    service('cut-beard', 'Coupe + barbe', 45),
  ],
  WELLNESS: [
    service('massage-30', 'Massage 30 min', 30),
    service('massage-60', 'Massage 60 min', 60),
    service('relaxing', 'Soin relaxant', 60),
  ],
  // « Autre »: no generic prestations are invented; the professional adds their own.
  OTHER: [],
};

export function getStarterServices(activityType: BusinessActivityType): readonly StarterService[] {
  return presets[activityType];
}

/** Total minutes of a starter, every phase included — what the row shows. */
export function getStarterDurationMinutes(starter: StarterService): number {
  return starter.phases.reduce((total, phase) => total + phase.durationMinutes, 0);
}

export interface StarterIdentity {
  readonly createServiceId: () => string;
  readonly createPhaseId: (serviceId: string) => string;
}

/**
 * The catalog Services to write for the kept starters: fresh identities,
 * the neutral price, active. Pure — the identities are supplied so the
 * mapping stays deterministic under test.
 */
export function buildStarterCatalog(
  businessId: string,
  starters: readonly StarterService[],
  identity: StarterIdentity,
): readonly Service[] {
  return starters.map((starter) => {
    const id = identity.createServiceId();
    return {
      id,
      businessId,
      name: starter.name,
      type: starter.type,
      price: STARTER_SERVICE_PRICE,
      phases: starter.phases.map((phase) => ({
        id: identity.createPhaseId(id),
        name: phase.name,
        durationMinutes: phase.durationMinutes,
        requiresStaff: phase.requiresStaff,
      })),
      active: true,
    };
  });
}

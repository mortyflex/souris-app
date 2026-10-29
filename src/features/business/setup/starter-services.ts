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
// genuinely waits with something in place (a colour, a mask, a tint),
// whatever the profession, and then carries Application → waiting phase →
// Finition. The waiting phase gets the name the profession's editor gives a
// new one (`getWaitingPhaseName`): « Temps de pose », « Temps d’attente » in
// the unified catalogue (nails, esthetics). Several steps alone never make a
// Technique: a gel set or a wax is one SERVICE duration.

import type { BusinessActivityType } from '@/domain/business';
import type { Service, ServiceType } from '@/domain/appointments';
import {
  getCataloguePresentation,
  getWaitingPhaseName,
} from '@/features/services/catalogue-presentation';

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

/** The worked phases around the waiting one; « Application » / « Finition » unless named. */
interface TechniquePhaseNames {
  readonly application: string;
  readonly finishing: string;
}

const DEFAULT_PHASE_NAMES: TechniquePhaseNames = { application: 'Application', finishing: 'Finition' };

function technique(
  activityType: BusinessActivityType,
  key: string,
  name: string,
  timing: { readonly application: number; readonly processing: number; readonly finishing: number },
  phaseNames: TechniquePhaseNames = DEFAULT_PHASE_NAMES,
): StarterService {
  const waitingPhaseName = getWaitingPhaseName(getCataloguePresentation(activityType).organization);
  return {
    key,
    name,
    type: 'TECHNIQUE',
    phases: [
      { name: phaseNames.application, durationMinutes: timing.application, requiresStaff: true },
      { name: waitingPhaseName, durationMinutes: timing.processing, requiresStaff: false },
      { name: phaseNames.finishing, durationMinutes: timing.finishing, requiresStaff: true },
    ],
  };
}

const presets: Record<BusinessActivityType, readonly StarterService[]> = {
  HAIRDRESSING: [
    service('cut-women', 'Coupe femme', 45),
    service('blow-dry', 'Brushing', 30),
    service('cut-blow-dry', 'Coupe + brushing', 60),
    technique('HAIRDRESSING', 'color', 'Coloration', { application: 30, processing: 35, finishing: 30 }),
    technique('HAIRDRESSING', 'balayage', 'Balayage', { application: 45, processing: 40, finishing: 30 }),
    technique('HAIRDRESSING', 'gloss', 'Patine', { application: 15, processing: 20, finishing: 15 }),
    service('cut-men', 'Coupe homme', 30),
    technique('HAIRDRESSING', 'care', 'Soin', { application: 10, processing: 15, finishing: 15 }),
  ],
  // Nail work keeps the technician with the client from start to finish (a
  // lamp cure lasts seconds): every starter is a SERVICE with one duration —
  // except the soak-off removal, the one method where the client genuinely
  // waits on her own (the wraps soak; the technician may see someone else).
  NAILS: [
    service('gel-full-set', 'Pose complète gel', 90),
    service('gel-infill', 'Remplissage gel', 75),
    service('semi-permanent-hands', 'Semi-permanent mains', 45),
    service('semi-permanent-feet', 'Semi-permanent pieds', 45),
    service('removal', 'Dépose', 30),
    technique(
      'NAILS',
      'soak-off',
      'Dépose par dissolution',
      { application: 10, processing: 10, finishing: 15 },
      { application: 'Préparation et pose des papillotes', finishing: 'Retrait et finition' },
    ),
    service('nail-art', 'Nail art', 15),
    service('nail-repair', 'Réparation d’un ongle', 15),
  ],
  // A facial is the one esthetics starter where the client genuinely waits
  // with something in place (the mask, while the esthetician may see someone
  // else): cleansing and mask → Temps d’attente → removal and finishing.
  ESTHETICS: [
    technique(
      'ESTHETICS',
      'facial',
      'Soin du visage avec masque',
      { application: 20, processing: 15, finishing: 25 },
      { application: 'Nettoyage et pose du masque', finishing: 'Retrait du masque et finition' },
    ),
    service('brow-wax', 'Épilation sourcils', 15),
    service('leg-wax', 'Épilation jambes', 30),
    service('body-treatment', 'Soin du corps', 60),
    service('eye-beauty', 'Beauté du regard', 30),
  ],
  LASHES_BROWS: [
    technique('LASHES_BROWS', 'lash-lift', 'Rehaussement de cils', { application: 20, processing: 20, finishing: 15 }),
    technique('LASHES_BROWS', 'tint', 'Teinture', { application: 10, processing: 10, finishing: 10 }),
    technique('LASHES_BROWS', 'brow-lift', 'Brow lift', { application: 20, processing: 15, finishing: 10 }),
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

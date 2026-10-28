// BeautIzzy — how the catalogue is presented, per profession (presentation only)
//
// Generic in the data model, specific in the user experience. ONE `Service`
// model (SERVICE / TECHNIQUE, phases, categories, description), ONE editor and
// ONE catalogue screen serve every profession; this table only decides how
// they are organised and worded. Nothing here is stored, synced or read by a
// business rule, and no persisted identifier changes.
//
//   SERVICE_TYPES  the established hairdressing experience, unchanged: the
//                  Services / Techniques segment, the type chooser at creation.
//                  Categories, when the professional creates some, only
//                  subdivide a segment.
//   CATEGORIES     one « Prestations » catalogue grouped by the
//                  professional's own categories (NAILS, ESTHETICS). Creation
//                  opens the form directly as a single-duration prestation;
//                  the phased model (internally a TECHNIQUE) stays available
//                  as an advanced option described by what it does — several
//                  work phases with waiting time — never as « Technique ».
//
// Every stored activity resolves: the five identifiers onboarding no longer
// offers keep the established experience, so no existing Business changes.

import type { ServiceType } from '@/domain/appointments';
import type { BusinessActivityType } from '@/domain/business';

import { PROCESSING_PHASE_NAME } from './editor/service-form';

export type CatalogueOrganization = 'SERVICE_TYPES' | 'CATEGORIES';

export interface CataloguePresentation {
  readonly organization: CatalogueOrganization;
  /** The words for the internal type, where it has to be named at all. */
  readonly typeLabels: Readonly<Record<ServiceType, string>>;
  /** Example of the empty « Nom » of a new category — a hint, never a default. */
  readonly categoryNameExample: string;
  /** Example of the empty « Description » of a prestation — a hint, never a default. */
  readonly descriptionExample: string;
}

const HAIRDRESSING_TYPE_LABELS = { SERVICE: 'Service', TECHNIQUE: 'Technique' } as const;
const UNIFIED_TYPE_LABELS = { SERVICE: 'Durée unique', TECHNIQUE: 'En plusieurs phases' } as const;

const presentations: Readonly<Record<BusinessActivityType, CataloguePresentation>> = {
  HAIRDRESSING: {
    organization: 'SERVICE_TYPES',
    typeLabels: HAIRDRESSING_TYPE_LABELS,
    categoryNameExample: 'Ex. Couleurs',
    descriptionExample: 'Ex. Shampoing et coiffage inclus.',
  },
  NAILS: {
    organization: 'CATEGORIES',
    typeLabels: UNIFIED_TYPE_LABELS,
    categoryNameExample: 'Ex. Extensions et poses en gel',
    descriptionExample: 'Ex. Dépose d’un gel posé ailleurs : prévoir 15 min de plus.',
  },
  ESTHETICS: {
    organization: 'CATEGORIES',
    typeLabels: UNIFIED_TYPE_LABELS,
    categoryNameExample: 'Ex. Soins du visage',
    descriptionExample: 'Ex. Nettoyage, gommage et masque. Venir sans maquillage.',
  },
  BARBER: {
    organization: 'SERVICE_TYPES',
    typeLabels: HAIRDRESSING_TYPE_LABELS,
    categoryNameExample: 'Ex. Barbe',
    descriptionExample: 'Ex. Serviette chaude incluse.',
  },
  LASHES_BROWS: {
    organization: 'SERVICE_TYPES',
    typeLabels: HAIRDRESSING_TYPE_LABELS,
    categoryNameExample: 'Ex. Cils',
    descriptionExample: 'Ex. Venir sans maquillage des yeux.',
  },
  MAKEUP: {
    organization: 'SERVICE_TYPES',
    typeLabels: HAIRDRESSING_TYPE_LABELS,
    categoryNameExample: 'Ex. Événements',
    descriptionExample: 'Ex. Essai conseillé avant le jour J.',
  },
  WELLNESS: {
    organization: 'SERVICE_TYPES',
    typeLabels: HAIRDRESSING_TYPE_LABELS,
    categoryNameExample: 'Ex. Massages',
    descriptionExample: 'Ex. Huiles neutres, sans parfum.',
  },
  OTHER: {
    organization: 'SERVICE_TYPES',
    typeLabels: HAIRDRESSING_TYPE_LABELS,
    categoryNameExample: 'Ex. Soins',
    descriptionExample: 'Ex. Ce qui est inclus, comment se préparer.',
  },
};

export function getCataloguePresentation(activityType: BusinessActivityType): CataloguePresentation {
  return presentations[activityType];
}

/** The wording of the advanced scheduling option of the unified catalogue (the internal TECHNIQUE). */
export const PHASED_SCHEDULING_LABEL = 'Plusieurs phases avec temps d’attente';
export const PHASED_SCHEDULING_DESCRIPTION =
  'À activer seulement si le client attend sans vous — séchage, pose d’un produit — et que vous pouvez vous occuper de quelqu’un d’autre pendant ce temps.';

/**
 * How a prestation's timing is worded (presentation only): the appointment
 * picker cards, the selected-prestation rows, the Résumé time breakdown, the
 * spoken phase steppers, the catalogue rows and the prestation editor. Stored
 * phase names go through `getPhaseDisplayName`.
 *
 *   SERVICE_TYPES  unchanged: « Temps de pose », the Service / Technique
 *                  colours and the spoken type.
 *   CATEGORIES     « Temps d’attente » — neutral: the client waits, without
 *                  implying that the professional is free (« pose » also
 *                  names the work itself in nails, « Pose complète gel ») —
 *                  and the internal type is neither coloured nor spoken.
 */
export interface AppointmentWording {
  /** Whether SERVICE / TECHNIQUE is told apart (colours, spoken type). */
  readonly distinguishesTypes: boolean;
  /** The app's own name for the unattended time of a prestation. */
  readonly waitingTimeLabel: string;
  /** « dont 30 min de pose », « 45 min + 30 min d’attente ». */
  readonly waitingTimeSuffix: string;
  /** The spoken subject of an unattended phase stepper. */
  readonly waitingTimeSubject: string;
}

const appointmentWordings: Readonly<Record<CatalogueOrganization, AppointmentWording>> = {
  SERVICE_TYPES: {
    distinguishesTypes: true,
    waitingTimeLabel: PROCESSING_PHASE_NAME,
    waitingTimeSuffix: 'de pose',
    waitingTimeSubject: 'le temps de pose',
  },
  CATEGORIES: {
    distinguishesTypes: false,
    waitingTimeLabel: 'Temps d’attente',
    waitingTimeSuffix: 'd’attente',
    waitingTimeSubject: 'le temps d’attente',
  },
};

export function getAppointmentWording(organization: CatalogueOrganization): AppointmentWording {
  return appointmentWordings[organization];
}

/**
 * The name the app gives a NEW unattended phase of this organisation — stored
 * like any phase name, so it travels into Appointment snapshots unchanged:
 * « Temps de pose » (SERVICE_TYPES, as before), « Temps d’attente »
 * (CATEGORIES). Existing records are never renamed.
 */
export function getWaitingPhaseName(organization: CatalogueOrganization): string {
  return appointmentWordings[organization].waitingTimeLabel;
}

/**
 * How a stored phase name is shown (presentation only, nothing is rewritten).
 *
 * The editor never lets the professional name an unattended phase: it has
 * always stored the canonical « Temps de pose » there. So an UNATTENDED phase
 * named exactly « Temps de pose » is the app's own default label — in the
 * unified catalogue (records created before Step 5, the legacy adapter,
 * snapshots taken from them) it reads « Temps d’attente ». Every other name —
 * an active phase, a different unattended name — is the professional's and is
 * shown exactly as stored. SERVICE_TYPES shows every name as stored.
 */
export function getPhaseDisplayName(
  phase: { readonly name: string; readonly requiresStaff: boolean },
  organization: CatalogueOrganization,
): string {
  return !phase.requiresStaff && phase.name === PROCESSING_PHASE_NAME
    ? getWaitingPhaseName(organization)
    : phase.name;
}

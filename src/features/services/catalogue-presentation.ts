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
 * How the appointment flows word a prestation (presentation only): the
 * picker cards, the selected-prestation rows, the Résumé time breakdown and
 * the spoken phase steppers. Stored phase names are always shown as stored.
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
    waitingTimeLabel: 'Temps de pose',
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

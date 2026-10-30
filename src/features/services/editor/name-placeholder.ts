// BeautIzzy — the example shown in the empty « Nom » field of the Prestation form
//
// Generic in the data model, specific in the user experience: the catalogue
// stores a free name for every profession, and the only thing the Business
// activity changes is the example the empty field suggests, so a nail
// technician is never invited to type « Coupe ». The example is a hint, never
// a default value, a validation rule or a stored value. The table covers
// EVERY stored activity: an existing Business created with an identifier
// onboarding no longer offers keeps a sensible example.

import type { BusinessActivityType } from '@/domain/business';

const serviceNameExamples: Record<BusinessActivityType, string> = {
  HAIRDRESSING: 'Coupe',
  BARBER: 'Coupe',
  NAILS: 'Pose complète gel',
  ESTHETICS: 'Soin du visage',
  LASHES_BROWS: 'Rehaussement de cils',
  MAKEUP: 'Maquillage jour',
  WELLNESS: 'Massage relaxant',
  OTHER: 'Soin',
};

export function getServiceNamePlaceholder(activityType: BusinessActivityType): string {
  return `Ex. ${serviceNameExamples[activityType]}`;
}

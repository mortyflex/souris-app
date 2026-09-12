// Souris — Business presentation helpers (French labels, never persisted)

import type { BusinessActivityType, BusinessProfile } from '@/domain/business';

const activityLabels: Record<BusinessActivityType, string> = {
  HAIRDRESSING: 'Coiffure',
  BARBER: 'Barbier',
  NAILS: 'Onglerie',
  ESTHETICS: 'Esthétique',
  LASHES_BROWS: 'Cils & sourcils',
  OTHER: 'Autre',
};

export function formatBusinessActivityType(activityType: BusinessActivityType): string {
  return activityLabels[activityType];
}

/** "Léa Martin" or "Léa" — the owner as displayed in account surfaces. */
export function formatBusinessOwnerName(business: BusinessProfile): string {
  return [business.ownerFirstName, business.ownerLastName]
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join(' ');
}

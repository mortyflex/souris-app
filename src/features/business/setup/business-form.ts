// BeautIzzy — Business setup form rules (pure)

import {
  isProfessionAvailable,
  isProfessionId,
  type BusinessActivityType,
  type BusinessSetupInput,
} from '@/domain/business';

/**
 * Which activities a setup form may be completed with.
 *
 *   `available-professions`  the product rule, and the default everywhere: a
 *                            NEW Business is created with an AVAILABLE
 *                            profession only (`isProfessionAvailable`).
 *   `every-profession`       the development Playground preview ONLY: every
 *                            profession of `PROFESSIONS`, the announced ones
 *                            included, may be walked through — its actions
 *                            never create a Business, so nothing is ever
 *                            stored with an unavailable activity.
 */
export type ActivityAcceptance = 'available-professions' | 'every-profession';

export function isActivityAccepted(
  activityType: BusinessActivityType,
  acceptance: ActivityAcceptance = 'available-professions',
): boolean {
  return acceptance === 'every-profession' ? isProfessionId(activityType) : isProfessionAvailable(activityType);
}

export interface BusinessFormValues {
  readonly ownerFirstName: string;
  readonly ownerLastName: string;
  readonly name: string;
  readonly activityType: BusinessActivityType | null;
  readonly phone: string;
}

export const EMPTY_BUSINESS_FORM: BusinessFormValues = {
  ownerFirstName: '',
  ownerLastName: '',
  name: '',
  activityType: null,
  phone: '',
};

export interface BusinessFormErrors {
  readonly ownerFirstName?: string;
  readonly name?: string;
  readonly activityType?: string;
}

/** A « Bientôt disponible » profession is announced, never accepted — whatever path proposed it. */
export const ACTIVITY_UNAVAILABLE_ERROR = 'Cette activité n’est pas encore disponible.';

export function validateBusinessForm(
  values: BusinessFormValues,
  acceptance: ActivityAcceptance = 'available-professions',
): BusinessFormErrors {
  const errors: { ownerFirstName?: string; name?: string; activityType?: string } = {};
  if (values.ownerFirstName.trim().length === 0) errors.ownerFirstName = 'Votre prénom est requis.';
  if (values.name.trim().length === 0) errors.name = 'Le nom de votre activité est requis.';
  if (values.activityType === null) errors.activityType = 'Choisissez votre activité.';
  else if (!isActivityAccepted(values.activityType, acceptance)) errors.activityType = ACTIVITY_UNAVAILABLE_ERROR;
  return errors;
}

export function isValidBusinessForm(
  values: BusinessFormValues,
  acceptance: ActivityAcceptance = 'available-professions',
): boolean {
  return Object.keys(validateBusinessForm(values, acceptance)).length === 0;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Trims every value; optional fields become absent, never empty strings. Requires a valid form. */
export function buildBusinessSetupInput(
  values: BusinessFormValues,
  acceptance: ActivityAcceptance = 'available-professions',
): BusinessSetupInput {
  if (values.activityType === null) {
    throw new Error('buildBusinessSetupInput: activityType is required');
  }
  if (!isActivityAccepted(values.activityType, acceptance)) {
    throw new Error(`buildBusinessSetupInput: ${values.activityType} is not available to a new Business`);
  }
  const ownerLastName = optionalText(values.ownerLastName);
  const phone = optionalText(values.phone);
  return {
    ownerFirstName: values.ownerFirstName.trim(),
    ...(ownerLastName !== undefined && { ownerLastName }),
    name: values.name.trim(),
    activityType: values.activityType,
    ...(phone !== undefined && { phone }),
  };
}

// BeautIzzy — Business setup form rules (pure)

import { isProfessionAvailable, type BusinessActivityType, type BusinessSetupInput } from '@/domain/business';

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

export function validateBusinessForm(values: BusinessFormValues): BusinessFormErrors {
  const errors: { ownerFirstName?: string; name?: string; activityType?: string } = {};
  if (values.ownerFirstName.trim().length === 0) errors.ownerFirstName = 'Votre prénom est requis.';
  if (values.name.trim().length === 0) errors.name = 'Le nom de votre activité est requis.';
  if (values.activityType === null) errors.activityType = 'Choisissez votre activité.';
  else if (!isProfessionAvailable(values.activityType)) errors.activityType = ACTIVITY_UNAVAILABLE_ERROR;
  return errors;
}

export function isValidBusinessForm(values: BusinessFormValues): boolean {
  return Object.keys(validateBusinessForm(values)).length === 0;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Trims every value; optional fields become absent, never empty strings. Requires a valid form. */
export function buildBusinessSetupInput(values: BusinessFormValues): BusinessSetupInput {
  if (values.activityType === null) {
    throw new Error('buildBusinessSetupInput: activityType is required');
  }
  if (!isProfessionAvailable(values.activityType)) {
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

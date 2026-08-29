// Souris — Client form rules (create + edit)
//
// Extremely fast entry: Prénom required, everything else optional.
// Inputs are trimmed; empty optional fields become undefined on the
// canonical Client. Email validation stays basic UX-level: non-empty
// emails must look like "something@something.something". Birth date is a
// full civil YYYY-MM-DD date or nothing — no partial-date model.

import { isValidCivilDate, type Client } from '@/domain/clients';

export interface ClientFormValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly email: string;
  readonly birthDate: string;
}

export const EMPTY_CLIENT_FORM: ClientFormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  birthDate: '',
};

/** Hydrates the shared form with an existing Client (edit mode). */
export function toClientFormValues(client: Client): ClientFormValues {
  return {
    firstName: client.firstName,
    lastName: client.lastName ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    birthDate: client.birthDate ?? '',
  };
}

export function isAcceptableEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function isAcceptableBirthDate(birthDate: string): boolean {
  const trimmed = birthDate.trim();
  if (trimmed.length === 0) return true;
  return isValidCivilDate(trimmed);
}

export function isValidClientForm(values: ClientFormValues): boolean {
  return (
    values.firstName.trim().length > 0 &&
    isAcceptableEmail(values.email) &&
    isAcceptableBirthDate(values.birthDate)
  );
}

/**
 * Builds the canonical Client from form values.
 * Optional empty strings become undefined.
 */
export function buildClientFromForm(
  id: string,
  values: ClientFormValues,
): Client {
  return {
    id,
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim() || undefined,
    phone: values.phone.trim() || undefined,
    email: values.email.trim() || undefined,
    ...(values.birthDate.trim() ? { birthDate: values.birthDate.trim() } : {}),
  };
}

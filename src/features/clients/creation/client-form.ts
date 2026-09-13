// Souris — Client form rules (create + edit)
//
// Extremely fast entry: Prénom required, everything else optional.
// Inputs are trimmed; empty optional fields become undefined on the
// canonical Client. Email validation stays basic UX-level: non-empty
// emails must look like "something@something.something". The birthday is a
// day + month pair chosen with the selector, or nothing — never a year.

import { isValidClientBirthday, type Client, type ClientBirthday } from '@/domain/clients';

export interface ClientFormValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly email: string;
  readonly birthday: ClientBirthday | undefined;
}

export const EMPTY_CLIENT_FORM: ClientFormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  birthday: undefined,
};

/** Hydrates the shared form with an existing Client (edit mode). */
export function toClientFormValues(client: Client): ClientFormValues {
  return {
    firstName: client.firstName,
    lastName: client.lastName ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    birthday: client.birthday,
  };
}

export function isAcceptableEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function isAcceptableBirthday(birthday: ClientBirthday | undefined): boolean {
  return birthday === undefined || isValidClientBirthday(birthday);
}

export function isValidClientForm(values: ClientFormValues): boolean {
  return (
    values.firstName.trim().length > 0 &&
    isAcceptableEmail(values.email) &&
    isAcceptableBirthday(values.birthday)
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
    ...(values.birthday !== undefined ? { birthday: values.birthday } : {}),
  };
}

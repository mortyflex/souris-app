// Souris — Client form rules (create + edit)
//
// Extremely fast entry: Prénom required, everything else optional.
// Inputs are trimmed; empty optional fields become undefined on the
// canonical Client. Email validation stays basic UX-level: non-empty
// emails must look like "something@something.something". The birthday is a
// day + month pair chosen with the selector, or nothing — never a year.
// Notes are free multiline text: trimmed at the edges, line breaks kept, a
// blank note becomes undefined (normalizeClientNotes).
// The promotional SMS consent is optional and defaults to « Non renseigné »
// (UNKNOWN): the professional records the client's expressed choice, and an
// unchanged choice keeps its original audit record
// (resolveClientSmsMarketingConsent).

import {
  isValidClientBirthday,
  normalizeClientNotes,
  resolveClientSmsMarketingConsent,
  type Client,
  type ClientBirthday,
  type ClientSmsMarketingConsentStatus,
} from '@/domain/clients';

export interface ClientFormValues {
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly email: string;
  readonly birthday: ClientBirthday | undefined;
  readonly notes: string;
  /** Undefined = « Non renseigné » (UNKNOWN), the default. */
  readonly smsMarketingConsent: ClientSmsMarketingConsentStatus | undefined;
}

export const EMPTY_CLIENT_FORM: ClientFormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  birthday: undefined,
  notes: '',
  smsMarketingConsent: undefined,
};

/** Hydrates the shared form with an existing Client (edit mode). */
export function toClientFormValues(client: Client): ClientFormValues {
  return {
    firstName: client.firstName,
    lastName: client.lastName ?? '',
    phone: client.phone ?? '',
    email: client.email ?? '',
    birthday: client.birthday,
    notes: client.notes ?? '',
    smsMarketingConsent: client.smsMarketingConsent?.status,
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
 * Optional empty strings become undefined. `previous` is the edited Client
 * (edit mode): an unchanged consent selection keeps its stored audit
 * record; a changed one is a fresh PROFESSIONAL capture at `now`.
 */
export function buildClientFromForm(
  id: string,
  values: ClientFormValues,
  previous?: Client,
  now: Date = new Date(),
): Client {
  const notes = normalizeClientNotes(values.notes);
  const smsMarketingConsent = resolveClientSmsMarketingConsent(
    previous?.smsMarketingConsent,
    values.smsMarketingConsent,
    now,
  );
  return {
    id,
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim() || undefined,
    phone: values.phone.trim() || undefined,
    email: values.email.trim() || undefined,
    ...(values.birthday !== undefined ? { birthday: values.birthday } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(smsMarketingConsent !== undefined ? { smsMarketingConsent } : {}),
  };
}

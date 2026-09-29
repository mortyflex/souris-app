// Souris — Client presentation at application level
//
// Resolution of appointment clientIds against the coherent Client source.
// The fallback reveals data inconsistency without inventing an identity.

import {
  getClientDisplayName,
  type Client,
  type ClientSmsMarketingConsentStatus,
} from '@/domain/clients';

export const UNKNOWN_CLIENT_LABEL = 'Client inconnu';
/** Subtle lifecycle indicator shown on archived Clients (directory row, profile). */
export const ARCHIVED_CLIENT_LABEL = 'Archivé';

export function getResolvedClientDisplayName(client: Client | undefined): string {
  return client ? getClientDisplayName(client) : UNKNOWN_CLIENT_LABEL;
}

/** The promotional SMS consent field, form and profile alike. */
export const SMS_CONSENT_FIELD_LABEL = 'SMS promotionnels';
export const SMS_CONSENT_UNKNOWN_LABEL = 'Non renseigné';
export const SMS_CONSENT_OPTED_IN_LABEL = 'Autorisés';
export const SMS_CONSENT_OPTED_OUT_LABEL = 'Refusés';
/** Concise informational note when the client accepts SMS without a texting-capable number. */
export const SMS_CONSENT_PHONE_NOTICE =
  'Aucun numéro de mobile utilisable : les SMS ne pourront pas être envoyés.';

export function formatClientSmsConsentStatus(
  status: ClientSmsMarketingConsentStatus | undefined,
): string {
  if (status === 'OPTED_IN') return SMS_CONSENT_OPTED_IN_LABEL;
  if (status === 'OPTED_OUT') return SMS_CONSENT_OPTED_OUT_LABEL;
  return SMS_CONSENT_UNKNOWN_LABEL;
}

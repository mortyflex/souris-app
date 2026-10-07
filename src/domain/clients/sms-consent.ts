// BeautIzzy — Client promotional SMS consent
//
// Explicit consent for promotional lifecycle SMS (birthday offer, win-back —
// docs/architecture/COMMUNICATIONS.md, SMS pivot Phase 2). Three states:
//
//   UNKNOWN    never asked / never recorded — the domain value is ABSENT
//   OPTED_IN   the client expressly accepts promotional SMS
//   OPTED_OUT  the client expressly refuses them
//
// Only OPTED_IN may ever receive a lifecycle SMS; the server enforces it. A
// phone number by itself is never consent, existing and imported clients are
// UNKNOWN, and legacy data never carries consent (docs/domain/CLIENTS.md).
//
// A recorded consent always carries its minimal audit pair: when it was
// recorded and by which path. Phase 2 only records PROFESSIONAL captures
// (the professional writes down the client's expressed choice);
// CLIENT_STOP is reserved for a future inbound unsubscribe mechanism.
//
// Plain TypeScript: no React, no persistence, no provider SDK.

export type ClientSmsMarketingConsentStatus = 'OPTED_IN' | 'OPTED_OUT';

export type ClientSmsMarketingConsentSource = 'PROFESSIONAL' | 'CLIENT_STOP';

export interface ClientSmsMarketingConsent {
  readonly status: ClientSmsMarketingConsentStatus;
  /** Instant the consent was last recorded. */
  readonly updatedAt: Date;
  /** Who recorded it. Phase 2 captures are always PROFESSIONAL. */
  readonly source: ClientSmsMarketingConsentSource;
}

export const CLIENT_SMS_CONSENT_STATUSES: readonly ClientSmsMarketingConsentStatus[] = [
  'OPTED_IN',
  'OPTED_OUT',
];

export const CLIENT_SMS_CONSENT_SOURCES: readonly ClientSmsMarketingConsentSource[] = [
  'PROFESSIONAL',
  'CLIENT_STOP',
];

export function isClientSmsMarketingConsentStatus(
  value: string,
): value is ClientSmsMarketingConsentStatus {
  return (CLIENT_SMS_CONSENT_STATUSES as readonly string[]).includes(value);
}

export function isClientSmsMarketingConsentSource(
  value: string,
): value is ClientSmsMarketingConsentSource {
  return (CLIENT_SMS_CONSENT_SOURCES as readonly string[]).includes(value);
}

/**
 * The stored consent after a professional edit. An unchanged selection keeps
 * the existing record (its audit instant included); a genuine change —
 * including recording a first choice — is a fresh PROFESSIONAL capture at
 * `now`; clearing back to « Non renseigné » removes the record entirely.
 */
export function resolveClientSmsMarketingConsent(
  previous: ClientSmsMarketingConsent | undefined,
  selected: ClientSmsMarketingConsentStatus | undefined,
  now: Date,
): ClientSmsMarketingConsent | undefined {
  if (selected === undefined) return undefined;
  if (previous !== undefined && previous.status === selected) return previous;
  return { status: selected, updatedAt: now, source: 'PROFESSIONAL' };
}

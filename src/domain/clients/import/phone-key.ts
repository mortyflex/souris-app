// BeautIzzy — client import phone comparison keys
//
// Duplicate detection needs to recognize the same number written in the
// many ways an address book carries it:
//
//   06 12 34 56 78 · 06.12.34.56.78 · +33 6 12 34 56 78 · +33 (0)6 12 34 56 78
//   33612345678    · 0033 6 12 34 56 78
//
// The communications rule (`normalizeCommunicationPhoneE164`, mirroring the
// server) is ONE input and is never modified here: this module only cleans
// the forms it does not cover — the « (0) » trunk marker, a trunk 0 kept
// after the country code, a bare 33 country code — before asking it.
//
// Keys are for COMPARISON only. The stored Client phone stays the raw
// trimmed value; nothing canonical is ever stored (no `phone_e164`).

import { normalizeCommunicationPhoneE164 } from '@/domain/communications/phone';

export interface ClientImportPhoneKey {
  /** E.164-like canonical number, when the value is recognized. */
  readonly canonical?: string;
  /** Last nine digits — the weak fallback comparison when canonical forms cannot decide. */
  readonly lastNine?: string;
}

const TRUNK_MARKER = /\(\s*0\s*\)/g;
const TRUNK_AFTER_FRENCH_CODE = /^\+330(\d{9})$/;
const BARE_FRENCH_CODE = /^33([1-9]\d{8})$/;

function canonicalPhone(value: string): string | undefined {
  const cleaned = value.replace(TRUNK_MARKER, ' ');
  const canonical = normalizeCommunicationPhoneE164(cleaned);
  if (canonical !== undefined) {
    const trunk = TRUNK_AFTER_FRENCH_CODE.exec(canonical);
    return trunk ? `+33${trunk[1]}` : canonical;
  }
  const digits = cleaned.replace(/\D/g, '');
  const bare = BARE_FRENCH_CODE.exec(digits);
  return bare ? `+33${bare[1]}` : undefined;
}

/** Comparison keys of a phone value; blank → no key at all. */
export function clientImportPhoneKey(phone: string | undefined): ClientImportPhoneKey {
  if (phone === undefined || phone.trim().length === 0) return {};
  const canonical = canonicalPhone(phone.trim());
  const digits = (canonical ?? phone).replace(TRUNK_MARKER, ' ').replace(/\D/g, '');
  const lastNine = digits.length >= 9 ? digits.slice(-9) : undefined;
  return {
    ...(canonical !== undefined ? { canonical } : {}),
    ...(lastNine !== undefined ? { lastNine } : {}),
  };
}

/** True when the value maps to a canonical number (a warning is raised otherwise, never a refusal). */
export function isRecognizedClientImportPhone(phone: string): boolean {
  return clientImportPhoneKey(phone).canonical !== undefined;
}

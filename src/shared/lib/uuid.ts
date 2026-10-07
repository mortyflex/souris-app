// BeautIzzy — globally unique runtime identities
//
// The ONE source of new top-level record ids (Client, Service, Appointment,
// Product, Sale). Every id is a random UUID v4 (RFC 4122, 122 random bits)
// from the platform's cryptographic generator, so two devices of the same
// Business can create records independently without ever producing the
// same key (docs/architecture/CLOUD_SYNC.md §5). Nested child ids keep
// deriving from their parent id inside each feature's runtime-ids module.
//
// Existing persisted ids are never rewritten: only NEW records receive one.

import { randomUUID } from 'expo-crypto';

/** Canonical lowercase UUID v4 text: 8-4-4-4-12 hex digits, version nibble 4, variant 8/9/a/b. */
export const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

/**
 * A fresh UUID v4. Fails loudly instead of returning a non-UUID when the
 * platform generator is unavailable, so a broken environment can never
 * persist a record under an unusable identity.
 */
export function createUuidV4(): string {
  const value: unknown = randomUUID();
  if (typeof value !== 'string' || !isUuidV4(value)) {
    throw new Error('createUuidV4: the platform did not return a UUID v4');
  }
  return value;
}

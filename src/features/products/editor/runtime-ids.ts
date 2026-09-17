import { createUuidV4 } from '@/shared/lib/uuid';

/**
 * Identity of a NEW catalog Product: a globally unique UUID v4, safe for
 * creation on several devices of the same Business. Existing Product ids
 * are never rewritten.
 */
export function createProductId(): string {
  return createUuidV4();
}

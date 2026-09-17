import { createUuidV4 } from '@/shared/lib/uuid';

/**
 * Identity of a NEW Client: a globally unique UUID v4, safe for creation on
 * several devices of the same Business. ID generation stays at the
 * application boundary — never inside the Client domain. Existing Client
 * ids are never rewritten.
 */
export function createClientId(): string {
  return createUuidV4();
}

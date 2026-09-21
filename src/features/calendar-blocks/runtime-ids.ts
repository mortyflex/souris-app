import { createUuidV4 } from '@/shared/lib/uuid';

/**
 * Identity of a NEW Calendar Block: a globally unique UUID v4, safe for
 * creation on several devices of the same Business (CLOUD_SYNC.md §5).
 */
export function createCalendarBlockId(): string {
  return createUuidV4();
}

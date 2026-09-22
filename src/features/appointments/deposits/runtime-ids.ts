import { createUuidV4 } from '@/shared/lib/uuid';

/**
 * Identity of a NEW Appointment deposit: a globally unique UUID v4 (its own
 * sync aggregate, CLOUD_SYNC.md §21). Generated ONCE per « Prendre un
 * acompte » presentation, so a repeated submission reuses it and is refused.
 */
export function createAppointmentDepositId(): string {
  return createUuidV4();
}

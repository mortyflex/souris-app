import { createUuidV4 } from '@/shared/lib/uuid';

let phaseSequence = 0;

/**
 * Identity of a NEW catalog Service: a globally unique UUID v4, safe for
 * creation on several devices of the same Business. Existing Service ids
 * are never rewritten.
 */
export function createServiceId(): string {
  return createUuidV4();
}

/** Phase identity derived from its parent: unique inside the Service, like the parent is globally. */
export function createServicePhaseId(serviceId: string, now = new Date()): string {
  phaseSequence += 1;
  return `${serviceId}-phase-${now.getTime()}-${phaseSequence}`;
}

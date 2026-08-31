let serviceSequence = 0;
let phaseSequence = 0;

/** Runtime-only identities for the current in-memory Service catalog. */
export function createServiceId(now = new Date()): string {
  serviceSequence += 1;
  return `service-${now.getTime()}-${serviceSequence}`;
}

export function createServicePhaseId(serviceId: string, now = new Date()): string {
  phaseSequence += 1;
  return `${serviceId}-phase-${now.getTime()}-${phaseSequence}`;
}

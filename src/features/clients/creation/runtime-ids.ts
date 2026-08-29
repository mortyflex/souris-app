let clientSequence = 0;

/**
 * Runtime-only Client identity for the current in-memory session, mirroring
 * the appointment runtime-id pattern. ID generation stays at the application
 * boundary — never inside the Client domain.
 */
export function createClientId(now = new Date()): string {
  clientSequence += 1;
  return `client-${now.getTime()}-${clientSequence}`;
}

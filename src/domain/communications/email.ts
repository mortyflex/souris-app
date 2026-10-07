// BeautIzzy — communication email rules (Lot B)
//
// THE email-usability rule of client communications, in one place. The same
// shape check exists server-side (`communications_is_valid_email` in the Lot B
// migration): both sides accept "something@something.something" with no
// whitespace — a deliberate UX-level check, not RFC 5322. The server remains
// authoritative: an address the server refuses is never emailed, whatever the
// device believed.
//
// Plain TypeScript: no React, no persistence, no provider SDK.

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 320;

/** A non-empty address a reminder could actually be sent to. */
export function isUsableCommunicationEmail(email: string | undefined): boolean {
  if (email === undefined) return false;
  const trimmed = email.trim();
  return (
    trimmed.length > 0 && trimmed.length <= MAX_EMAIL_LENGTH && EMAIL_SHAPE.test(trimmed)
  );
}

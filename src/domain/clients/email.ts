// Souris — Client email rules
//
// THE email rule of a Client, shared by manual creation / editing (the
// Client form) and the client import review, so the two can never drift.
// Validation stays basic and UX-level: a non-empty email must look like
// "something@something.something". The stored value is what the professional
// typed (trimmed); comparison uses a trimmed, lowercased key.

const CLIENT_EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the trimmed value looks like an email. Blank is NOT an email. */
export function isValidClientEmail(email: string): boolean {
  return CLIENT_EMAIL_SHAPE.test(email.trim());
}

/** Comparison key: trimmed + lowercased; blank → undefined. Never stored. */
export function clientEmailComparisonKey(email: string | undefined): string | undefined {
  if (email === undefined) return undefined;
  const key = email.trim().toLowerCase();
  return key.length > 0 ? key : undefined;
}

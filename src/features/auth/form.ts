// Souris — credential form rules (pure)
//
// Email normalization and the minimal local validation shared by sign-up
// and sign-in. Supabase remains the authority (its own rules are surfaced
// through AuthFailure codes); these checks only avoid pointless round trips.

export const PASSWORD_MIN_LENGTH = 8;

export interface CredentialFormValues {
  readonly email: string;
  readonly password: string;
}

export const EMPTY_CREDENTIALS: CredentialFormValues = { email: '', password: '' };

export interface CredentialFormErrors {
  readonly email?: string;
  readonly password?: string;
}

/** Lower-cases and trims; what is sent to Supabase and shown back to the user. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/**
 * `mode` decides the password rule: sign-up enforces the minimum length,
 * sign-in only requires a value (an old shorter password must still work).
 */
export function validateCredentials(
  values: CredentialFormValues,
  mode: 'sign-up' | 'sign-in',
): CredentialFormErrors {
  const errors: { email?: string; password?: string } = {};
  const email = normalizeEmail(values.email);

  if (email.length === 0) {
    errors.email = 'L’email est requis.';
  } else if (!isPlausibleEmail(email)) {
    errors.email = 'Adresse email invalide.';
  }

  if (values.password.length === 0) {
    errors.password = 'Le mot de passe est requis.';
  } else if (mode === 'sign-up' && values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `${PASSWORD_MIN_LENGTH} caractères minimum.`;
  }

  return errors;
}

export function hasCredentialErrors(errors: CredentialFormErrors): boolean {
  return errors.email !== undefined || errors.password !== undefined;
}

// Souris — user-facing Auth wording (French)
//
// Every failure code maps to one concise sentence. Provider error strings
// never reach the UI.

import type { AuthFailureCode } from './gateway';

const messages: Record<AuthFailureCode, string> = {
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect.',
  EMAIL_NOT_CONFIRMED: 'Confirmez votre adresse email avant de vous connecter.',
  EMAIL_ALREADY_REGISTERED: 'Un compte existe déjà avec cet email.',
  WEAK_PASSWORD: 'Choisissez un mot de passe plus robuste (8 caractères minimum).',
  INVALID_EMAIL: 'Adresse email invalide.',
  RATE_LIMITED: 'Trop de tentatives. Patientez un instant avant de réessayer.',
  NETWORK: 'Connexion impossible. Vérifiez votre réseau et réessayez.',
  NOT_CONFIGURED: 'Souris n’est pas encore relié à son service de compte.',
  UNKNOWN: 'Une erreur est survenue. Réessayez.',
};

export function formatAuthFailure(code: AuthFailureCode): string {
  return messages[code];
}

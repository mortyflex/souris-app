// Souris — user-facing Business session wording (French)

import type { BusinessSessionFailureCode } from './session/resolve-business-session';

const messages: Record<BusinessSessionFailureCode, string> = {
  NETWORK: 'Une connexion internet est nécessaire pour cette première étape. Vérifiez votre réseau et réessayez.',
  MULTIPLE_REMOTE_BUSINESSES:
    'Plusieurs activités sont associées à ce compte. Contactez le support Souris avant de continuer.',
  OWNER_MISMATCH: 'Cette activité n’appartient pas au compte connecté.',
  LOCAL_DATA_CONFLICT:
    'Les données de cet appareil ne peuvent pas être associées automatiquement à votre compte.',
  FORBIDDEN: 'Le service de compte a refusé l’opération.',
  UNKNOWN: 'Une erreur est survenue. Réessayez.',
};

export function formatBusinessSessionFailure(code: BusinessSessionFailureCode): string {
  return messages[code];
}

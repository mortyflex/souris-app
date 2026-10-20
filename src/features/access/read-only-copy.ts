// BeautIzzy — what the professional reads when access is read-only (pure)
//
// ONE vocabulary for every surface that explains read-only access: the
// status card of Accueil, the paywall of an existing account, and the alert
// that replaces a refused mutation (`alertPersistenceFailure`). Each sentence
// says exactly what the access policy knows — the domain's `ReadOnlyReason`
// — and never more:
//
//   subscription-expired     the store confirmed the end: "no longer active";
//   never-subscribed         the store confirmed there never was one;
//   no-entitlement-evidence  nothing could be verified and nothing proves a
//   unreliable-evidence      past entitlement: "could not be verified", never
//                            "expired";
//   grace-elapsed            unverified for days: never a payment failure.
//
// Reassuring, never alarmist: data is kept, reading stays possible, Plus is
// what modifications need. No colour, no icon and no red is implied here.

import type { ReadOnlyReason } from '@/domain/access';

export const READ_ONLY_STATUS_TITLE = 'Votre activité est en lecture seule.';
export const READ_ONLY_STATUS_DETAIL =
  'Vous pouvez toujours consulter vos rendez-vous, votre clientèle et vos chiffres.';
export const READ_ONLY_DATA_PRESERVED = 'Vos données sont conservées.';
export const READ_ONLY_REQUIRES_PLUS = 'Les modifications nécessitent BeautIzzy Plus.';
export const READ_ONLY_MANAGEMENT_PENDING =
  'La gestion de l’abonnement sera bientôt disponible dans l’application.';

/** One accurate sentence per domain reason. */
export function describeReadOnlyReason(reason: ReadOnlyReason): string {
  switch (reason) {
    case 'subscription-expired':
      return 'Votre abonnement BeautIzzy Plus n’est plus actif.';
    case 'never-subscribed':
      return 'Votre compte n’a pas d’abonnement BeautIzzy Plus.';
    case 'no-entitlement-evidence':
    case 'unreliable-evidence':
      return 'Votre abonnement n’a pas pu être vérifié pour le moment.';
    case 'grace-elapsed':
      return 'Votre abonnement n’a pas pu être vérifié depuis plusieurs jours.';
  }
}

export const ACCESS_DENIED_TITLE = 'Action réservée à BeautIzzy Plus';
export const ACCESS_DENIED_MESSAGE =
  'Vous pouvez toujours consulter vos données. Un abonnement BeautIzzy Plus est nécessaire pour les modifier.';

export interface BusinessAccessDenialCopy {
  readonly title: string;
  readonly message: string;
}

/**
 * The alert of a refused mutation: the reason first when it says something
 * the generic sentence does not, then the generic explanation.
 */
export function describeBusinessAccessDenial(reason: ReadOnlyReason): BusinessAccessDenialCopy {
  const message =
    reason === 'never-subscribed'
      ? ACCESS_DENIED_MESSAGE
      : `${describeReadOnlyReason(reason)} ${ACCESS_DENIED_MESSAGE}`;
  return { title: ACCESS_DENIED_TITLE, message };
}

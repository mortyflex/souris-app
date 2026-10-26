// BeautIzzy — reminder wording (Lot B)
//
// French copy of the reminder feature, in one place: the Settings rows, the
// per-appointment toggle, the missing-email warning and the Details status
// line. Technical/provider language never reaches a screen; SENT means
// « Envoyé » — provider acceptance, never a delivery or read claim.

import type { AppointmentReminderStatus } from './gateway';

export const REMINDER_SETTINGS_TITLE = 'Rappels clients';
export const REMINDER_TOGGLE_LABEL = 'Rappels par e-mail';
export const REMINDER_TIMING_LABEL = 'Envoi';
export const REMINDER_TIMING_VALUE = '24 h avant le rendez-vous';
export const REMINDER_REPLY_TO_LABEL = 'Adresse de réponse';
export const REMINDER_INVALID_REPLY_TO = 'Adresse e-mail invalide.';
export const REMINDER_UPDATE_FAILURE =
  'Impossible d’enregistrer le réglage pour le moment. Réessayez.';
export const REMINDER_OFFLINE_NOTICE =
  'Connexion indisponible : le réglage affiché est le dernier connu.';
/**
 * The server refused to turn a communication ON for lack of BeautIzzy Plus
 * (ENTITLEMENT_REQUIRED): the stored setting stands, nothing was changed.
 * Never a technical failure wording; disabling is always possible.
 */
export const COMMUNICATION_REQUIRES_PLUS =
  'L’activation nécessite BeautIzzy Plus. Votre réglage actuel est conservé.';

export const LIFECYCLE_SMS_SETTINGS_TITLE = 'SMS fidélisation';
export const LIFECYCLE_BIRTHDAY_TOGGLE_LABEL = 'Anniversaires';
export const LIFECYCLE_WINBACK_TOGGLE_LABEL = 'Clients inactifs';
export const LIFECYCLE_DISCOUNT_LABEL = 'Réduction';
export const LIFECYCLE_VALIDITY_LABEL = 'Offre valable';
export const LIFECYCLE_AFTER_LABEL = 'Inactif depuis';
/** The server refused a knob value (INVALID_VALUE) — never RPC wording. */
export const LIFECYCLE_INVALID_VALUE = 'Cette valeur n’est pas autorisée.';
/** Offline before any successful read: nothing is « dernier connu ». */
export const LIFECYCLE_UNAVAILABLE_NOTICE =
  'Connexion indisponible : les réglages n’ont pas pu être chargés.';

/** The spoken [ − ] / [ + ] actions of the SMS fidélisation steppers. */
export const LIFECYCLE_STEPPER_LABELS = {
  birthdayDiscount: {
    decrement: 'Diminuer la réduction anniversaire',
    increment: 'Augmenter la réduction anniversaire',
  },
  birthdayValidity: {
    decrement: 'Diminuer la durée de validité anniversaire',
    increment: 'Augmenter la durée de validité anniversaire',
  },
  winbackAfter: {
    decrement: 'Diminuer le délai d’inactivité',
    increment: 'Augmenter le délai d’inactivité',
  },
  winbackDiscount: {
    decrement: 'Diminuer la réduction pour les clients inactifs',
    increment: 'Augmenter la réduction pour les clients inactifs',
  },
  winbackValidity: {
    decrement: 'Diminuer la durée de validité pour les clients inactifs',
    increment: 'Augmenter la durée de validité pour les clients inactifs',
  },
} as const;

/** `15` → `15 %` (the French spaced percent). */
export function formatLifecyclePercent(percent: number): string {
  return `${percent} %`;
}

/** `7` → `7 jours`, `1` → `1 jour`. */
export function formatLifecycleDays(daysCount: number): string {
  return `${daysCount} jour${daysCount > 1 ? 's' : ''}`;
}

export const APPOINTMENT_REMINDER_ROW_LABEL = 'Rappel client';
export const MISSING_EMAIL_TITLE = 'Aucune adresse e-mail renseignée';
export const MISSING_EMAIL_MESSAGE = 'Le rappel ne pourra pas être envoyé.';
export const MISSING_EMAIL_ACTION = 'Ajouter l’e-mail';

/** « 26 septembre à 14:30 » on the device's local calendar. */
export function formatReminderInstant(instant: Date): string {
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(instant);
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
    .format(instant)
    .replace(' ', '');
  return `${date} à ${time}`;
}

/**
 * The Details status line, or undefined when the row should not appear
 * (NONE: a terminal or past appointment with no reminder history).
 */
export function formatAppointmentReminderStatus(
  status: AppointmentReminderStatus,
): string | undefined {
  switch (status.status) {
    case 'SCHEDULED':
      return status.scheduledFor
        ? `Programmé · ${formatReminderInstant(status.scheduledFor)}`
        : 'Programmé';
    case 'SENT':
      return 'Envoyé';
    case 'FAILED':
      return 'Échec de l’envoi';
    case 'DISABLED':
      return 'Désactivé';
    case 'MISSING_EMAIL':
      return 'Aucune adresse e-mail';
    case 'TOO_LATE':
      return 'Non programmé · rendez-vous créé trop tard';
    case 'NONE':
      return undefined;
  }
}

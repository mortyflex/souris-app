// BeautIzzy — birthday copy
//
// The French wording of the birthday reminders. Friendly and professional,
// never sentimental. No emoji: the shared cake glyph (birthday-icon) carries
// the celebration.

import type { Client } from '@/domain/clients';

const ELIDED_INITIALS = new Set(['a', 'e', 'i', 'o', 'u', 'y', 'h']);

/** « de Léa », « d'Amel », « d'Élodie » — the elision depends on the first sound. */
export function formatOfFirstName(firstName: string): string {
  const name = firstName.trim();
  const initial = name.charAt(0).normalize('NFD').charAt(0).toLowerCase();
  return ELIDED_INITIALS.has(initial) ? `d'${name}` : `de ${name}`;
}

export const PROFILE_BIRTHDAY_TITLE = 'Joyeux anniversaire';
export const PROFILE_BIRTHDAY_SUGGESTION =
  'Vous pouvez lui proposer une réduction sur son rendez-vous.';

/**
 * « C'est l'anniversaire d'Amel aujourd'hui. » when the birthday date IS
 * today (the profile, an Appointment created for today), « … ce jour-là. »
 * when it is the date of an Appointment on another day. The caller says which
 * date it is talking about; today's device date is never assumed.
 */
export function formatBirthdayMessage(
  client: Pick<Client, 'firstName'>,
  when: 'TODAY' | 'THAT_DAY',
): string {
  const moment = when === 'TODAY' ? "aujourd'hui" : 'ce jour-là';
  return `C'est l'anniversaire ${formatOfFirstName(client.firstName)} ${moment}.`;
}

/** Second line of the compact reminder of the Appointment creation Cliente step. */
export const SELECTION_BIRTHDAY_SUGGESTION =
  'Vous pourrez lui proposer une réduction sur ce rendez-vous.';

export function formatProfileBirthdayAccessibilityLabel(
  client: Pick<Client, 'firstName'>,
): string {
  return `Anniversaire aujourd'hui. Vous pouvez proposer une réduction à ${client.firstName.trim()}.`;
}

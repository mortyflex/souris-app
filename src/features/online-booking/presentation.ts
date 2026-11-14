// BeautIzzy — online booking settings copy and status reading
//
// French product copy of the settings screen, and the ONE reading of a
// profile's public state. The server decides what is public; this only puts
// its answer into words.

import type { BookingProfileField } from '@/domain/online-booking';

import type { BookingProfile, BookingProfileServerField } from './gateway';

export const ONLINE_BOOKING_TITLE = 'Réservation en ligne';
export const ONLINE_BOOKING_ROW_TITLE = 'Réservation en ligne';
export const ONLINE_BOOKING_ROW_META = 'Votre page publique';

export const ONLINE_BOOKING_OFFLINE_NOTICE =
  'Connexion nécessaire pour afficher et modifier votre page publique.';
export const ONLINE_BOOKING_SAVE_FAILURE =
  'Vos modifications n’ont pas été enregistrées. Vérifiez votre connexion et réessayez.';
export const ONLINE_BOOKING_STATE_FAILURE =
  'Le changement n’a pas été pris en compte. Vérifiez votre connexion et réessayez.';
export const ONLINE_BOOKING_SAVED = 'Modifications enregistrées.';
export const ONLINE_BOOKING_IMAGE_TOO_LARGE =
  'Cette image est trop lourde. Choisissez-en une autre.';
export const ONLINE_BOOKING_IMAGE_FAILURE =
  'L’image n’a pas pu être préparée. Réessayez ou choisissez-en une autre.';

export const ONLINE_BOOKING_SLUG_INVALID =
  'Utilisez 3 à 60 caractères : lettres minuscules, chiffres et tirets.';
export const ONLINE_BOOKING_SLUG_UNAVAILABLE = 'Cette adresse est déjà utilisée. Choisissez-en une autre.';
export const ONLINE_BOOKING_SLUG_REQUIRED_WHILE_PUBLISHED =
  'Une page publiée garde une adresse. Dépubliez-la pour retirer son adresse.';

export const ONLINE_BOOKING_PUBLISH_LABEL = 'Publier ma page';
export const ONLINE_BOOKING_BOOKINGS_LABEL = 'Accepter les réservations';
export const ONLINE_BOOKING_BOOKINGS_HINT =
  'La prise de rendez-vous en ligne n’est pas encore ouverte : votre page indique seulement qu’elle arrive.';
export const ONLINE_BOOKING_SAVE_BEFORE_PUBLISHING = 'Enregistrez vos modifications avant de publier.';
export const ONLINE_BOOKING_NEEDS_SLUG = 'Choisissez l’adresse de votre page avant de la publier.';
export const ONLINE_BOOKING_PUBLICATION_UNAVAILABLE =
  'La publication des pages n’est pas encore ouverte. Vous pouvez préparer la vôtre dès maintenant.';
export const ONLINE_BOOKING_REQUIRES_PLUS =
  'La publication de votre page est incluse dans BeautIzzy Plus. Votre abonnement n’a pas pu être vérifié.';

export const ONLINE_BOOKING_FIELD_ERRORS: Readonly<Record<BookingProfileField, string>> = {
  slug: ONLINE_BOOKING_SLUG_INVALID,
  publicName: 'Ce nom est trop long (120 caractères au maximum).',
  description: 'Cette présentation est trop longue (1 000 caractères au maximum).',
  publicPhone: 'Ce numéro est trop long.',
  publicEmail: 'Cette adresse e-mail n’est pas valide.',
  address: 'Cette adresse est trop longue (200 caractères au maximum).',
};

const SERVER_FIELD_TO_FORM: Readonly<Partial<Record<BookingProfileServerField, BookingProfileField>>> = {
  public_name: 'publicName',
  description: 'description',
  public_phone: 'publicPhone',
  public_email: 'publicEmail',
  address: 'address',
};

/** The form field a server refusal points at; undefined for an image path or an unknown field. */
export function formFieldOfServerField(
  field: BookingProfileServerField | undefined,
): BookingProfileField | undefined {
  return field !== undefined ? SERVER_FIELD_TO_FORM[field] : undefined;
}

export type BookingPublicationKind = 'DRAFT' | 'ONLINE' | 'OFFLINE';

export interface BookingPublicationStatus {
  readonly kind: BookingPublicationKind;
  readonly label: string;
  readonly message: string;
}

/**
 * Draft, online, or published-but-offline. A published page is served only
 * while publication is open AND the owner's Plus access is verified — the
 * server re-checks both at every public read.
 */
export function describeBookingPublication(
  profile: Pick<BookingProfile, 'published' | 'publicationOpen' | 'plusAccess'>,
): BookingPublicationStatus {
  if (!profile.published) {
    return {
      kind: 'DRAFT',
      label: 'Brouillon',
      message: 'Votre page n’est pas visible. Préparez-la à votre rythme.',
    };
  }
  if (!profile.publicationOpen) {
    return { kind: 'OFFLINE', label: 'Hors ligne', message: ONLINE_BOOKING_PUBLICATION_UNAVAILABLE };
  }
  if (!profile.plusAccess) {
    return {
      kind: 'OFFLINE',
      label: 'Hors ligne',
      message: 'Votre page n’est plus visible : votre abonnement BeautIzzy Plus n’a pas pu être vérifié.',
    };
  }
  return { kind: 'ONLINE', label: 'En ligne', message: 'Votre page est visible par vos clients.' };
}

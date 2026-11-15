// BeautIzzy — online booking settings copy and status reading
//
// French product copy of the settings screen, and the ONE reading of a
// profile's public state. The server decides what is public; this only puts
// its answer into words.

import type { BookingProfileField } from '@/domain/online-booking';

import type { BookingProfile, BookingProfileServerField } from './gateway';
import type { PublicPageAudience, PublicPageLink, PublicWebOrigin } from './public-page-url';

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

export const ONLINE_BOOKING_UNSAVED_TITLE = 'Modifications non enregistrées';
export const ONLINE_BOOKING_UNSAVED_BODY =
  'Vous avez modifié votre page. Souhaitez-vous enregistrer vos changements avant de quitter ?';
export const ONLINE_BOOKING_SAVE_AND_LEAVE = 'Enregistrer et quitter';
export const ONLINE_BOOKING_KEEP_EDITING = 'Continuer la modification';
export const ONLINE_BOOKING_DISCARD_AND_LEAVE = 'Quitter sans enregistrer';
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

export const ONLINE_BOOKING_COPY_LINK_LABEL = 'Copier le lien';
export const ONLINE_BOOKING_LINK_COPIED = 'Lien copié.';
export const ONLINE_BOOKING_LINK_COPY_FAILURE = 'Le lien n’a pas pu être copié. Réessayez.';
export const ONLINE_BOOKING_SLUG_FORMAT_HINT = 'Lettres minuscules, chiffres et tirets.';

export interface BookingLinkInput {
  /** The address as typed in the field, trimmed. */
  readonly typedSlug: string;
  /** The address the server holds. */
  readonly storedSlug: string | undefined;
  readonly publication: BookingPublicationKind;
  /** The link of the TYPED address; undefined while no website origin is usable. */
  readonly link: PublicPageLink | undefined;
  /** Why no origin is usable, when none is (public-page-url.ts). */
  readonly originStatus?: PublicWebOrigin['status'];
}

const AUDIENCE_LABELS: Readonly<Record<PublicPageAudience, string>> = {
  PUBLIC: 'Lien public',
  TEST: 'Lien de test',
  LOCAL: 'Lien de test local',
};

const COPYABLE_MESSAGES: Readonly<Record<PublicPageAudience, string>> = {
  PUBLIC: 'Partagez ce lien avec vos clients.',
  TEST: 'Adresse de test : elle ne s’ouvre que dans l’environnement de test. Ne la partagez pas avec vos clients.',
  LOCAL:
    'Adresse locale de développement : elle ne s’ouvre que sur cet appareil de test, le site lancé sur votre ordinateur. Ne la partagez pas avec vos clients.',
};

/** Development builds on a physical device only: localhost and 10.0.2.2 cannot be reached from it. */
export const ONLINE_BOOKING_DEVICE_ORIGIN_REQUIRED =
  'Sur un appareil physique, le site de développement n’est joignable qu’à l’adresse de votre ordinateur sur le réseau : renseignez EXPO_PUBLIC_WEB_DEVICE_URL.';

export interface BookingLinkPresentation {
  /** The complete URL, the path alone without a configured website, or undefined without an address. */
  readonly address: string | undefined;
  /** « Lien public » / « Lien de test » / « Lien de test local »; undefined when no complete URL exists. */
  readonly audienceLabel: string | undefined;
  readonly audience: PublicPageAudience | undefined;
  /** What the link is, or why it cannot be copied yet. */
  readonly message: string;
  /** True only for the stored address of a page that is online, on a configured website. */
  readonly copyable: boolean;
}

/**
 * THE reading of the link under the address field. A link is copyable only
 * when it opens the page as the server serves it now: the page is online,
 * the typed address is the stored one, and a website origin is usable. A
 * test or local origin stays copyable — for the person testing — and says so;
 * only the production website is ever presented as shareable.
 */
export function describeBookingLink(input: BookingLinkInput): BookingLinkPresentation {
  const { typedSlug, storedSlug, publication, link, originStatus } = input;
  if (typedSlug.length === 0) {
    return {
      address: undefined,
      audienceLabel: undefined,
      audience: undefined,
      message: ONLINE_BOOKING_SLUG_FORMAT_HINT,
      copyable: false,
    };
  }
  const base = {
    address: link?.url ?? `/r/${typedSlug}`,
    audience: link?.audience,
    audienceLabel: link === undefined ? undefined : AUDIENCE_LABELS[link.audience],
  };
  const blocked = (message: string): BookingLinkPresentation => ({ ...base, message, copyable: false });

  if (link === undefined) {
    return blocked(
      originStatus === 'DEVICE_ORIGIN_REQUIRED'
        ? ONLINE_BOOKING_DEVICE_ORIGIN_REQUIRED
        : 'L’adresse complète de votre page n’est pas encore disponible dans cette version de l’application.',
    );
  }
  if (typedSlug !== storedSlug) {
    return blocked('Enregistrez vos modifications pour utiliser cette adresse.');
  }
  if (publication === 'DRAFT') {
    return blocked('Ce lien ne fonctionne pas encore : publiez votre page pour pouvoir le copier.');
  }
  if (publication === 'OFFLINE') {
    return blocked('Ce lien ne fonctionne pas pour le moment : votre page est hors ligne.');
  }
  return { ...base, copyable: true, message: COPYABLE_MESSAGES[link.audience] };
}

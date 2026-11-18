// BeautIzzy — « Prestations proposées en ligne »: copy and readings (pure)
//
// The French product copy of the screen and of its entry in Réservation en
// ligne, and the ONE reading of the server's answer: a price, a duration, an
// eligibility reason, the outcome of a change. The server decides what is
// offered online (docs/architecture/ONLINE_BOOKING.md §12); this module only
// puts its answer into words. No React, no network.
//
// Three words never mixed up:
//   proposée     her choice (`selected`), kept while a service is inactive;
//   disponible   THE server rule (`eligible`): active, a duration, ≤ 12 h;
//   visible      on her page — only when the page is online and accepts
//                bookings, decided by the server at every public read.

import { formatServiceDuration } from '@/features/services/presentation';
import { formatEuroCents } from '@/shared/lib/money';

import type {
  BookingProfile,
  OnlineBookingFailureCode,
  PublishableService,
  ServicePublication,
  ServicePublicationIssue,
} from '../gateway';

export const SERVICE_PUBLICATION_TITLE = 'Prestations proposées en ligne';
export const SERVICE_PUBLICATION_ROW_TITLE = SERVICE_PUBLICATION_TITLE;
export const SERVICE_PUBLICATION_ROW_HINT =
  'Seules les prestations proposées et disponibles apparaissent sur votre page.';

export const SERVICE_PUBLICATION_INTRO =
  'Choisissez les prestations de votre catalogue que vos clients peuvent réserver en ligne. Leur nom, leur durée, leur prix et leur description apparaissent sur votre page.';
export const SERVICE_PUBLICATION_PRIVATE_NOTE =
  'Les autres restent dans votre catalogue privé : elles ne sont jamais affichées.';

/** A catalogue price of 0 is never presented as free: nothing tells a free service from a price never set. */
export const PRICE_TO_CONFIRM = 'Tarif à confirmer';
export const DESCRIPTION_MISSING = 'Description non renseignée';
export const UNAVAILABLE_SECTION_TITLE = 'Indisponibles en ligne';
export const UNAVAILABLE_SECTION_NOTE =
  'Ces prestations ne peuvent pas être réservées en ligne pour le moment.';

export const SELECT_ALL_LABEL = 'Tout proposer';
export const WITHDRAW_ALL_LABEL = 'Tout retirer';

export const SERVICE_PUBLICATION_OFFLINE_NOTICE =
  'Connexion nécessaire pour afficher et modifier vos prestations proposées en ligne.';

/** The page as the professional's choices meet it — one line, never a second switch. */
export function describePagePublicationContext(
  profile: Pick<BookingProfile, 'published' | 'bookingEnabled' | 'publicationOpen' | 'plusAccess'> | undefined,
): string {
  if (profile === undefined) {
    return 'Une prestation proposée n’est visible que lorsque votre page est publiée et accepte les réservations.';
  }
  if (!profile.published) {
    return 'Votre page n’est pas encore publiée : vos choix sont enregistrés et seront visibles dès sa publication.';
  }
  if (!profile.publicationOpen || !profile.plusAccess) {
    return 'Votre page est hors ligne : vos choix sont enregistrés, mais personne ne les voit pour le moment.';
  }
  if (!profile.bookingEnabled) {
    return 'Votre page est en ligne, mais les réservations sont en pause : vos clients ne peuvent pas réserver.';
  }
  return 'Votre page est en ligne : vos clients y voient les prestations proposées et disponibles.';
}

/** « 45,00 € », or « Tarif à confirmer » for a catalogue price of 0. */
export function formatPublicationPrice(priceCents: number): string {
  return priceCents > 0 ? formatEuroCents(priceCents) : PRICE_TO_CONFIRM;
}

/** « 1 h 30 min » — or « Sans durée » for a service whose phases add up to nothing. */
export function formatPublicationDuration(durationMinutes: number): string {
  return durationMinutes > 0 ? formatServiceDuration(durationMinutes) : 'Sans durée';
}

/** « 45 min · 35,00 € » — the second line of a row. */
export function describeServiceFacts(service: Pick<PublishableService, 'durationMinutes' | 'priceCents'>): string {
  return `${formatPublicationDuration(service.durationMinutes)} · ${formatPublicationPrice(service.priceCents)}`;
}

/**
 * Why a service is not offered on the page although the list holds it — or
 * nothing for a service that is either offered or simply not chosen.
 * A chosen service that became unavailable keeps its choice: it says so, and
 * what brings it back.
 */
export function describeServiceAvailability(
  service: Pick<PublishableService, 'selected' | 'eligible' | 'ineligibleReason'>,
  maxServiceMinutes: number,
): string | undefined {
  if (service.eligible) return undefined;
  const limit = formatServiceDuration(maxServiceMinutes);
  if (service.selected) {
    switch (service.ineligibleReason) {
      case 'INACTIVE':
        return 'Proposée, mais désactivée dans votre catalogue : elle n’apparaît pas sur votre page. Réactivez-la pour qu’elle soit de nouveau proposée.';
      case 'NO_DURATION':
        return 'Proposée, mais sans durée : elle n’apparaît pas sur votre page. Indiquez sa durée dans votre catalogue.';
      case 'TOO_LONG':
        return `Proposée, mais plus longue que ${limit} : elle n’apparaît pas sur votre page.`;
      default:
        return 'Proposée, mais indisponible en ligne pour le moment : elle n’apparaît pas sur votre page.';
    }
  }
  switch (service.ineligibleReason) {
    case 'INACTIVE':
      return 'Désactivée dans votre catalogue. Réactivez-la pour pouvoir la proposer en ligne.';
    case 'NO_DURATION':
      return 'Sans durée : indiquez sa durée dans votre catalogue pour pouvoir la proposer.';
    case 'TOO_LONG':
      return `Plus de ${limit} : trop longue pour être réservée en ligne.`;
    default:
      return 'Indisponible en ligne pour le moment.';
  }
}

/**
 * Whether her switch can be turned: an available service always; an
 * unavailable one only to WITHDRAW a choice already made (the server never
 * lets an unavailable service be newly chosen).
 */
export function canToggleService(service: Pick<PublishableService, 'selected' | 'eligible'>): boolean {
  return service.eligible || service.selected;
}

/** The entry in Réservation en ligne: offered over available, read from the server. */
export type ServicePublicationEntryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly publication: ServicePublication }
  | { readonly status: 'unavailable' }
  | { readonly status: 'failed' };

export function describeServicePublicationEntry(state: ServicePublicationEntryState): string {
  switch (state.status) {
    case 'loading':
      return 'Chargement…';
    case 'unavailable':
      return 'Bientôt disponible';
    case 'failed':
      return 'Choisissez celles que vos clients peuvent réserver';
    case 'ready': {
      const { publication } = state;
      if (publication.services.length === 0) return 'Aucune prestation dans votre catalogue';
      const available = publication.services.filter((service) => service.eligible).length;
      if (available === 0) return 'Aucune prestation disponible en ligne';
      const offered = publication.bookableCount;
      if (offered === 0) return 'Aucune prestation proposée pour le moment';
      return `${offered} sur ${available} proposée${offered > 1 ? 's' : ''} en ligne`;
    }
  }
}

/** The answer to a load that failed, in plain French. */
export function describeServicePublicationLoadFailure(code: OnlineBookingFailureCode | undefined): string {
  switch (code) {
    case 'UNAVAILABLE':
      return 'Le choix des prestations en ligne n’est pas encore disponible sur votre compte. Réessayez plus tard.';
    case 'FORBIDDEN':
      return 'Ces réglages ne sont pas accessibles avec cette session. Reconnectez-vous puis réessayez.';
    case 'NETWORK':
    case undefined:
      return SERVICE_PUBLICATION_OFFLINE_NOTICE;
    default:
      return 'Vos prestations n’ont pas pu être chargées. Réessayez dans un instant.';
  }
}

/** A change the server did not store, in plain French. Nothing was changed. */
export function describeServicePublicationWriteFailure(code: OnlineBookingFailureCode | undefined): string {
  switch (code) {
    case 'NETWORK':
      return 'Le changement n’a pas été enregistré. Vérifiez votre connexion et réessayez.';
    case 'FORBIDDEN':
      return 'Le changement n’a pas été enregistré : votre session ne permet pas de modifier ces réglages. Reconnectez-vous puis réessayez.';
    case 'UNAVAILABLE':
      return 'Le choix des prestations en ligne n’est pas encore disponible sur votre compte. Réessayez plus tard.';
    default:
      return 'Le changement n’a pas été enregistré. Réessayez dans un instant.';
  }
}

/** The server refused one service of the change: nothing was written, the list is read again. */
export function describeServicePublicationRefusal(
  refusal:
    | { readonly status: 'UNKNOWN_SERVICE' }
    | { readonly status: 'NOT_ELIGIBLE'; readonly reason?: ServicePublicationIssue },
  serviceName: string | undefined,
  maxServiceMinutes: number,
): string {
  const named = serviceName !== undefined ? `« ${serviceName} »` : 'Cette prestation';
  if (refusal.status === 'UNKNOWN_SERVICE') {
    return `${named} n’existe plus dans votre catalogue. La liste a été mise à jour.`;
  }
  switch (refusal.reason) {
    case 'INACTIVE':
      return `${named} a été désactivée entre-temps : réactivez-la dans votre catalogue pour la proposer en ligne.`;
    case 'NO_DURATION':
      return `${named} n’a pas de durée : indiquez-la dans votre catalogue pour la proposer en ligne.`;
    case 'TOO_LONG':
      return `${named} dure plus de ${formatServiceDuration(maxServiceMinutes)} : elle ne peut pas être réservée en ligne.`;
    default:
      return `${named} ne peut pas être proposée en ligne pour le moment. La liste a été mise à jour.`;
  }
}

/** What the server confirmed — announced only once it did. */
export function describeServicePublicationSaved(
  change: { readonly selected: boolean; readonly serviceIds: readonly string[] },
  serviceName: string | undefined,
): string {
  const count = change.serviceIds.length;
  if (count === 1 && serviceName !== undefined) {
    return change.selected
      ? `« ${serviceName} » est proposée en ligne.`
      : `« ${serviceName} » n’est plus proposée en ligne.`;
  }
  if (!change.selected) return 'Plus aucune prestation n’est proposée en ligne.';
  return `${count} prestation${count > 1 ? 's' : ''} proposée${count > 1 ? 's' : ''} en ligne.`;
}

/** The confirmation of « Tout proposer »: what becomes public, and when. */
export function describeSelectAllConfirmation(count: number): { readonly title: string; readonly body: string } {
  return {
    title: 'Proposer toutes vos prestations ?',
    body: `${count === 1 ? 'La prestation disponible de cette liste sera proposée' : `Les ${count} prestations disponibles de cette liste seront proposées`} en ligne. Leur nom, leur durée, leur prix et leur description seront visibles par vos clients dès que votre page est publiée et accepte les réservations.`,
  };
}

/** The confirmation of « Tout retirer ». */
export function describeWithdrawAllConfirmation(count: number): { readonly title: string; readonly body: string } {
  return {
    title: 'Retirer toutes vos prestations ?',
    body: `${count === 1 ? 'La prestation proposée ne sera plus proposée' : `Les ${count} prestations proposées ne seront plus proposées`} en ligne. Elles restent dans votre catalogue ; vos clients ne pourront plus les réserver sur votre page.`,
  };
}

/** The spoken summary of a row, before its switch. */
export function describeServiceRowForAccessibility(
  service: PublishableService,
  maxServiceMinutes: number,
): string {
  const parts = [
    service.name,
    formatPublicationDuration(service.durationMinutes),
    formatPublicationPrice(service.priceCents),
    service.description === undefined ? DESCRIPTION_MISSING : 'description visible en ligne',
  ];
  const availability = describeServiceAvailability(service, maxServiceMinutes);
  if (availability !== undefined) parts.push(availability);
  return parts.join(', ');
}

/** « 1 prestation de cet appareil… » — local services the server does not list yet. */
export function describeUnsyncedServices(count: number): string | undefined {
  if (count <= 0) return undefined;
  return count === 1
    ? '1 prestation de cet appareil n’apparaît pas encore ici : elle s’affichera après la synchronisation.'
    : `${count} prestations de cet appareil n’apparaissent pas encore ici : elles s’afficheront après la synchronisation.`;
}

// BeautIzzy — « Prestations proposées en ligne »: the readings of the server's answer

import type { PublishableService, ServicePublication } from '../../gateway';
import {
  canToggleService,
  describePagePublicationContext,
  describeSelectAllConfirmation,
  describeServiceAvailability,
  describeServiceFacts,
  describeServicePublicationEntry,
  describeServicePublicationLoadFailure,
  describeServicePublicationRefusal,
  describeServicePublicationSaved,
  describeServicePublicationWriteFailure,
  describeServiceRowForAccessibility,
  describeUnsyncedServices,
  describeWithdrawAllConfirmation,
  formatPublicationDuration,
  formatPublicationPrice,
  PRICE_TO_CONFIRM,
} from '../presentation';

const service = (overrides: Partial<PublishableService> = {}): PublishableService => ({
  id: 'svc-coupe',
  name: 'Coupe',
  type: 'SERVICE',
  active: true,
  priceCents: 4500,
  durationMinutes: 45,
  selected: false,
  eligible: true,
  bookable: false,
  ...overrides,
});

const publication = (services: readonly PublishableService[]): ServicePublication => ({
  maxServiceMinutes: 720,
  selectedCount: services.filter((item) => item.selected).length,
  bookableCount: services.filter((item) => item.bookable).length,
  services,
});

/** Intl writes a narrow no-break space before « € »: compare on plain spaces. */
const plain = (text: string) => text.replace(/[  ]/g, ' ');

describe('prices and durations', () => {
  it('shows a configured price, and never presents a price of 0 as free', () => {
    expect(plain(formatPublicationPrice(4500))).toBe('45,00 €');
    expect(plain(formatPublicationPrice(1))).toBe('0,01 €');
    expect(formatPublicationPrice(0)).toBe(PRICE_TO_CONFIRM);
    expect(formatPublicationPrice(0)).toBe('Tarif à confirmer');
    expect(formatPublicationPrice(0)).not.toMatch(/gratuit|0,00/i);
  });

  it('words the duration like the catalogue, and a service without one plainly', () => {
    expect(formatPublicationDuration(45)).toBe('45 min');
    expect(formatPublicationDuration(90)).toBe('1 h 30 min');
    expect(formatPublicationDuration(720)).toBe('12 h');
    expect(formatPublicationDuration(0)).toBe('Sans durée');
    expect(plain(describeServiceFacts(service()))).toBe('45 min · 45,00 €');
    expect(describeServiceFacts(service({ priceCents: 0 }))).toBe('45 min · Tarif à confirmer');
  });
});

describe('availability of a service', () => {
  it('says nothing for an available service, chosen or not', () => {
    expect(describeServiceAvailability(service(), 720)).toBeUndefined();
    expect(describeServiceAvailability(service({ selected: true, bookable: true }), 720)).toBeUndefined();
  });

  it('keeps a chosen inactive service visible, says it is not on the page, and what brings it back', () => {
    const text = describeServiceAvailability(
      service({ selected: true, eligible: false, ineligibleReason: 'INACTIVE' }),
      720,
    );
    expect(text).toMatch(/^Proposée, mais désactivée/);
    expect(text).toMatch(/n’apparaît pas sur votre page/);
    expect(text).toMatch(/Réactivez-la/);
  });

  it('explains each reason of a service that cannot be chosen', () => {
    expect(describeServiceAvailability(service({ eligible: false, ineligibleReason: 'INACTIVE' }), 720)).toMatch(
      /^Désactivée dans votre catalogue/,
    );
    expect(describeServiceAvailability(service({ eligible: false, ineligibleReason: 'NO_DURATION' }), 720)).toMatch(
      /^Sans durée/,
    );
    expect(describeServiceAvailability(service({ eligible: false, ineligibleReason: 'TOO_LONG' }), 720)).toBe(
      'Plus de 12 h : trop longue pour être réservée en ligne.',
    );
    expect(describeServiceAvailability(service({ eligible: false }), 720)).toBe('Indisponible en ligne pour le moment.');
  });

  it('lets an unavailable service only be withdrawn, never newly chosen', () => {
    expect(canToggleService(service())).toBe(true);
    expect(canToggleService(service({ selected: true, eligible: false }))).toBe(true);
    expect(canToggleService(service({ selected: false, eligible: false }))).toBe(false);
  });
});

describe('the entry in Réservation en ligne', () => {
  it('counts the services offered over the services that could be', () => {
    const ready = (services: readonly PublishableService[]) =>
      describeServicePublicationEntry({ status: 'ready', publication: publication(services) });
    expect(ready([])).toBe('Aucune prestation dans votre catalogue');
    expect(ready([service({ eligible: false, ineligibleReason: 'INACTIVE' })])).toBe(
      'Aucune prestation disponible en ligne',
    );
    expect(ready([service(), service({ id: 'b' })])).toBe('Aucune prestation proposée pour le moment');
    expect(ready([service({ selected: true, bookable: true }), service({ id: 'b' })])).toBe('1 sur 2 proposée en ligne');
    expect(
      ready([
        service({ selected: true, bookable: true }),
        service({ id: 'b', selected: true, bookable: true }),
        service({ id: 'c' }),
        // Chosen but inactive: neither offered nor counted as available.
        service({ id: 'd', selected: true, eligible: false, ineligibleReason: 'INACTIVE' }),
      ]),
    ).toBe('2 sur 3 proposées en ligne');
  });

  it('never stays a spinner, and says when the server does not offer it yet', () => {
    expect(describeServicePublicationEntry({ status: 'loading' })).toBe('Chargement…');
    expect(describeServicePublicationEntry({ status: 'unavailable' })).toBe('Bientôt disponible');
    expect(describeServicePublicationEntry({ status: 'failed' })).toBe('Choisissez celles que vos clients peuvent réserver');
  });
});

describe('the page as the choices meet it', () => {
  const page = { published: true, bookingEnabled: true, publicationOpen: true, plusAccess: true };

  it('never confuses chosen with visible', () => {
    expect(describePagePublicationContext(undefined)).toMatch(/publiée et accepte les réservations/);
    expect(describePagePublicationContext({ ...page, published: false, bookingEnabled: false })).toMatch(
      /pas encore publiée : vos choix sont enregistrés/,
    );
    expect(describePagePublicationContext({ ...page, plusAccess: false })).toMatch(/hors ligne/);
    expect(describePagePublicationContext({ ...page, publicationOpen: false })).toMatch(/hors ligne/);
    expect(describePagePublicationContext({ ...page, bookingEnabled: false })).toMatch(/réservations sont en pause/);
    expect(describePagePublicationContext(page)).toMatch(/en ligne : vos clients y voient/);
  });
});

describe('outcomes of a change', () => {
  it('announces only what the server confirmed', () => {
    expect(describeServicePublicationSaved({ selected: true, serviceIds: ['a'] }, 'Coupe')).toBe(
      '« Coupe » est proposée en ligne.',
    );
    expect(describeServicePublicationSaved({ selected: false, serviceIds: ['a'] }, 'Coupe')).toBe(
      '« Coupe » n’est plus proposée en ligne.',
    );
    expect(describeServicePublicationSaved({ selected: true, serviceIds: ['a', 'b', 'c'] }, undefined)).toBe(
      '3 prestations proposées en ligne.',
    );
    expect(describeServicePublicationSaved({ selected: false, serviceIds: ['a', 'b'] }, undefined)).toBe(
      'Plus aucune prestation n’est proposée en ligne.',
    );
  });

  it('explains a refusal with the service it names', () => {
    expect(describeServicePublicationRefusal({ status: 'UNKNOWN_SERVICE' }, 'Coupe', 720)).toBe(
      '« Coupe » n’existe plus dans votre catalogue. La liste a été mise à jour.',
    );
    expect(describeServicePublicationRefusal({ status: 'NOT_ELIGIBLE', reason: 'INACTIVE' }, 'Coupe', 720)).toMatch(
      /désactivée entre-temps/,
    );
    expect(describeServicePublicationRefusal({ status: 'NOT_ELIGIBLE', reason: 'TOO_LONG' }, 'Coupe', 720)).toMatch(
      /plus de 12 h/,
    );
    expect(describeServicePublicationRefusal({ status: 'NOT_ELIGIBLE' }, undefined, 720)).toMatch(/^Cette prestation/);
  });

  it('explains every failure in plain French, without a technical code', () => {
    const texts = (['NETWORK', 'FORBIDDEN', 'UNAVAILABLE', 'UNKNOWN', undefined] as const).flatMap((code) => [
      describeServicePublicationWriteFailure(code),
      describeServicePublicationLoadFailure(code),
    ]);
    for (const text of texts) expect(text).not.toMatch(/PGRST|42501|RPC|null|undefined/);
    expect(describeServicePublicationWriteFailure('NETWORK')).toMatch(/connexion/);
    expect(describeServicePublicationWriteFailure('UNAVAILABLE')).toMatch(/pas encore disponible/);
    expect(describeServicePublicationLoadFailure('UNAVAILABLE')).toMatch(/pas encore disponible/);
    expect(describeServicePublicationLoadFailure('NETWORK')).toMatch(/^Connexion nécessaire/);
    expect(describeServicePublicationLoadFailure('FORBIDDEN')).toMatch(/Reconnectez-vous/);
  });

  it('says what « Tout proposer » publishes, and when', () => {
    expect(describeSelectAllConfirmation(7).body).toMatch(/^Les 7 prestations disponibles/);
    expect(describeSelectAllConfirmation(7).body).toMatch(/nom, leur durée, leur prix et leur description/);
    expect(describeSelectAllConfirmation(1).body).toMatch(/^La prestation disponible/);
    expect(describeWithdrawAllConfirmation(3).body).toMatch(/restent dans votre catalogue/);
  });
});

describe('accessibility and synchronisation', () => {
  it('speaks a row with its facts, its description state and its availability', () => {
    expect(plain(describeServiceRowForAccessibility(service({ description: 'Texte' }), 720))).toBe(
      'Coupe, 45 min, 45,00 €, description visible en ligne',
    );
    expect(
      describeServiceRowForAccessibility(
        service({ priceCents: 0, selected: true, eligible: false, ineligibleReason: 'INACTIVE' }),
        720,
      ),
    ).toMatch(/^Coupe, 45 min, Tarif à confirmer, Description non renseignée, Proposée, mais désactivée/);
  });

  it('mentions local services the server does not list yet, only when there are some', () => {
    expect(describeUnsyncedServices(0)).toBeUndefined();
    expect(describeUnsyncedServices(1)).toMatch(/^1 prestation de cet appareil n’apparaît/);
    expect(describeUnsyncedServices(3)).toMatch(/^3 prestations de cet appareil n’apparaissent/);
  });
});

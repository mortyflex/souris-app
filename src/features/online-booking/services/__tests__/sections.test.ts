// BeautIzzy — « Prestations proposées en ligne »: grouping and bulk plans

import type { PublishableService, ServicePublication } from '../../gateway';
import {
  buildServicePublicationSections,
  canSelectAll,
  canWithdrawAll,
  planSelectAll,
  planWithdrawAll,
} from '../sections';

const service = (id: string, overrides: Partial<PublishableService> = {}): PublishableService => ({
  id,
  name: id,
  type: 'SERVICE',
  active: true,
  priceCents: 3000,
  durationMinutes: 30,
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

const shape = (sections: ReturnType<typeof buildServicePublicationSections>) =>
  sections.map((section) => ({
    title: section.title,
    ...(section.groupLabel !== undefined ? { groupLabel: section.groupLabel } : {}),
    ids: section.services.map((item) => item.id),
  }));

const ongles = { id: 'cat-ongles', name: 'Ongles', position: 1 };
const regard = { id: 'cat-regard', name: 'Regard', position: 0 };

describe('the Services / Techniques organisation (hairdressing)', () => {
  it('keeps the two type groups, alphabetical in French, the unavailable ones last', () => {
    const sections = buildServicePublicationSections(
      publication([
        service('coupe', { name: 'Coupe femme' }),
        service('brushing', { name: 'Brushing' }),
        service('eclaircissement', { name: 'Éclaircissement', type: 'TECHNIQUE' }),
        service('balayage', { name: 'Balayage', type: 'TECHNIQUE' }),
        service('chignon', { name: 'Chignon', active: false, eligible: false, ineligibleReason: 'INACTIVE' }),
      ]),
      'SERVICE_TYPES',
    );
    expect(shape(sections)).toEqual([
      { title: 'Services', ids: ['brushing', 'coupe'] },
      { title: 'Techniques', ids: ['balayage', 'eclaircissement'] },
      { title: 'Indisponibles en ligne', ids: ['chignon'] },
    ]);
    expect(sections.map((section) => section.unavailable)).toEqual([false, false, true]);
  });

  it('subdivides a type group by her categories only when she assigned some', () => {
    const sections = buildServicePublicationSections(
      publication([
        service('coupe', { name: 'Coupe', category: ongles }),
        service('brushing', { name: 'Brushing' }),
        service('sourcils', { name: 'Sourcils', category: regard }),
        service('couleur', { name: 'Couleur', type: 'TECHNIQUE' }),
      ]),
      'SERVICE_TYPES',
    );
    expect(shape(sections)).toEqual([
      { title: 'Regard', groupLabel: 'Services', ids: ['sourcils'] },
      { title: 'Ongles', ids: ['coupe'] },
      { title: 'Sans catégorie', ids: ['brushing'] },
      { title: 'Techniques', ids: ['couleur'] },
    ]);
  });
});

describe('the categories organisation (nails, esthetics, wellness)', () => {
  it('follows her category order (position, then id), « Sans catégorie » then the unavailable ones last', () => {
    const tie = { id: 'cat-a-tie', name: 'Égalité', position: 1 };
    const sections = buildServicePublicationSections(
      publication([
        service('pose', { name: 'Pose complète gel', category: ongles }),
        service('depose', { name: 'Dépose', category: ongles }),
        service('rehaussement', { name: 'Rehaussement de cils', category: regard }),
        service('tie', { name: 'Égal', category: tie }),
        service('libre', { name: 'Prestation libre' }),
        service('long', { name: 'Journée', category: ongles, eligible: false, ineligibleReason: 'TOO_LONG', durationMinutes: 800 }),
      ]),
      'CATEGORIES',
    );
    expect(shape(sections)).toEqual([
      { title: 'Regard', ids: ['rehaussement'] },
      { title: 'Égalité', ids: ['tie'] },
      { title: 'Ongles', ids: ['depose', 'pose'] },
      { title: 'Sans catégorie', ids: ['libre'] },
      { title: 'Indisponibles en ligne', ids: ['long'] },
    ]);
    // The internal type is never a group there.
    expect(sections.some((section) => section.groupLabel !== undefined)).toBe(false);
  });

  it('builds nothing for an empty catalogue', () => {
    expect(buildServicePublicationSections(publication([]), 'CATEGORIES')).toEqual([]);
  });
});

describe('bulk plans', () => {
  const list = publication([
    service('a', { selected: true, bookable: true }),
    service('b'),
    service('c', { eligible: false, ineligibleReason: 'NO_DURATION', durationMinutes: 0 }),
    service('d', { selected: true, eligible: false, ineligibleReason: 'INACTIVE', active: false }),
  ]);

  it('« Tout proposer » names every available service of the list, never an unavailable one', () => {
    expect(planSelectAll(list)).toEqual({ serviceIds: ['a', 'b'], tooMany: false });
    expect(canSelectAll(list)).toBe(true);
    expect(canSelectAll(publication([service('a', { selected: true, bookable: true })]))).toBe(false);
  });

  it('« Tout retirer » names every chosen service, an unavailable one included', () => {
    expect(planWithdrawAll(list)).toEqual({ serviceIds: ['a', 'd'], tooMany: false });
    expect(canWithdrawAll(list)).toBe(true);
    expect(canWithdrawAll(publication([service('b')]))).toBe(false);
  });

  it('never plans more ids than one server change accepts', () => {
    const many = publication(Array.from({ length: 201 }, (_, index) => service(`svc-${index}`)));
    expect(planSelectAll(many).tooMany).toBe(true);
    const enough = publication(Array.from({ length: 200 }, (_, index) => service(`svc-${index}`)));
    expect(planSelectAll(enough)).toMatchObject({ tooMany: false });
    expect(planSelectAll(enough).serviceIds).toHaveLength(200);
  });
});

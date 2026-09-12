import type { Client } from '@/domain/clients';

import { buildClientDirectorySections } from '../directory-sections';

const anais: Client = { id: 'client-anais', firstName: 'Anaïs', lastName: 'Petit' };
const lea: Client = { id: 'client-lea', firstName: 'Léa', lastName: 'Martin', phone: '06 12 34 56 78' };
const zoe: Client = {
  id: 'client-zoe',
  firstName: 'Zoé',
  lastName: 'Martin',
  archivedAt: new Date(2026, 8, 1),
};
const bea: Client = { id: 'client-bea', firstName: 'Béa', archivedAt: new Date(2026, 8, 2) };

describe('buildClientDirectorySections', () => {
  it('groups active Clients first and archived Clients second, each alphabetically', () => {
    const sections = buildClientDirectorySections([zoe, lea, bea, anais], '');

    expect(sections.map((section) => section.title)).toEqual(['Actives', 'Archivées']);
    expect(sections[0]?.data.map((client) => client.id)).toEqual(['client-anais', 'client-lea']);
    expect(sections[1]?.data.map((client) => client.id)).toEqual(['client-bea', 'client-zoe']);
  });

  it('omits empty groups', () => {
    expect(buildClientDirectorySections([lea, anais], '').map((section) => section.key)).toEqual(['ACTIVE']);
    expect(buildClientDirectorySections([zoe], '').map((section) => section.key)).toEqual(['ARCHIVED']);
    expect(buildClientDirectorySections([], '')).toEqual([]);
  });

  it('searches both groups with the existing normalization and keeps the grouping', () => {
    const sections = buildClientDirectorySections([zoe, lea, bea, anais], 'martin');

    expect(sections.map((section) => section.title)).toEqual(['Actives', 'Archivées']);
    expect(sections[0]?.data.map((client) => client.id)).toEqual(['client-lea']);
    expect(sections[1]?.data.map((client) => client.id)).toEqual(['client-zoe']);

    expect(buildClientDirectorySections([zoe, lea, bea, anais], 'zoe')[0]).toEqual({
      key: 'ARCHIVED',
      title: 'Archivées',
      data: [zoe],
    });
  });

  it('never mutates the source', () => {
    const source = [zoe, lea];
    buildClientDirectorySections(source, '');
    expect(source).toEqual([zoe, lea]);
  });
});

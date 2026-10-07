// BeautIzzy — client import result copy (fictional data)

import { importedClientDetail, importedClientsTitle } from '../presentation';

describe('client import result copy', () => {
  it('counts the imported clients, singular and plural', () => {
    expect(importedClientsTitle(1)).toBe('1 client importé');
    expect(importedClientsTitle(8)).toBe('8 clients importés');
  });

  it('gives each imported client at most one short line, never a placeholder', () => {
    expect(importedClientDetail({ id: 'a', firstName: 'Julie', phone: '06 12 34 56 78' })).toBe('06 12 34 56 78');
    expect(importedClientDetail({ id: 'b', firstName: 'Nina', email: 'nina@example.com' })).toBe('nina@example.com');
    expect(
      importedClientDetail({ id: 'c', firstName: 'Lina', phone: '06 11 22 33 44', email: 'lina@example.com' }),
    ).toBe('06 11 22 33 44 · lina@example.com');
    expect(importedClientDetail({ id: 'd', firstName: 'Maya', birthday: { month: 5, day: 14 } })).toBe(
      'Anniversaire : 14 mai',
    );
    expect(
      importedClientDetail({ id: 'e', firstName: 'Léa', phone: '06 00 00 00 01', birthday: { month: 5, day: 14 } }),
    ).toBe('06 00 00 00 01');
    expect(importedClientDetail({ id: 'f', firstName: 'Zoé' })).toBeUndefined();
  });
});

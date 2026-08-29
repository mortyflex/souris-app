import { mapLegacyClient, mapLegacyClients } from '../legacy-clients-adapter';

describe('Legacy client import boundary', () => {
  it('keeps ONLY identity/contact fields from a polluted legacy record', () => {
    const legacy = {
      _id: 'abc',
      firstName: 'Léa',
      lastName: 'Martin',
      telephone: '06 12 34 56 78',
      email: 'lea@example.com',
      stats: { totalSpent: 250, ticketAverage: 83, lastVisitDate: '2020-12-22T10:59:59.854Z', visitNb: 3, lastVisitIsNoShow: false },
      notes: 'ancienne note client',
      importedVisitNotes: [{ text: 'habitude de coloration' }],
      lastVisitDate: '2020-12-22T10:59:59.854Z',
      visitNb: 3,
      ticketAverage: 83,
      totalSpent: 250,
      onlineBooking: true,
      gender: 'female',
      shopID: 'shop-1',
      shortLinkCode: 'abc123',
      pictures: ['photo.png'],
      createdAt: '2020-11-23T11:38:24.448Z',
      updatedAt: '2023-05-04T10:04:37.043Z',
      __v: 0,
      tmp: false,
    };

    const result = mapLegacyClient(legacy);

    expect(result).toEqual({
      id: 'abc',
      firstName: 'Léa',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'lea@example.com',
    });
    expect(Object.keys(result).sort()).toEqual(['email', 'firstName', 'id', 'lastName', 'phone']);
  });

  it('produces undefined for empty optional identity fields', () => {
    const result = mapLegacyClient({
      _id: 'abc',
      firstName: 'Léa',
      lastName: '',
      telephone: '   ',
      email: '',
    });

    expect(result).toEqual({ id: 'abc', firstName: 'Léa' });
  });

  it('handles fully absent optional fields', () => {
    const result = mapLegacyClient({ _id: 'abc', firstName: 'Léa' });

    expect(result).toEqual({ id: 'abc', firstName: 'Léa' });
  });

  it('trims leading/trailing whitespace on optional fields', () => {
    const result = mapLegacyClient({
      _id: 'abc',
      firstName: 'Léa',
      lastName: ' Martin ',
      telephone: ' 06 12 34 56 78 ',
      email: ' lea@example.com ',
    });

    expect(result).toEqual({
      id: 'abc',
      firstName: 'Léa',
      lastName: 'Martin',
      phone: '06 12 34 56 78',
      email: 'lea@example.com',
    });
  });

  it('maps batches without leaking legacy shape', () => {
    const results = mapLegacyClients([
      { _id: 'a', firstName: 'Alice' },
      { _id: 'b', firstName: 'Bob', lastName: 'Bricolage' },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: 'a', firstName: 'Alice' });
    expect(results[1]).toEqual({ id: 'b', firstName: 'Bob', lastName: 'Bricolage' });
  });

  it('maps the actual legacy birthdate field only as a valid civil date', () => {
    const result = mapLegacyClient({
      _id: 'abc',
      firstName: 'Léa',
      birthdate: '1994-10-12',
    });

    expect(result.birthDate).toBe('1994-10-12');
  });

  it('discards null, missing, and non-conforming legacy birthdate values', () => {
    expect(mapLegacyClient({ _id: 'a', firstName: 'Alice', birthdate: null }).birthDate).toBeUndefined();
    expect(mapLegacyClient({ _id: 'b', firstName: 'Bob' }).birthDate).toBeUndefined();
    expect(
      mapLegacyClient({ _id: 'c', firstName: 'Camille', birthdate: '12/10/1994' }).birthDate,
    ).toBeUndefined();
    expect(
      mapLegacyClient({ _id: 'd', firstName: 'Dora', birthdate: '1994-13-45' }).birthDate,
    ).toBeUndefined();
    expect(
      mapLegacyClient({ _id: 'e', firstName: 'Emma', birthdate: '' }).birthDate,
    ).toBeUndefined();
  });
});

import { normalizeLegacyClient, normalizeLegacyClients } from '../legacy-clients-adapter';

describe('normalizeLegacyClient', () => {
  it('maps _id to id', () => {
    const legacy = {
      _id: '5fbb9f1a7eaf84537de6c0c7',
      firstName: 'Clarisse',
      lastName: 'Baudry',
      telephone: '0612345678',
      email: 'clarisse@example.com',
    };

    const result = normalizeLegacyClient(legacy);

    expect(result.id).toBe('5fbb9f1a7eaf84537de6c0c7');
  });

  it('maps telephone to phone', () => {
    const legacy = {
      _id: 'abc',
      firstName: 'Alice',
      telephone: '0612345678',
    };

    const result = normalizeLegacyClient(legacy);

    expect(result.phone).toBe('0612345678');
  });

  it('converts empty telephone to undefined', () => {
    const legacy = {
      _id: 'abc',
      firstName: 'Alice',
      telephone: '',
    };

    const result = normalizeLegacyClient(legacy);

    expect(result.phone).toBeUndefined();
  });

  it('converts empty email to undefined', () => {
    const legacy = {
      _id: 'abc',
      firstName: 'Alice',
      email: '  ',
    };

    const result = normalizeLegacyClient(legacy);

    expect(result.email).toBeUndefined();
  });

  it('preserves lastName when present', () => {
    const legacy = {
      _id: 'abc',
      firstName: 'Alice',
      lastName: 'Dupont',
    };

    const result = normalizeLegacyClient(legacy);

    expect(result.lastName).toBe('Dupont');
  });

  it('excludes commercial history (stats fields)', () => {
    const legacy = {
      _id: 'abc',
      firstName: 'Alice',
      // Legacy fields that should NOT be mapped:
      onlineBooking: true,
      gender: 'female',
      shopID: 'shop-123',
      shortLinkCode: 'abc123',
      pictures: [],
      importedVisitNotes: [],
      createdAt: '2020-11-23T11:38:24.448Z',
      updatedAt: '2023-05-04T10:04:37.043Z',
      __v: 0,
      stats: {
        totalSpent: 108,
        ticketAverage: 108,
        lastVisitDate: '2020-12-22T10:59:59.854Z',
        visitNb: 1,
        lastVisitIsNoShow: false,
      },
      tmp: false,
    };

    const result = normalizeLegacyClient(legacy);

    // Only approved fields should be present
    expect(Object.keys(result).sort()).toEqual(
      ['email', 'firstName', 'id', 'lastName', 'phone'].sort(),
    );
    expect('totalSpent' in result).toBe(false);
    expect('visitNb' in result).toBe(false);
    expect('createdAt' in result).toBe(false);
  });

  it('does not invent birthDate', () => {
    const legacy = {
      _id: 'abc',
      firstName: 'Alice',
    };

    const result = normalizeLegacyClient(legacy);

    expect('birthDate' in result).toBe(false);
  });
});

describe('normalizeLegacyClients', () => {
  it('batch-normalizes an array of legacy clients', () => {
    const legacyClients = [
      { _id: 'a', firstName: 'Alice' },
      { _id: 'b', firstName: 'Bob' },
    ];

    const result = normalizeLegacyClients(legacyClients);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
  });
});

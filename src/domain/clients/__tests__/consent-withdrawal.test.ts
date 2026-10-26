// BeautIzzy — a Client edit that only withdraws the promotional SMS consent:
// the ONE edit read-only access never refuses, and nothing looser.

import { isClientSmsConsentWithdrawalOnly, type Client } from '..';

const NOW = new Date('2026-10-26T09:00:00.000Z');

const optedIn: Client = {
  id: 'client-1',
  firstName: 'Nora',
  lastName: 'Martin',
  phone: '+33612345678',
  email: 'nora@example.test',
  birthday: { month: 3, day: 14 },
  notes: 'Préfère le matin',
  smsMarketingConsent: { status: 'OPTED_IN', updatedAt: new Date('2026-10-01T09:00:00.000Z'), source: 'PROFESSIONAL' },
};

const withdrawn: Client = {
  ...optedIn,
  smsMarketingConsent: { status: 'OPTED_OUT', updatedAt: NOW, source: 'PROFESSIONAL' },
};

describe('isClientSmsConsentWithdrawalOnly', () => {
  it('a withdrawal that changes nothing else is one — from OPTED_IN, from UNKNOWN, and again from OPTED_OUT', () => {
    expect(isClientSmsConsentWithdrawalOnly(optedIn, withdrawn)).toBe(true);
    const { smsMarketingConsent: _consent, ...unknown } = optedIn;
    expect(isClientSmsConsentWithdrawalOnly(unknown, withdrawn)).toBe(true);
    expect(isClientSmsConsentWithdrawalOnly(withdrawn, withdrawn)).toBe(true);
    expect(isClientSmsConsentWithdrawalOnly(withdrawn, { ...withdrawn, smsMarketingConsent: { status: 'OPTED_OUT', updatedAt: new Date(NOW.getTime() + 1), source: 'PROFESSIONAL' } })).toBe(true);
  });

  it('the photo and the archive marker are not part of an identity edit: a withdrawal stays one whatever they read', () => {
    expect(isClientSmsConsentWithdrawalOnly({ ...optedIn, photoPath: 'biz/clients/client-1/a.jpg', archivedAt: NOW }, withdrawn)).toBe(true);
  });

  it('granting or clearing a consent is never a withdrawal', () => {
    expect(isClientSmsConsentWithdrawalOnly(withdrawn, optedIn)).toBe(false);
    const { smsMarketingConsent: _consent, ...cleared } = withdrawn;
    expect(isClientSmsConsentWithdrawalOnly(withdrawn, cleared)).toBe(false);
    expect(isClientSmsConsentWithdrawalOnly(optedIn, optedIn)).toBe(false);
  });

  it('a withdrawal bundled with any other identity change is a business edit', () => {
    for (const change of [
      { firstName: 'Nora-2' },
      { lastName: undefined },
      { lastName: 'Durand' },
      { phone: '+33699999999' },
      { phone: undefined },
      { email: 'other@example.test' },
      { notes: 'autre' },
      { notes: undefined },
      { birthday: { month: 12, day: 25 } },
      { birthday: undefined },
    ] as Partial<Client>[]) {
      expect(isClientSmsConsentWithdrawalOnly(optedIn, { ...withdrawn, ...change })).toBe(false);
    }
    expect(isClientSmsConsentWithdrawalOnly(optedIn, { ...withdrawn, id: 'client-2' })).toBe(false);
  });
});

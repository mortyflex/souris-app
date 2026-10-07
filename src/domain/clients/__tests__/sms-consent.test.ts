// BeautIzzy — Client promotional SMS consent (domain rules)

import { resolveClientSmsMarketingConsent, type ClientSmsMarketingConsent } from '../sms-consent';

const NOW = new Date('2026-09-27T10:00:00.000Z');
const EARLIER: ClientSmsMarketingConsent = {
  status: 'OPTED_IN',
  updatedAt: new Date('2026-09-01T08:00:00.000Z'),
  source: 'PROFESSIONAL',
};

describe('resolveClientSmsMarketingConsent', () => {
  it('records a first choice as a PROFESSIONAL capture at now', () => {
    expect(resolveClientSmsMarketingConsent(undefined, 'OPTED_IN', NOW)).toEqual({
      status: 'OPTED_IN',
      updatedAt: NOW,
      source: 'PROFESSIONAL',
    });
  });

  it('keeps the existing record — audit instant included — when the selection is unchanged', () => {
    expect(resolveClientSmsMarketingConsent(EARLIER, 'OPTED_IN', NOW)).toBe(EARLIER);
  });

  it('a genuine change is a fresh capture at now', () => {
    expect(resolveClientSmsMarketingConsent(EARLIER, 'OPTED_OUT', NOW)).toEqual({
      status: 'OPTED_OUT',
      updatedAt: NOW,
      source: 'PROFESSIONAL',
    });
  });

  it('clearing back to « Non renseigné » removes the record entirely', () => {
    expect(resolveClientSmsMarketingConsent(EARLIER, undefined, NOW)).toBeUndefined();
    expect(resolveClientSmsMarketingConsent(undefined, undefined, NOW)).toBeUndefined();
  });
});

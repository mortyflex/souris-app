import { describeBookingPublication, formFieldOfServerField } from '../presentation';
import { publicPagePath, resolvePublicPageUrl } from '../public-page-url';

describe('booking publication status', () => {
  it('is a draft while unpublished, whatever the server would allow', () => {
    expect(describeBookingPublication({ published: false, publicationOpen: true, plusAccess: true }).kind).toBe('DRAFT');
    expect(describeBookingPublication({ published: false, publicationOpen: false, plusAccess: false }).label).toBe('Brouillon');
  });

  it('is online only when published, publication open AND Plus verified', () => {
    expect(describeBookingPublication({ published: true, publicationOpen: true, plusAccess: true })).toMatchObject({
      kind: 'ONLINE',
      label: 'En ligne',
    });
  });

  it('is offline when the subscription lapsed or publication closed', () => {
    const lapsed = describeBookingPublication({ published: true, publicationOpen: true, plusAccess: false });
    expect(lapsed.kind).toBe('OFFLINE');
    expect(lapsed.message).toMatch(/BeautIzzy Plus/);
    expect(describeBookingPublication({ published: true, publicationOpen: false, plusAccess: true }).kind).toBe('OFFLINE');
  });

  it('points a server refusal at its form field', () => {
    expect(formFieldOfServerField('public_email')).toBe('publicEmail');
    expect(formFieldOfServerField('logo_path')).toBeUndefined();
    expect(formFieldOfServerField(undefined)).toBeUndefined();
  });
});

describe('public page address', () => {
  it('builds the URL from a configured origin', () => {
    expect(resolvePublicPageUrl('https://example.test', 'chez-amelie')).toBe('https://example.test/r/chez-amelie');
    expect(resolvePublicPageUrl(' https://example.test/ ', 'chez-amelie')).toBe('https://example.test/r/chez-amelie');
    expect(resolvePublicPageUrl('http://localhost:3000', 'abc')).toBe('http://localhost:3000/r/abc');
  });

  it('never invents a domain', () => {
    expect(resolvePublicPageUrl(undefined, 'chez-amelie')).toBeUndefined();
    expect(resolvePublicPageUrl('', 'chez-amelie')).toBeUndefined();
    expect(resolvePublicPageUrl('example.test', 'chez-amelie')).toBeUndefined();
    expect(resolvePublicPageUrl('https://example.test/path', 'chez-amelie')).toBeUndefined();
    expect(publicPagePath('chez-amelie')).toBe('/r/chez-amelie');
  });
});

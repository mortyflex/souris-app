import { describeBookingLink, describeBookingPublication, formFieldOfServerField } from '../presentation';
import { publicPagePath, resolvePublicPageLink } from '../public-page-url';

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
    expect(resolvePublicPageLink('https://example.test', 'chez-amelie')?.url).toBe('https://example.test/r/chez-amelie');
    expect(resolvePublicPageLink(' https://example.test/ ', 'chez-amelie')?.url).toBe('https://example.test/r/chez-amelie');
    expect(resolvePublicPageLink('http://localhost:3000', 'abc')?.url).toBe('http://localhost:3000/r/abc');
  });

  it('never invents a domain', () => {
    expect(resolvePublicPageLink(undefined, 'chez-amelie')).toBeUndefined();
    expect(resolvePublicPageLink('', 'chez-amelie')).toBeUndefined();
    expect(resolvePublicPageLink('example.test', 'chez-amelie')).toBeUndefined();
    expect(resolvePublicPageLink('https://example.test/path', 'chez-amelie')).toBeUndefined();
    expect(resolvePublicPageLink('https://user@beautizzy.fr', 'chez-amelie')).toBeUndefined();
    expect(publicPagePath('chez-amelie')).toBe('/r/chez-amelie');
  });

  it('is public only on the production website over https', () => {
    expect(resolvePublicPageLink('https://beautizzy.fr', 'chez-amelie')).toEqual({
      url: 'https://beautizzy.fr/r/chez-amelie',
      audience: 'PUBLIC',
    });
    expect(resolvePublicPageLink('https://www.BeautIzzy.fr/', 'abc')?.audience).toBe('PUBLIC');
  });

  it.each([
    'http://localhost:3000',
    'http://192.168.1.20:3000',
    'https://staging.beautizzy.fr',
    'https://beautizzy-web.vercel.app',
    'http://beautizzy.fr',
    'https://beautizzy.fr:8443',
    'https://beautizzy.fr.example.test',
  ])('treats %s as a test address', (origin) => {
    expect(resolvePublicPageLink(origin, 'abc')?.audience).toBe('TEST');
  });
});

describe('booking link under the address field', () => {
  const publicLink = { url: 'https://beautizzy.fr/r/maison-lea', audience: 'PUBLIC' } as const;
  const testLink = { url: 'http://localhost:3000/r/maison-lea', audience: 'TEST' } as const;
  const online = { typedSlug: 'maison-lea', storedSlug: 'maison-lea', publication: 'ONLINE' } as const;

  it('offers the public link of an online page for sharing', () => {
    expect(describeBookingLink({ ...online, link: publicLink })).toEqual({
      address: 'https://beautizzy.fr/r/maison-lea',
      audience: 'PUBLIC',
      audienceLabel: 'Lien public',
      message: 'Partagez ce lien avec vos clients.',
      copyable: true,
    });
  });

  it('keeps a test link copyable but never presents it as shareable', () => {
    const link = describeBookingLink({ ...online, link: testLink });
    expect(link).toMatchObject({ address: testLink.url, audienceLabel: 'Lien de test', copyable: true });
    expect(link.message).toMatch(/Ne la partagez pas avec vos clients/);
  });

  it('explains why the link of a draft or an offline page cannot be copied', () => {
    const draft = describeBookingLink({ ...online, publication: 'DRAFT', link: publicLink });
    expect(draft).toMatchObject({ address: publicLink.url, copyable: false });
    expect(draft.message).toMatch(/publiez votre page/);

    const offline = describeBookingLink({ ...online, publication: 'OFFLINE', link: publicLink });
    expect(offline.copyable).toBe(false);
    expect(offline.message).toMatch(/hors ligne/);
  });

  it('never offers an address the server does not hold yet', () => {
    const edited = describeBookingLink({ ...online, typedSlug: 'nouvelle-adresse', link: publicLink });
    expect(edited.copyable).toBe(false);
    expect(edited.message).toMatch(/Enregistrez vos modifications/);
    expect(describeBookingLink({ ...online, storedSlug: undefined, link: publicLink }).copyable).toBe(false);
  });

  it('shows the path alone, and no link, without a configured website', () => {
    expect(describeBookingLink({ ...online, link: undefined })).toMatchObject({
      address: '/r/maison-lea',
      audienceLabel: undefined,
      copyable: false,
    });
  });

  it('shows only the format hint without an address', () => {
    expect(describeBookingLink({ ...online, typedSlug: '', link: undefined })).toMatchObject({
      address: undefined,
      message: 'Lettres minuscules, chiffres et tirets.',
      copyable: false,
    });
  });
});

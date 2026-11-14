// BeautIzzy — the public address of a booking page
//
// The website origin is build-time public configuration
// (EXPO_PUBLIC_WEB_URL, referenced literally so Metro inlines it). While it
// is not configured the app shows the path of the page only and offers no
// link: it never invents a domain.
//
// Only the production website is an address clients can open. Every other
// origin — a development server, a LAN address, a Staging or preview
// deployment — is a TEST address: shown and usable by the person testing,
// never presented as shareable.

/** The hosts of the production website; anything else is a test origin. */
const PRODUCTION_WEB_HOSTS: readonly string[] = ['beautizzy.fr', 'www.beautizzy.fr'];

export type PublicPageAudience = 'PUBLIC' | 'TEST';

export interface PublicPageLink {
  readonly url: string;
  /** PUBLIC only for the production website over https. */
  readonly audience: PublicPageAudience;
}

/** Pure, exported for tests: the link of `slug` on `origin`, or undefined without a usable origin. */
export function resolvePublicPageLink(origin: string | undefined, slug: string): PublicPageLink | undefined {
  const trimmed = origin?.trim().replace(/\/+$/, '') ?? '';
  const match = /^(https?):\/\/([^\s/:@]+)(:\d+)?$/i.exec(trimmed);
  if (match === null) return undefined;
  const isProduction =
    match[1].toLowerCase() === 'https' &&
    match[3] === undefined &&
    PRODUCTION_WEB_HOSTS.includes(match[2].toLowerCase());
  return { url: `${trimmed}/r/${slug}`, audience: isProduction ? 'PUBLIC' : 'TEST' };
}

export function publicPagePath(slug: string): string {
  return `/r/${slug}`;
}

export function readPublicPageLink(slug: string): PublicPageLink | undefined {
  return resolvePublicPageLink(process.env.EXPO_PUBLIC_WEB_URL, slug);
}

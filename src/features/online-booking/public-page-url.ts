// BeautIzzy — the public address of a booking page
//
// The website origin is build-time public configuration
// (EXPO_PUBLIC_WEB_URL, referenced literally so Metro inlines it). While it
// is not configured — no public domain exists yet — the app shows the path
// of the page only and offers no link: it never invents a domain.

/** Pure, exported for tests: `https://site/r/<slug>`, or undefined without a usable origin. */
export function resolvePublicPageUrl(origin: string | undefined, slug: string): string | undefined {
  const trimmed = origin?.trim().replace(/\/+$/, '') ?? '';
  if (!/^https?:\/\/[^\s/]+$/i.test(trimmed)) return undefined;
  return `${trimmed}/r/${slug}`;
}

export function publicPagePath(slug: string): string {
  return `/r/${slug}`;
}

export function readPublicPageUrl(slug: string): string | undefined {
  return resolvePublicPageUrl(process.env.EXPO_PUBLIC_WEB_URL, slug);
}

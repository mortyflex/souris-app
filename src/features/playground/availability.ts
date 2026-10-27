// BeautIzzy — Playground availability (development ONLY) — pure
//
// THE rule deciding whether the developer Playground exists in a running
// application. It is checked by every surface that leads to or renders it —
// the Discovery entry, the (auth) route guard, each Playground route — and it
// FAILS CLOSED: whatever is unknown or unexpected makes it unavailable.
//
//   debug      a development bundle (`__DEV__`): a release or TestFlight build
//              never passes, whatever its variant, flags or environment;
//   staging    the inlined Supabase URL points at the STAGING project
//              (supabase/README.md): the Production project, an unconfigured
//              environment or a URL of another shape are refused — nothing
//              about a professional's account is ever near a preview.
//
// Both conditions are build-time facts (Metro inlines `process.env.EXPO_PUBLIC_*`
// and `__DEV__`), so the availability of a bundle never changes at runtime.
// Nothing here reads a key value or logs anything.

/** The Supabase project ref of Staging — a public URL component, never a key. */
export const STAGING_SUPABASE_PROJECT_REF = 'iteufklnrsmazzvmzqxa';

export interface PlaygroundBuild {
  /** `__DEV__`: a development bundle. */
  readonly debug: boolean;
  /** The inlined `EXPO_PUBLIC_SUPABASE_URL`, as written. */
  readonly supabaseUrl: string | undefined;
}

export type PlaygroundUnavailableReason =
  /** A release bundle (TestFlight, App Store, Play Store, any `--no-dev` bundle). */
  | 'release-build'
  /** No Supabase URL is configured: the environment is unknown. */
  | 'supabase-unconfigured'
  /** The Supabase URL does not point at the Staging project. */
  | 'supabase-not-staging';

export type PlaygroundAvailability =
  | { readonly kind: 'available' }
  | { readonly kind: 'unavailable'; readonly reason: PlaygroundUnavailableReason };

/** The project ref of a Supabase project URL (`https://<ref>.supabase.co`), or undefined for anything else. */
export function resolveSupabaseProjectRef(url: string | undefined): string | undefined {
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co$/i.exec(url?.trim() ?? '');
  return match?.[1]?.toLowerCase();
}

/** Pure, so the rule is verified without touching `__DEV__` or `process.env`. */
export function resolvePlaygroundAvailability(build: PlaygroundBuild): PlaygroundAvailability {
  if (!build.debug) return { kind: 'unavailable', reason: 'release-build' };
  const ref = resolveSupabaseProjectRef(build.supabaseUrl);
  if (ref === undefined) return { kind: 'unavailable', reason: 'supabase-unconfigured' };
  if (ref !== STAGING_SUPABASE_PROJECT_REF) return { kind: 'unavailable', reason: 'supabase-not-staging' };
  return { kind: 'available' };
}

/** The availability of THIS bundle. The URL is referenced literally so Expo inlines it; only its project ref is compared. */
export function readPlaygroundAvailability(): PlaygroundAvailability {
  return resolvePlaygroundAvailability({ debug: __DEV__, supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL });
}

/** The one question every Playground surface asks. */
export function isPlaygroundAvailable(): boolean {
  return readPlaygroundAvailability().kind === 'available';
}

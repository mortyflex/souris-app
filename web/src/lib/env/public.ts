/**
 * Public environment contract: values that may ship in the browser bundle.
 *
 * Only `NEXT_PUBLIC_*` variables belong here. Each one is read with a literal
 * `process.env.NEXT_PUBLIC_…` expression so that Next.js can inline it.
 * The browser never talks to Supabase: the project URL is used by server code
 * and to build the public URLs of branding images.
 */

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const publicEnv = {
  /** Canonical origin of the website, without a trailing slash. */
  siteUrl: optional(process.env.NEXT_PUBLIC_SITE_URL),
  /** Contact address shown on the marketing pages. Absent: no contact link is rendered. */
  contactEmail: optional(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
  /** Supabase project URL (public): the server lookups and the public image URLs. */
  supabaseUrl: optional(process.env.NEXT_PUBLIC_SUPABASE_URL),
  /** Supabase PUBLISHABLE key (public). Unused: no browser code calls Supabase yet. */
  supabasePublishableKey: optional(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
} as const;

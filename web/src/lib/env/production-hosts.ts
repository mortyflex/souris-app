/**
 * The production website, recognised from its CONFIGURED canonical origin
 * (`NEXT_PUBLIC_SITE_URL`, set per deployment environment) — never from a
 * request's Host or forwarded headers, which a client controls.
 *
 * Dependency-free on purpose: `next.config.ts` imports it (the X-Robots-Tag of
 * every non-production deployment), as do the application's server modules
 * through `production-site.ts`.
 */

/** The only hosts of the production website. Anything else — Staging, a preview, local development — is not. */
export const PRODUCTION_HOSTS: readonly string[] = ["beautizzy.fr", "www.beautizzy.fr"];

/** Whether a configured site URL is the production website. An absent or unreadable URL is not. */
export function isProductionSiteUrl(siteUrl: string | undefined): boolean {
  if (siteUrl === undefined || siteUrl.trim() === "") return false;
  try {
    return PRODUCTION_HOSTS.includes(new URL(siteUrl.trim()).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** The response header that keeps every non-production deployment out of search engines. */
export const NOINDEX_HEADER = { key: "X-Robots-Tag", value: "noindex, nofollow" } as const;

/**
 * Whether a deployment may be indexed by search engines: the production
 * website — and, on Vercel, only its Production environment. A Preview (or a
 * Vercel development build) given the production origin by mistake still stays
 * out of search engines. `VERCEL_ENV` is set by Vercel itself, never by a
 * request; off Vercel (unset), the configured origin alone decides.
 */
export function isIndexableDeployment(siteUrl: string | undefined, vercelEnv: string | undefined): boolean {
  if (!isProductionSiteUrl(siteUrl)) return false;
  const environment = vercelEnv?.trim() ?? "";
  return environment === "" || environment === "production";
}

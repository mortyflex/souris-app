import { publicEnv } from "./public";

/** The production website. Development and Staging switches are ignored there, whatever they say. */
const PRODUCTION_HOSTS: readonly string[] = ["beautizzy.fr", "www.beautizzy.fr"];

/**
 * Whether this deployment is the production website, read from its canonical
 * origin (`NEXT_PUBLIC_SITE_URL`). An absent or unreadable origin is not the
 * production website.
 */
export function isProductionWebsite(siteUrl: string | undefined = publicEnv.siteUrl): boolean {
  if (siteUrl === undefined) return false;
  try {
    return PRODUCTION_HOSTS.includes(new URL(siteUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

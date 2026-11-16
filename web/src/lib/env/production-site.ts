import { isProductionSiteUrl } from "./production-hosts";
import { publicEnv } from "./public";

/**
 * Whether this deployment is the production website, read from its canonical
 * origin (`NEXT_PUBLIC_SITE_URL`). An absent or unreadable origin is not the
 * production website. Development and Staging switches are ignored there,
 * whatever they say; and only there may search engines index the site.
 */
export function isProductionWebsite(siteUrl: string | undefined = publicEnv.siteUrl): boolean {
  return isProductionSiteUrl(siteUrl);
}

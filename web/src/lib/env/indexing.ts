import type { Metadata, MetadataRoute } from "next";

import { isIndexableDeployment } from "./production-hosts";
import { publicEnv } from "./public";

/**
 * Search-engine indexing — ONE rule: only the production website, in its
 * Vercel Production environment, may be indexed (`isIndexableDeployment`).
 * Staging, every preview and local development answer « noindex »
 * three times over: robots.txt (`robotsRules`), the robots meta of every page
 * (`siteRobots`) and the X-Robots-Tag header of every response
 * (`next.config.ts`, from the same host rule).
 *
 * The public booking pages (/r/…) keep their own noindex on every deployment
 * until online booking is public (`src/app/r/[slug]/layout.tsx`).
 */

/** The robots meta of the whole site: nothing outside production. */
export function siteRobots(siteUrl: string | undefined = publicEnv.siteUrl, vercelEnv: string | undefined = process.env.VERCEL_ENV): Metadata["robots"] {
  return isIndexableDeployment(siteUrl, vercelEnv) ? undefined : { index: false, follow: false };
}

/** robots.txt: production lets crawlers in (not the API); every other deployment shuts them out. */
export function robotsRules(siteUrl: string | undefined = publicEnv.siteUrl, vercelEnv: string | undefined = process.env.VERCEL_ENV): MetadataRoute.Robots {
  if (!isIndexableDeployment(siteUrl, vercelEnv)) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" } };
}

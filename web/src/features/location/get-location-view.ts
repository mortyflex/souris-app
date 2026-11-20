import "server-only";

import { headers } from "next/headers";

import { buildLocationView, type LocationView } from "./location-view";
import { mapSnapshotUrl } from "./map-snapshot";
import type { PublicLocation } from "./public-location";

/**
 * The location view of THIS request: the published location, the visitor's
 * probable maps application (from the request's own headers — nothing is asked
 * of the visitor, and never a position), and the signed map URL when this
 * deployment can make one.
 *
 * Server-only: it reads the request and signs with a secret key. A page that
 * publishes no location never reaches the headers nor the key.
 */
export async function getLocationView(location: PublicLocation | undefined): Promise<LocationView | undefined> {
  if (location === undefined) return undefined;
  let userAgent: string | null = null;
  let platformHint: string | null = null;
  try {
    const requestHeaders = await headers();
    userAgent = requestHeaders.get("user-agent");
    platformHint = requestHeaders.get("sec-ch-ua-platform");
  } catch {
    // Outside a request there is no visitor to read: the universal default applies.
  }
  return buildLocationView(location, { userAgent, platformHint, mapUrl: mapSnapshotUrl });
}

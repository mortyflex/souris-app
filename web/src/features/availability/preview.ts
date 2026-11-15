import "server-only";

import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";

/** The production website: the preview never shows there, whatever the switch says. */
const PRODUCTION_HOSTS: readonly string[] = ["beautizzy.fr", "www.beautizzy.fr"];

function isProductionSite(siteUrl: string | undefined): boolean {
  if (siteUrl === undefined) return false;
  try {
    return PRODUCTION_HOSTS.includes(new URL(siteUrl).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Whether /r/<slug>/reserver shows the read-only availability preview.
 *
 * Online booking cannot be completed yet, so slots are never shown to the
 * public: only a development or Staging deployment that sets
 * `ONLINE_BOOKING_AVAILABILITY_PREVIEW=enabled` shows them, labelled as a
 * preview, with nothing to book. The production website never does, even if
 * the switch were set there by mistake.
 */
export function isAvailabilityPreviewEnabled(): boolean {
  return serverEnv.availabilityPreviewSwitch() && !isProductionSite(publicEnv.siteUrl);
}

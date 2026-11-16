import "server-only";

import { isProductionWebsite } from "@/lib/env/production-site";
import { serverEnv } from "@/lib/env/server";

/**
 * Whether /r/<slug>/reserver shows the read-only availability preview.
 *
 * Slots are never shown to the public as a preview: only a development or
 * Staging deployment that sets `ONLINE_BOOKING_AVAILABILITY_PREVIEW=enabled`
 * shows them, labelled as a preview, with nothing to book. The production
 * website never does, even if the switch were set there by mistake. When the
 * booking flow itself is open (`isBookingFlowEnabled`), it takes precedence.
 */
export function isAvailabilityPreviewEnabled(): boolean {
  return serverEnv.availabilityPreviewSwitch() && !isProductionWebsite();
}

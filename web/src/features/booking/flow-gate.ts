import "server-only";

import { isProductionWebsite } from "@/lib/env/production-site";
import { serverEnv } from "@/lib/env/server";

/**
 * Whether this deployment offers the public booking flow: /r/<slug>/reserver
 * and its endpoints under /api/booking/<slug>.
 *
 * The deployment gate of ONLINE_BOOKING.md §9.9 — development and Staging
 * only for now: `ONLINE_BOOKING_WEB_BOOKING=enabled`, never honoured on the
 * production website. It only opens the website's side: whether a booking can
 * actually be created stays the database's decision (the operator switch
 * `ONLINE_BOOKING_CREATION`, publication, `booking_enabled`, Plus access).
 */
export function isBookingFlowEnabled(): boolean {
  return serverEnv.bookingFlowSwitch() && !isProductionWebsite();
}

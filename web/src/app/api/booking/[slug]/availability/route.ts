import { availabilityToWire, isCivilDate, isServiceId } from "@/features/availability/availability";
import { getAvailability } from "@/features/availability/get-availability";
import { isBookingFlowEnabled } from "@/features/booking/flow-gate";
import { noStoreJson } from "@/features/booking/json-response";
import { clientNetwork, isCrossSiteRequest, takeRequestQuota } from "@/features/booking/request-protection";
import { isValidProfileSlug } from "@/features/public-profile/slug";

const ALLOWED_PARAMS = new Set(["service", "date"]);

/**
 * GET /api/booking/<slug>/availability?service=<id>&date=<YYYY-MM-DD>
 *
 * The start times of one service on one local date — read through the ONE
 * availability function, never cached, rate-limited (fail closed). A start
 * shown is never held: creation decides again under the Business lock.
 *
 *   200  { status: "OK", availability } (the server's own form)
 *        { status: "UNAVAILABLE" } — the page does not accept bookings
 *   400  REJECTED (malformed query)  403  REJECTED (cross-site)
 *   404  REJECTED (no booking flow)  429  RATE_LIMITED
 *   502  ERROR                       503  PROTECTION_UNAVAILABLE
 */
export async function GET(request: Request, context: RouteContext<"/api/booking/[slug]/availability">): Promise<Response> {
  if (!isBookingFlowEnabled()) return noStoreJson({ status: "REJECTED" }, 404);
  const { slug } = await context.params;
  if (!isValidProfileSlug(slug)) return noStoreJson({ status: "REJECTED" }, 404);
  if (isCrossSiteRequest(request)) return noStoreJson({ status: "REJECTED" }, 403);

  const params = new URL(request.url).searchParams;
  const service = params.get("service");
  const date = params.get("date");
  const malformed =
    [...params.keys()].some((key) => !ALLOWED_PARAMS.has(key)) ||
    params.getAll("service").length > 1 ||
    params.getAll("date").length > 1 ||
    (service !== null && !isServiceId(service)) ||
    (date !== null && !isCivilDate(date));
  if (malformed) return noStoreJson({ status: "REJECTED" }, 400);

  const quota = await takeRequestQuota("availability", { network: clientNetwork(request), page: slug });
  if (quota === "LIMITED") return noStoreJson({ status: "RATE_LIMITED" }, 429, { "Retry-After": "600" });
  if (quota === "UNAVAILABLE") return noStoreJson({ status: "PROTECTION_UNAVAILABLE" }, 503);

  try {
    const availability = await getAvailability(slug, {
      ...(service !== null ? { serviceId: service } : {}),
      ...(date !== null ? { date } : {}),
    });
    if (availability === null) return noStoreJson({ status: "UNAVAILABLE" }, 200);
    return noStoreJson({ status: "OK", availability: availabilityToWire(availability) }, 200);
  } catch {
    console.error("booking: availability lookup failed");
    return noStoreJson({ status: "ERROR" }, 502);
  }
}

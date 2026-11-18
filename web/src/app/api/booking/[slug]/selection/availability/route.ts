import { isCivilDate } from "@/features/availability/availability";
import { getSelectionAvailability } from "@/features/availability/get-selection-availability";
import { selectionAvailabilityToWire, selectionIssue } from "@/features/availability/selection";
import { isBookingFlowEnabled } from "@/features/booking/flow-gate";
import { noStoreJson } from "@/features/booking/json-response";
import { clientNetwork, isCrossSiteRequest, takeRequestQuota } from "@/features/booking/request-protection";
import { isValidProfileSlug } from "@/features/public-profile/slug";

const ALLOWED_PARAMS = new Set(["service", "date"]);

/**
 * GET /api/booking/<slug>/selection/availability?service=<id>&service=<id>…&date=<YYYY-MM-DD>
 *
 * The start times of an ordered selection of 1 to 8 distinct services — the
 * `service` parameters in the customer's order — on one local date, read
 * through the ONE multi-service availability function, never cached,
 * rate-limited with the availability counters (fail closed). A start shown is
 * never held: creation decides again under the Business lock.
 *
 *   200  { status: "OK", availability } (the server's own form: INVALID_SELECTION,
 *        UNKNOWN_SERVICE, SELECTION_TOO_LONG, DOES_NOT_FIT, CHOOSE_DATE,
 *        OUT_OF_WINDOW or SLOTS, each with the server's selection and fingerprint)
 *        { status: "UNAVAILABLE" } — the page does not accept bookings, or the
 *        database has no multi-service function
 *   400  REJECTED (malformed query)  403  REJECTED (cross-site)
 *   404  REJECTED (no booking flow)  429  RATE_LIMITED
 *   502  ERROR                       503  PROTECTION_UNAVAILABLE
 */
export async function GET(request: Request, context: RouteContext<"/api/booking/[slug]/selection/availability">): Promise<Response> {
  if (!isBookingFlowEnabled()) return noStoreJson({ status: "REJECTED" }, 404);
  const { slug } = await context.params;
  if (!isValidProfileSlug(slug)) return noStoreJson({ status: "REJECTED" }, 404);
  if (isCrossSiteRequest(request)) return noStoreJson({ status: "REJECTED" }, 403);

  const params = new URL(request.url).searchParams;
  const services = params.getAll("service");
  const date = params.get("date");
  const malformed =
    [...params.keys()].some((key) => !ALLOWED_PARAMS.has(key)) ||
    params.getAll("date").length > 1 ||
    selectionIssue(services) !== undefined ||
    (date !== null && !isCivilDate(date));
  if (malformed) return noStoreJson({ status: "REJECTED" }, 400);

  const quota = await takeRequestQuota("availability", { network: clientNetwork(request), page: slug });
  if (quota === "LIMITED") return noStoreJson({ status: "RATE_LIMITED" }, 429, { "Retry-After": "600" });
  if (quota === "UNAVAILABLE") return noStoreJson({ status: "PROTECTION_UNAVAILABLE" }, 503);

  try {
    const result = await getSelectionAvailability(slug, services, date);
    if (result.status === "UNSUPPORTED") {
      console.error("booking: the multi-service availability function is missing (migration not applied)");
      return noStoreJson({ status: "UNAVAILABLE" }, 200);
    }
    if (result.status === "UNAVAILABLE") return noStoreJson({ status: "UNAVAILABLE" }, 200);
    return noStoreJson({ status: "OK", availability: selectionAvailabilityToWire(result.availability) }, 200);
  } catch {
    console.error("booking: selection availability lookup failed");
    return noStoreJson({ status: "ERROR" }, 502);
  }
}

import { toResponseWire, type BookingResponse } from "@/features/booking/booking-answer";
import { parseRequestWire } from "@/features/booking/booking-request";
import { createBooking } from "@/features/booking/create-booking";
import { isBookingFlowEnabled } from "@/features/booking/flow-gate";
import { noStoreJson } from "@/features/booking/json-response";
import {
  clientNetwork,
  isJsonRequest,
  isSameOriginPost,
  MAX_BOOKING_BODY_BYTES,
  readBoundedBody,
  takeRequestQuota,
} from "@/features/booking/request-protection";
import { verifyChallenge } from "@/features/booking/turnstile";
import { isValidProfileSlug } from "@/features/public-profile/slug";

const reply = (response: BookingResponse, status: number, headers?: Record<string, string>) =>
  noStoreJson(toResponseWire(response), status, headers);
const REJECTED: BookingResponse = { status: "REJECTED" };

/**
 * POST /api/booking/<slug> — creates ONE booking.
 *
 * Body (JSON, at most 2 KB, exactly these keys): service_id, starts_at,
 * first_name, last_name, email, phone, idempotency_key. Header
 * `X-Turnstile-Token`: a single-use Cloudflare Turnstile token — never part
 * of the body, so a retry re-sends the same body under the same key with a
 * NEW token.
 *
 * In order, each step refusing BEFORE the next one runs: the deployment gate,
 * the slug shape, the origin, the content type, the body size, the request
 * shape and its fields, then the bot challenge (Cloudflare Siteverify, fail
 * closed), then the request limits (in the database, fail closed) — and only
 * then the booking engine. A request without a verified token touches no
 * counter. Nothing the customer typed is ever logged; an internal error is
 * never described.
 *
 *   200  the engine's answer: BOOKED, SLOT_UNAVAILABLE, UNKNOWN_SERVICE,
 *        INVALID_REQUEST + field, BUSY, IDEMPOTENCY_KEY_REUSED, UNAVAILABLE
 *   400  REJECTED (not a booking request) or INVALID_REQUEST + field
 *   403  REJECTED (another origin) or CHALLENGE_FAILED (no valid token:
 *        missing, invalid, expired or already used — get a new one)
 *   404  REJECTED (no booking flow here)
 *   413  REJECTED (too large)        415  REJECTED (not JSON)
 *   429  RATE_LIMITED                503  PROTECTION_UNAVAILABLE
 *   502  ERROR — outcome unknown: retry with the SAME key
 *
 * Worst case 3 s (challenge) + 5 s (limits) + 10 s (engine) = 18 s, inside
 * the browser's 20 s.
 */
export async function POST(request: Request, context: RouteContext<"/api/booking/[slug]">): Promise<Response> {
  if (!isBookingFlowEnabled()) return reply(REJECTED, 404);
  const { slug } = await context.params;
  if (!isValidProfileSlug(slug)) return reply(REJECTED, 404);
  if (!isSameOriginPost(request)) return reply(REJECTED, 403);
  if (!isJsonRequest(request)) return reply(REJECTED, 415);

  const body = await readBoundedBody(request, MAX_BOOKING_BODY_BYTES);
  if (!body.ok) return reply(REJECTED, body.reason === "TOO_LARGE" ? 413 : 400);
  let data: unknown;
  try {
    data = JSON.parse(body.text);
  } catch {
    return reply(REJECTED, 400);
  }
  const parsed = parseRequestWire(data);
  if (!parsed.ok) {
    return parsed.malformed ? reply(REJECTED, 400) : reply({ status: "INVALID_REQUEST", field: parsed.field }, 400);
  }

  const challenge = await verifyChallenge(request);
  if (challenge === "FAILED") return reply({ status: "CHALLENGE_FAILED" }, 403);
  if (challenge === "UNAVAILABLE") return reply({ status: "PROTECTION_UNAVAILABLE" }, 503);

  const quota = await takeRequestQuota("booking", {
    network: clientNetwork(request),
    page: slug,
    email: parsed.request.email,
  });
  if (quota === "LIMITED") return reply({ status: "RATE_LIMITED" }, 429, { "Retry-After": "600" });
  if (quota === "UNAVAILABLE") return reply({ status: "PROTECTION_UNAVAILABLE" }, 503);

  const answer = await createBooking(slug, parsed.request, parsed.idempotencyKey);
  return reply(answer, answer.status === "ERROR" ? 502 : 200);
}

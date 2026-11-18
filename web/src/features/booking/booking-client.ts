/**
 * The browser's side of the booking endpoints. It talks to the WEBSITE only
 * (/api/booking/<slug>…) — never to Supabase, never with a key.
 *
 * Pure of React; `fetch` is injectable for tests.
 */

import { parseAvailability, type Availability } from "@/features/availability/availability";
import { parseSelectionAvailability, type SelectionAvailability } from "@/features/availability/selection";

import { parseResponseWire, type BookingResponse } from "./booking-answer";
import { toRequestWire, type BookingRequest } from "./booking-request";
import { CHALLENGE_HEADER } from "./challenge";
import { toSelectionRequestWire, type SelectionBookingRequest } from "./selection-request";

type Fetch = typeof fetch;

/**
 * Longer than the server's worst case — challenge 3 s + request limits 5 s +
 * engine 10 s — so the server answers first.
 */
export const BOOKING_REQUEST_TIMEOUT_MS = 20_000;

/**
 * An idempotency key: 32 hexadecimal digits from the platform's
 * cryptographic generator. `getRandomValues` exists outside secure contexts
 * too (a phone reaching a development server over the local network), where
 * `randomUUID` does not.
 */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bookingEndpoint(slug: string): string {
  return `/api/booking/${encodeURIComponent(slug)}`;
}

/**
 * Sends ONE booking request and reads the answer. Never rejects:
 *
 *   * an answer the website gave — its status, whatever the HTTP code;
 *   * a 4xx without a readable answer — REJECTED: the request never reached
 *     the website's handler, so nothing was booked by it;
 *   * anything else — network failure, timeout, 5xx, unreadable 2xx — ERROR:
 *     the outcome is UNKNOWN and only the same key can tell.
 *
 * The bot-challenge token travels in its own header, never in the body: it is
 * single-use, so every send — a retry too — carries a new one, while the body
 * and its key stay the same.
 */
export async function submitBooking(
  slug: string,
  request: BookingRequest,
  idempotencyKey: string,
  challengeToken: string,
  options: SubmitOptions = {},
): Promise<BookingResponse> {
  return postBooking(bookingEndpoint(slug), toRequestWire(request, idempotencyKey), challengeToken, options);
}

/** The selection booking endpoint: ONE appointment for an ordered selection (`selection/route.ts`). */
export function selectionBookingEndpoint(slug: string): string {
  return `${bookingEndpoint(slug)}/selection`;
}

/**
 * Sends ONE selection booking request — the ids in her order, the start, the
 * server's fingerprint, the contact and the key — and reads the answer, with
 * exactly the rules of `submitBooking` (never rejects; unknown = ERROR).
 */
export async function submitSelectionBooking(
  slug: string,
  request: SelectionBookingRequest,
  idempotencyKey: string,
  challengeToken: string,
  options: SubmitOptions = {},
): Promise<BookingResponse> {
  return postBooking(selectionBookingEndpoint(slug), toSelectionRequestWire(request, idempotencyKey), challengeToken, options);
}

interface SubmitOptions {
  readonly fetchImpl?: Fetch;
  readonly timeoutMs?: number;
}

async function postBooking(
  url: string,
  body: object,
  challengeToken: string,
  { fetchImpl = fetch, timeoutMs = BOOKING_REQUEST_TIMEOUT_MS }: SubmitOptions,
): Promise<BookingResponse> {
  // A plain timer, not AbortSignal.timeout(): older mobile browsers lack it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let parsed: BookingResponse | undefined;
  try {
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", [CHALLENGE_HEADER]: challengeToken },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
    } catch {
      return { status: "ERROR" };
    }
    try {
      parsed = parseResponseWire(await response.json());
    } catch {
      parsed = undefined;
    }
  } finally {
    clearTimeout(timer);
  }
  if (parsed !== undefined) return parsed;
  const refusedAtTheDoor = response.status >= 400 && response.status < 500 && response.status !== 408;
  return refusedAtTheDoor ? { status: "REJECTED" } : { status: "ERROR" };
}

export type AvailabilityResult<T = Availability> =
  | { readonly status: "OK"; readonly availability: T }
  | { readonly status: "UNAVAILABLE" }
  | { readonly status: "RATE_LIMITED" }
  | { readonly status: "ERROR" }
  /** A newer read was started meanwhile: this answer is out of date and must be ignored. */
  | { readonly status: "STALE" };

const AVAILABILITY_TIMEOUT_MS = 15_000;

export interface AvailabilityQueryInput {
  readonly serviceId?: string;
  readonly date?: string;
}

/**
 * Reads availabilities for ONE screen: every new read cancels the previous
 * one, and an answer that arrives after a newer read started is reported as
 * STALE — a slow answer for a date she already left never replaces the
 * times of the date she is looking at.
 */
export function createAvailabilityReader(slug: string, fetchImpl: Fetch = fetch) {
  return createReader<AvailabilityQueryInput, Availability>(
    (query) => {
      const params = new URLSearchParams();
      if (query.serviceId !== undefined) params.set("service", query.serviceId);
      if (query.date !== undefined) params.set("date", query.date);
      const search = params.toString();
      return `${bookingEndpoint(slug)}/availability${search ? `?${search}` : ""}`;
    },
    parseAvailability,
    fetchImpl,
  );
}

export interface SelectionQueryInput {
  /** In the customer's order: the order is part of the question. */
  readonly serviceIds: readonly string[];
  readonly date?: string;
}

/** The selection availability endpoint, the ids as repeated `service` parameters in her order. */
export function selectionAvailabilityUrl(slug: string, query: SelectionQueryInput): string {
  const params = new URLSearchParams();
  for (const id of query.serviceIds) params.append("service", id);
  if (query.date !== undefined) params.set("date", query.date);
  return `${bookingEndpoint(slug)}/selection/availability?${params.toString()}`;
}

/** Reads the availability of a selection with the rules of `createAvailabilityReader` (one screen, newest wins). */
export function createSelectionAvailabilityReader(slug: string, fetchImpl: Fetch = fetch) {
  return createReader<SelectionQueryInput, SelectionAvailability>(
    (query) => selectionAvailabilityUrl(slug, query),
    parseSelectionAvailability,
    fetchImpl,
  );
}

function createReader<Q, T>(urlOf: (query: Q) => string, parse: (data: unknown) => T | undefined, fetchImpl: Fetch) {
  let generation = 0;
  let inFlight: AbortController | undefined;

  return {
    async read(query: Q): Promise<AvailabilityResult<T>> {
      generation += 1;
      const mine = generation;
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;

      // Plain timer, not AbortSignal.any()/timeout(): older mobile browsers lack them.
      const timer = setTimeout(() => controller.abort(), AVAILABILITY_TIMEOUT_MS);
      let result: AvailabilityResult<T>;
      try {
        const response = await fetchImpl(urlOf(query), {
          headers: { Accept: "application/json" },
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const data: unknown = await response.json();
        result = readAvailabilityAnswer(data, parse);
      } catch {
        result = { status: "ERROR" };
      } finally {
        clearTimeout(timer);
      }
      return mine === generation ? result : { status: "STALE" };
    },
    cancel() {
      generation += 1;
      inFlight?.abort();
    },
  };
}

function readAvailabilityAnswer<T>(data: unknown, parse: (data: unknown) => T | undefined): AvailabilityResult<T> {
  if (typeof data !== "object" || data === null) return { status: "ERROR" };
  const record = data as Record<string, unknown>;
  if (record.status === "UNAVAILABLE") return { status: "UNAVAILABLE" };
  if (record.status === "RATE_LIMITED") return { status: "RATE_LIMITED" };
  if (record.status !== "OK") return { status: "ERROR" };
  const availability = parse(record.availability);
  return availability === undefined ? { status: "ERROR" } : { status: "OK", availability };
}

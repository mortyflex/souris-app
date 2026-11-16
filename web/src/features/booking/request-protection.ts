import "server-only";

import { createHmac } from "node:crypto";

import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";

import { callBookingRpc } from "./supabase-rpc";

/**
 * The door of the public booking endpoints — everything checked BEFORE the
 * booking engine is called:
 *
 *   1. same origin: a POST must carry this site's Origin, and a browser that
 *      says the request is cross-site is refused (no form on another site can
 *      book in a visitor's name);
 *   2. JSON only, and a bounded body (read with a hard byte limit, whatever
 *      Content-Length claims);
 *   3. request limits, counted in the DATABASE — the one store every server
 *      instance shares, so the limit holds across serverless instances. An
 *      in-memory counter would hold per instance only and is not used.
 *
 * The limits (fixed windows):
 *
 *   availability   per network          120 / 10 min
 *   booking        per network           10 / 10 min, 40 / 24 h
 *                  per customer email     6 / 24 h
 *                  per page (slug)       30 / 10 min
 *
 * Two kinds of counter, taken in two steps. The client's OWN counters
 * (network, email) come first, and a refused request counts on them too, so
 * a refused client cannot probe its way back in. The page's SHARED counter
 * comes second, and only for a request the client's own limits allowed: one
 * client, however often it is refused, adds at most its own allowance to the
 * page (10 of its 30), never locking the page's other customers out.
 *
 * A network is the client's IPv4 address or its IPv6 /64, read from the
 * platform's forwarding headers (Vercel overwrites them; a self-hosted proxy
 * must too). The per-email and per-page limits still bound a client that
 * rotates addresses. Every identifier is turned into an HMAC with a
 * server-only secret before it leaves this module: the database never stores
 * an IP address, an email or a slug.
 *
 * FAIL CLOSED: without the secret, without the database function
 * (`online_booking_take_request_quota`, migration 20261019120000), or when it
 * cannot answer, the request is refused — booking creation never runs
 * unprotected.
 */

export const REQUEST_LIMITS = {
  availability: [{ scope: "availability:network", per: "network", limit: 120, windowSeconds: 600 }],
  booking: [
    { scope: "booking:network:10m", per: "network", limit: 10, windowSeconds: 600 },
    { scope: "booking:network:1d", per: "network", limit: 40, windowSeconds: 86_400 },
    { scope: "booking:email:1d", per: "email", limit: 6, windowSeconds: 86_400 },
    { scope: "booking:page:10m", per: "page", limit: 30, windowSeconds: 600 },
  ],
} as const;

export type ProtectedAction = keyof typeof REQUEST_LIMITS;

export interface RequestIdentity {
  readonly network: string;
  readonly page: string;
  /** Booking only: the customer's email, as typed (compared lowercased). */
  readonly email?: string;
}

export type QuotaDecision = "ALLOWED" | "LIMITED" | "UNAVAILABLE";

/** Largest accepted booking body. A legitimate request is about 300 bytes. */
export const MAX_BOOKING_BODY_BYTES = 2048;
/** For the whole quota, both steps together. */
const QUOTA_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// 1. Origin
// ---------------------------------------------------------------------------
function originOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

/** A browser told us the request comes from another site. */
export function isCrossSiteRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

/**
 * A state-changing request from this very site: an Origin header equal to the
 * origin the request was addressed to, or to the canonical site origin.
 */
export function isSameOriginPost(request: Request): boolean {
  if (isCrossSiteRequest(request)) return false;
  const origin = request.headers.get("origin");
  if (origin === null || origin === "null") return false;
  return origin === originOf(request.url) || origin === originOf(publicEnv.siteUrl);
}

// ---------------------------------------------------------------------------
// 2. Body
// ---------------------------------------------------------------------------
export function isJsonRequest(request: Request): boolean {
  const type = request.headers.get("content-type");
  return type !== null && /^application\/json\s*(;\s*charset=utf-8\s*)?$/i.test(type.trim());
}

export type BoundedBody =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: "TOO_LARGE" | "UNREADABLE" };

/** The body as UTF-8 text, never more than `maxBytes` read — whatever Content-Length says. */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<BoundedBody> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    return { ok: false, reason: "TOO_LARGE" };
  }
  if (request.body === null) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "UNREADABLE" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "UNREADABLE" };
  }
}

// ---------------------------------------------------------------------------
// 3. Limits
// ---------------------------------------------------------------------------
/** IPv4 as is; IPv6 reduced to its /64 (one subscriber's network); anything else as given. */
export function networkOf(address: string): string {
  const value = address.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) return mapped[1];
  if (!value.includes(":")) return value.length > 0 ? value : "unknown";

  const [head, tail] = value.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail ? tail.split(":") : [];
  const groups =
    tail === undefined
      ? headGroups
      : [...headGroups, ...Array<string>(Math.max(0, 8 - headGroups.length - tailGroups.length)).fill("0"), ...tailGroups];
  if (groups.length < 4 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return value;
  return `${groups
    .slice(0, 4)
    .map((group) => group.padStart(4, "0"))
    .join(":")}::/64`;
}

/** The client's network, from the platform's forwarding headers. */
export function clientNetwork(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return networkOf(real || forwarded || "unknown");
}

function counterKey(secret: string, scope: string, windowSeconds: number, identifier: string): string {
  return createHmac("sha256", secret).update(`${scope}\n${windowSeconds}\n${identifier}`).digest("hex");
}

function identifierOf(per: "network" | "email" | "page", identity: RequestIdentity): string | undefined {
  if (per === "network") return identity.network;
  if (per === "page") return identity.page;
  return identity.email?.trim().toLowerCase();
}

interface Counter {
  readonly key: string;
  readonly limit: number;
  readonly window_seconds: number;
}

/**
 * ONE database call: increments every counter given (one transaction) and
 * answers whether all of them are still within their limit.
 */
async function takeCounters(counters: readonly Counter[], deadline: number): Promise<QuotaDecision> {
  const timeoutMs = deadline - Date.now();
  if (timeoutMs <= 0) {
    console.error("booking: request protection unavailable (timeout)");
    return "UNAVAILABLE";
  }
  const result = await callBookingRpc("online_booking_take_request_quota", { p_counters: counters }, timeoutMs);
  if (result.ok && result.data === true) return "ALLOWED";
  if (result.ok && result.data === false) return "LIMITED";
  // The status only — never a body, an identifier or a key.
  console.error(`booking: request protection unavailable (${result.ok ? "unexpected answer" : `HTTP ${result.status ?? "none"}`})`);
  return "UNAVAILABLE";
}

/**
 * Takes this request's quota for an action: the client's own counters, then
 * — only when they allow it — the page's shared counter. ALLOWED only when
 * the database answered that every counter is within its limit; LIMITED as
 * soon as one step refuses (the next step is not taken). Every other case —
 * missing or invalid secret, missing function, network failure, unexpected
 * answer, the time budget spent — is UNAVAILABLE, and the caller refuses the
 * request.
 */
export async function takeRequestQuota(action: ProtectedAction, identity: RequestIdentity): Promise<QuotaDecision> {
  let secret: string;
  try {
    secret = serverEnv.requestLimitSecret();
  } catch {
    console.error("booking: request protection unavailable (secret not configured)");
    return "UNAVAILABLE";
  }

  const own: Counter[] = [];
  const shared: Counter[] = [];
  for (const rule of REQUEST_LIMITS[action]) {
    const identifier = identifierOf(rule.per, identity);
    // A limit that cannot be keyed is a request that cannot be protected.
    if (identifier === undefined || identifier.length === 0) return "UNAVAILABLE";
    (rule.per === "page" ? shared : own).push({
      key: counterKey(secret, rule.scope, rule.windowSeconds, identifier),
      limit: rule.limit,
      window_seconds: rule.windowSeconds,
    });
  }

  const deadline = Date.now() + QUOTA_TIMEOUT_MS;
  for (const step of [own, shared]) {
    if (step.length === 0) continue;
    const decision = await takeCounters(step, deadline);
    if (decision !== "ALLOWED") return decision;
  }
  return "ALLOWED";
}

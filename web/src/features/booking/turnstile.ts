import "server-only";

import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";

import { CHALLENGE_ACTION, CHALLENGE_HEADER, isChallengeTokenShape } from "./challenge";

/**
 * The server's side of the bot challenge (Cloudflare Turnstile): every
 * booking request carries a single-use token, checked here with Cloudflare
 * Siteverify BEFORE the request limits and the booking engine.
 *
 *   PASSED       Cloudflare accepted the token, for THIS widget's action, on
 *                THIS site's configured host
 *   FAILED       no token, a malformed one, or one Cloudflare refused —
 *                invalid, expired or already used (`timeout-or-duplicate`)
 *   UNAVAILABLE  the check cannot be made: not configured, Cloudflare
 *                unreachable, slow (3 s), or answering something unexpected.
 *                FAIL CLOSED: no booking without a verified token.
 *
 * The expected host is the CONFIGURED site origin (`NEXT_PUBLIC_SITE_URL`),
 * never one a request claims. Cloudflare's published TEST keys pass without a
 * real challenge: they are honoured only when both the configured origin and
 * the request's own host are local — never on a hosted deployment.
 *
 * The secret, the token and the customer's details never appear in a log or
 * an answer; a refusal is logged by Cloudflare's error code only.
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
/** Siteverify's share of one booking request: 3 s + request limits 5 s + engine 10 s = 18 s, inside the browser's 20 s. */
export const SITEVERIFY_TIMEOUT_MS = 3_000;

export type ChallengeDecision = "PASSED" | "FAILED" | "UNAVAILABLE";

/** Cloudflare's test keys: `1x00000000000000000000AA`, `2x0000000000000000000000000000000AA`, `3x00000000000000000000FF`… */
const TEST_KEY = /^[1-3]x0+[A-F]{2}$/;
const KEY_SHAPE = /^[A-Za-z0-9_-]{10,200}$/;

/** Errors of the CHECK itself (our configuration or Cloudflare): the token was not judged. */
const CHECK_ERRORS = new Set(["missing-input-secret", "invalid-input-secret", "bad-request", "internal-error"]);
/** Errors of the TOKEN: absent, invalid, expired or already used. */
const TOKEN_ERRORS = new Set(["missing-input-response", "invalid-input-response", "timeout-or-duplicate"]);

function hostnameOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.length > 0 ? hostname : undefined;
  } catch {
    return undefined;
  }
}

/** Loopback, `*.localhost`, a private IPv4 network (a phone on the developer's Wi-Fi, the Android emulator's 10.0.2.2). */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4 === null) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export type ChallengeSetup =
  | { readonly ok: true; readonly siteKey: string; readonly secretKey: string; readonly testing: boolean; readonly siteHostname: string }
  | {
      readonly ok: false;
      readonly reason: "not configured" | "malformed key" | "test and real keys mixed" | "no site origin" | "test keys on a hosted site";
    };

/** This deployment's widget, or why it cannot be used. Never throws; never returns a key in a reason. */
export function challengeSetup(): ChallengeSetup {
  const siteKey = serverEnv.turnstileSiteKey();
  const secretKey = serverEnv.turnstileSecretKey();
  if (siteKey === undefined || secretKey === undefined) return { ok: false, reason: "not configured" };
  if (!KEY_SHAPE.test(siteKey) || !KEY_SHAPE.test(secretKey)) return { ok: false, reason: "malformed key" };
  const testing = TEST_KEY.test(siteKey);
  if (testing !== TEST_KEY.test(secretKey)) return { ok: false, reason: "test and real keys mixed" };
  const siteHostname = hostnameOf(publicEnv.siteUrl);
  if (siteHostname === undefined) return { ok: false, reason: "no site origin" };
  if (testing && !isLocalHostname(siteHostname)) return { ok: false, reason: "test keys on a hosted site" };
  return { ok: true, siteKey, secretKey, testing, siteHostname };
}

/** The site key the booking page may render, or `undefined`: the page must not offer booking (fail closed). */
export function challengeSiteKey(): string | undefined {
  const setup = challengeSetup();
  if (setup.ok) return setup.siteKey;
  console.error(`booking: challenge unavailable (${setup.reason})`);
  return undefined;
}

/** The client's address as the platform reports it, for Cloudflare's own checks — or nothing. */
function clientAddress(request: Request): string | undefined {
  const real = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = real || forwarded;
  return address !== undefined && /^[0-9A-Fa-f:.]{2,45}$/.test(address) ? address : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Cloudflare's error codes we know, and only those: nothing else from an answer is ever logged. */
function knownCodes(outcome: Record<string, unknown>): string[] {
  const codes = outcome["error-codes"];
  if (!Array.isArray(codes)) return [];
  return codes.filter((code): code is string => typeof code === "string" && (CHECK_ERRORS.has(code) || TOKEN_ERRORS.has(code)));
}

function judge(outcome: unknown, setup: Extract<ChallengeSetup, { ok: true }>): ChallengeDecision {
  if (!isRecord(outcome) || typeof outcome.success !== "boolean") {
    console.error("booking: challenge unavailable (unexpected answer)");
    return "UNAVAILABLE";
  }
  if (!outcome.success) {
    const codes = knownCodes(outcome);
    if (codes.some((code) => CHECK_ERRORS.has(code))) {
      console.error(`booking: challenge unavailable (${codes.join(", ")})`);
      return "UNAVAILABLE";
    }
    console.warn(`booking: challenge refused (${codes.length > 0 ? codes.join(", ") : "no reason"})`);
    return "FAILED";
  }
  // Cloudflare's test answers carry no real action nor host — test keys run locally only.
  if (setup.testing) return "PASSED";
  if (outcome.action !== CHALLENGE_ACTION) {
    console.warn("booking: challenge refused (another action)");
    return "FAILED";
  }
  if (typeof outcome.hostname !== "string" || outcome.hostname.toLowerCase() !== setup.siteHostname) {
    console.warn("booking: challenge refused (another host)");
    return "FAILED";
  }
  return "PASSED";
}

/** Verifies the request's challenge token. Never throws. */
export async function verifyChallenge(request: Request): Promise<ChallengeDecision> {
  const setup = challengeSetup();
  if (!setup.ok) {
    console.error(`booking: challenge unavailable (${setup.reason})`);
    return "UNAVAILABLE";
  }
  if (setup.testing && !isLocalHostname(hostnameOf(request.url) ?? "")) {
    console.error("booking: challenge unavailable (test keys on a hosted site)");
    return "UNAVAILABLE";
  }

  const token = request.headers.get(CHALLENGE_HEADER);
  // No token, or not one: refused without asking Cloudflare.
  if (!isChallengeTokenShape(token)) return "FAILED";

  const form = new URLSearchParams({ secret: setup.secretKey, response: token });
  const address = clientAddress(request);
  if (address !== undefined) form.set("remoteip", address);

  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
  } catch {
    console.error("booking: challenge unavailable (no answer from Cloudflare)");
    return "UNAVAILABLE";
  }
  let outcome: unknown;
  try {
    outcome = await response.json();
  } catch {
    outcome = undefined;
  }
  if (!response.ok) {
    // Cloudflare answers some refusals (a refused secret…) with a 4xx and its usual body: judge
    // the reason it gives — never a success.
    if (isRecord(outcome) && outcome.success === false) return judge(outcome, setup);
    console.error(`booking: challenge unavailable (HTTP ${response.status})`);
    return "UNAVAILABLE";
  }
  if (outcome === undefined) {
    console.error("booking: challenge unavailable (unreadable answer)");
    return "UNAVAILABLE";
  }
  return judge(outcome, setup);
}

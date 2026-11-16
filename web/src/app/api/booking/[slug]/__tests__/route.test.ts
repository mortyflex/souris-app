import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE = "https://ref.supabase.co";
const SECRET = "sb_secret_test_value";
const LIMIT_SECRET = "test-request-limit-secret-0123456789abcdef";
const SITE = "http://localhost:3000";
const KEY = "0123456789abcdef0123456789abcdef";
/** A widget's keys in Cloudflare's real format (NOT Cloudflare's test keys). */
const TURNSTILE_SITE_KEY = "0x4AAAAAAAsiteKeyOfTheTests";
const TURNSTILE_SECRET = "0x4AAAAAAAsecretKeyOfTheTests00000";
const TOKEN = "0.turnstile-token-of-the-tests";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY = "siteverify";
/** Cloudflare's answer for a token solved on this site, for this widget's action. */
const verified = {
  success: true,
  "error-codes": [],
  challenge_ts: "2026-11-16T12:00:00.000Z",
  hostname: "localhost",
  action: "booking",
  cdata: "",
};

const request = {
  service_id: "svc-coupe",
  starts_at: "2026-11-16T13:00:00Z",
  first_name: "  Marie ",
  last_name: "Dupont",
  email: "marie.dupont@example.test",
  phone: "06 12 34 56 78",
  idempotency_key: KEY,
};

const booked = {
  status: "BOOKED",
  booking: {
    reference: "4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21",
    service: { id: "svc-coupe", name: "Coupe", duration_minutes: 45 },
    starts_at: "2026-11-16T13:00:00Z",
    ends_at: "2026-11-16T13:45:00Z",
    local_date: "2026-11-16",
    local_time: "14:00",
    time_zone: "Europe/Paris",
  },
};

/** A JSON answer, or: no answer at all, a timeout, a 200 that is not JSON. */
type Answer = { status: number; body: unknown } | "network" | "timeout" | "unreadable";
interface Counter {
  key: string;
  limit: number;
  window_seconds: number;
}
interface Fake {
  /** Cloudflare Siteverify: an answer, or one decided from the form it received. */
  challenge: Answer | ((form: Record<string, string>) => Answer);
  /** An answer, or one decided from the counters of the call. */
  quota: Answer | ((counters: Counter[]) => Answer | Promise<Answer>);
  booking: Answer;
  calls: { fn: string; body: Record<string, unknown>; headers: Record<string, string>; init: RequestInit }[];
}

const QUOTA = "online_booking_take_request_quota";
const BOOK = "online_booking_create_booking";

function answerWith(answer: Answer): Response {
  if (answer === "network") throw new TypeError("fetch failed");
  if (answer === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  if (answer === "unreadable") return new Response("<html>gateway</html>", { status: 200, headers: { "Content-Type": "text/html" } });
  return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
}

/** Supabase (the two booking functions) and Cloudflare Siteverify — every outside call of the route. */
function fakeSupabase(fake: Fake) {
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url === SITEVERIFY) {
      const form = Object.fromEntries(new URLSearchParams(String(init.body)));
      fake.calls.push({ fn: VERIFY, body: form, headers: {}, init });
      return answerWith(typeof fake.challenge === "function" ? fake.challenge(form) : fake.challenge);
    }
    const fn = url.replace(`${SUPABASE}/rest/v1/rpc/`, "");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    fake.calls.push({ fn, body, headers: init.headers as Record<string, string>, init });
    const answer =
      fn === QUOTA
        ? typeof fake.quota === "function"
          ? await fake.quota(body.p_counters as Counter[])
          : fake.quota
        : fn === BOOK
          ? fake.booking
          : undefined;
    if (answer === undefined) throw new Error(`unexpected call ${fn}`);
    return answerWith(answer);
  });
}

/** A booking request from this site, with a challenge token unless the headers say otherwise. */
function post(body: unknown, headers: Record<string, string> = {}, slug = "chez-amelie") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${SITE}/api/booking/${slug}`, {
    method: "POST",
    headers: {
      origin: SITE,
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "x-turnstile-token": TOKEN,
      ...headers,
    },
    body: text,
  });
}

/** The same request without its challenge token. */
async function withoutToken(request: Request): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.delete("x-turnstile-token");
  return new Request(request.url, { method: "POST", headers, body: await request.text() });
}

const context = (slug = "chez-amelie") => ({ params: Promise.resolve({ slug }) });

async function load() {
  vi.resetModules();
  return import("../route");
}

let fake: Fake;
let logs: string[];

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "enabled");
  vi.stubEnv("ONLINE_BOOKING_REQUEST_LIMIT_SECRET", LIMIT_SECRET);
  vi.stubEnv("TURNSTILE_SITE_KEY", TURNSTILE_SITE_KEY);
  vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_SECRET);
  fake = {
    challenge: { status: 200, body: verified },
    quota: { status: 200, body: true },
    booking: { status: 200, body: booked },
    calls: [],
  };
  vi.stubGlobal("fetch", fakeSupabase(fake));
  logs = [];
  for (const level of ["error", "warn", "log", "info"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fns = () => fake.calls.map((call) => call.fn);
const countersOf = (call: Fake["calls"][number]) => call.body.p_counters as Counter[];
/** Each quota call, as the limit / window of each counter it takes. */
const quotaSteps = () =>
  fake.calls.filter((call) => call.fn === QUOTA).map((call) => countersOf(call).map((c) => `${c.limit}/${c.window_seconds}`));
const OWN_STEP = ["10/600", "40/86400", "6/86400"];
const PAGE_STEP = ["30/600"];
const isPageCounter = (c: Counter) => c.limit === 30 && c.window_seconds === 600;
const isPageStep = (counters: Counter[]) => counters.some(isPageCounter);
/** The key of the page's counter, in whichever quota call took it. */
const pageKeys = () =>
  fake.calls.filter((call) => call.fn === QUOTA).flatMap((call) => countersOf(call).filter(isPageCounter).map((c) => c.key));

describe("POST /api/booking/[slug] — success through the server boundary", () => {
  it("verifies the challenge, takes the client's own quota, then the page's, then books with exactly the permitted fields", async () => {
    const { POST } = await load();
    const response = await POST(post(request), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(booked);
    expect(fns()).toEqual([VERIFY, QUOTA, QUOTA, BOOK]);
    expect(quotaSteps()).toEqual([OWN_STEP, PAGE_STEP]);

    const bookingCall = fake.calls[3];
    expect(bookingCall.body).toEqual({
      p_slug: "chez-amelie",
      p_service_id: "svc-coupe",
      p_starts_at: "2026-11-16T13:00:00Z",
      p_first_name: "Marie",
      p_last_name: "Dupont",
      p_email: "marie.dupont@example.test",
      p_phone: "06 12 34 56 78",
      p_idempotency_key: KEY,
    });
    expect(bookingCall.headers.apikey).toBe(SECRET);
  });

  it("keys the request limits by opaque HMACs: no address, email or slug leaves the server", async () => {
    const { POST } = await load();
    await POST(post(request), context());

    const quotaCalls = fake.calls.filter((call) => call.fn === QUOTA);
    const counters = quotaCalls.flatMap(countersOf);
    expect(counters).toHaveLength(4);
    for (const counter of counters) expect(counter.key).toMatch(/^[0-9a-f]{64}$/);
    const sent = JSON.stringify(quotaCalls.map((call) => call.body));
    for (const secretOrPersonal of ["203.0.113.7", "marie", "example.test", "chez-amelie", LIMIT_SECRET]) {
      expect(sent).not.toContain(secretOrPersonal);
    }
  });

  it("never logs, nor answers, the customer's details or a secret", async () => {
    fake.booking = { status: 500, body: { message: "internal detail with marie.dupont@example.test" } };
    const { POST } = await load();
    const response = await POST(post(request), context());
    const text = await response.text();

    for (const value of [SECRET, LIMIT_SECRET, TURNSTILE_SECRET, TOKEN, "marie", "Dupont", "06 12 34 56 78", "internal detail"]) {
      expect(text).not.toContain(value);
      expect(logs.join("\n")).not.toContain(value);
    }
  });
});

describe("POST /api/booking/[slug] — every engine answer", () => {
  it.each([
    [{ status: "SLOT_UNAVAILABLE" }],
    [{ status: "UNKNOWN_SERVICE" }],
    [{ status: "BUSY" }],
    [{ status: "IDEMPOTENCY_KEY_REUSED" }],
    [{ status: "INVALID_REQUEST", field: "phone" }],
  ])("forwards %j as is", async (answer) => {
    fake.booking = { status: 200, body: answer };
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(answer);
  });

  it("answers UNAVAILABLE when the engine answers NULL (creation switch off, page paused…)", async () => {
    fake.booking = { status: 200, body: null };
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
  });

  it.each<[string, Answer]>([
    ["a server error", { status: 500, body: { message: "boom" } }],
    ["a network failure", "network"],
    ["an answer it does not understand", { status: 200, body: { status: "BOOKED", booking: { reference: "x" } } }],
    ["an unknown status", { status: 200, body: { status: "CONFIRMED" } }],
  ])("answers ERROR (outcome unknown, retry with the same key) on %s", async (_label, answer) => {
    fake.booking = answer;
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ status: "ERROR" });
  });
});

describe("POST /api/booking/[slug] — refused before the engine", () => {
  const refusals: [string, () => Request, number, unknown][] = [
    ["a form post (not JSON)", () => post("a=b", { "content-type": "application/x-www-form-urlencoded" }), 415, { status: "REJECTED" }],
    ["another origin", () => post(request, { origin: "https://evil.example" }), 403, { status: "REJECTED" }],
    ["no origin", () => {
      const r = post(request);
      const headers = new Headers(r.headers);
      headers.delete("origin");
      return new Request(r.url, { method: "POST", headers, body: JSON.stringify(request) });
    }, 403, { status: "REJECTED" }],
    ["a cross-site fetch", () => post(request, { "sec-fetch-site": "cross-site" }), 403, { status: "REJECTED" }],
    ["a declared oversize body", () => post(request, { "content-length": "4096" }), 413, { status: "REJECTED" }],
    ["an oversize body", () => post({ ...request, first_name: "M".repeat(5000) }), 413, { status: "REJECTED" }],
    ["invalid JSON", () => post("{not json"), 400, { status: "REJECTED" }],
    ["an array", () => post([request]), 400, { status: "REJECTED" }],
    ["an extra key", () => post({ ...request, business_id: "x" }), 400, { status: "REJECTED" }],
    ["a missing key", () => post({ ...request, phone: undefined }), 400, { status: "REJECTED" }],
    ["a number instead of a string", () => post({ ...request, phone: 612345678 }), 400, { status: "REJECTED" }],
    ["a blank first name", () => post({ ...request, first_name: "   " }), 400, { status: "INVALID_REQUEST", field: "first_name" }],
    ["a first name of a no-break space", () => post({ ...request, first_name: String.fromCharCode(0xa0) }), 400, { status: "INVALID_REQUEST", field: "first_name" }],
    ["a malformed email", () => post({ ...request, email: "marie@example" }), 400, { status: "INVALID_REQUEST", field: "email" }],
    ["an unreadable phone", () => post({ ...request, phone: "06 12 AB 56 78" }), 400, { status: "INVALID_REQUEST", field: "phone" }],
    ["a short key", () => post({ ...request, idempotency_key: "short" }), 400, { status: "INVALID_REQUEST", field: "idempotency_key" }],
    ["a local time instead of an instant", () => post({ ...request, starts_at: "2026-11-16T14:00:00+01:00" }), 400, { status: "INVALID_REQUEST", field: "starts_at" }],
    ["a service id with spaces", () => post({ ...request, service_id: "svc coupe" }), 400, { status: "INVALID_REQUEST", field: "service_id" }],
  ];

  it.each(refusals)("refuses %s, and calls nothing", async (_label, make, status, body) => {
    const { POST } = await load();
    const response = await POST(make(), context());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(fake.calls).toEqual([]);
  });

  it.each(refusals)("answers %s the same way without a challenge token — validation first, nothing asked of Cloudflare", async (_label, make, status, body) => {
    const { POST } = await load();
    const response = await POST(await withoutToken(make()), context());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(fake.calls).toEqual([]);
  });

  it("is a 404 when this deployment offers no booking flow, and calls nothing", async () => {
    vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "");
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(404);
    expect(fake.calls).toEqual([]);
  });

  it("is a 404 on the production website even with the switch set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://beautizzy.fr");
    const { POST } = await load();
    const response = await POST(post(request, { origin: "https://beautizzy.fr" }), context());
    expect(response.status).toBe(404);
    expect(fake.calls).toEqual([]);
  });

  it("is a 404 for a malformed slug", async () => {
    const { POST } = await load();
    const response = await POST(post(request, {}, "Bad_Slug"), context("Bad_Slug"));
    expect(response.status).toBe(404);
    expect(fake.calls).toEqual([]);
  });
});

describe("POST /api/booking/[slug] — abuse protection", () => {
  it("rejects a request over its own limits BEFORE the booking engine — and before the page's shared counter", async () => {
    fake.quota = { status: 200, body: false };
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(await response.json()).toEqual({ status: "RATE_LIMITED" });
    expect(fns()).toEqual([VERIFY, QUOTA]);
    expect(quotaSteps()).toEqual([OWN_STEP]);
  });

  it("rejects a request the page's limit refuses, after the client's own limits allowed it: no booking", async () => {
    fake.quota = (counters) => ({ status: 200, body: !isPageStep(counters) });
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(await response.json()).toEqual({ status: "RATE_LIMITED" });
    expect(fns()).toEqual([VERIFY, QUOTA, QUOTA]);
    expect(quotaSteps()).toEqual([OWN_STEP, PAGE_STEP]);
  });

  const failures: [string, Answer][] = [
    ["the counter function is missing (migration not applied)", { status: 404, body: { code: "PGRST202" } }],
    ["the counter function fails", { status: 500, body: {} }],
    ["the database cannot be reached", "network"],
    ["an unexpected answer", { status: 200, body: "yes" }],
  ];

  it.each(failures)("fails CLOSED when %s: no booking, and the page's counter is not taken", async (_label, answer) => {
    fake.quota = answer;
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fns()).toEqual([VERIFY, QUOTA]);
  });

  it.each(failures)("fails CLOSED when, at the page's step, %s: no booking", async (_label, answer) => {
    fake.quota = (counters) => (isPageStep(counters) ? answer : { status: 200, body: true });
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fns()).toEqual([VERIFY, QUOTA, QUOTA]);
  });

  it("keeps ONE time budget of 5 seconds for both quota steps, after 3 seconds at most for the challenge", async () => {
    let clock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    fake.quota = (counters) => {
      if (!isPageStep(counters)) clock += 3_000;
      return { status: 200, body: true };
    };
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(200);
    // Siteverify 3 s, then the quota's 5 s shared by its two steps — 18 s at most with the engine's 10 s.
    expect(timeouts.mock.calls.slice(0, 3)).toEqual([[3_000], [5_000], [2_000]]);
  });

  it("fails CLOSED, without the page's step, when the first step spent the whole budget", async () => {
    let clock = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    fake.quota = () => {
      clock += 5_000;
      return { status: 200, body: true };
    };
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fns()).toEqual([VERIFY, QUOTA]);
    expect(logs).toContain("booking: request protection unavailable (timeout)");
  });

  it.each([
    ["missing", ""],
    ["too short", "short-secret"],
  ])("fails CLOSED when the HMAC secret is %s: nothing reaches the database", async (_label, value) => {
    vi.stubEnv("ONLINE_BOOKING_REQUEST_LIMIT_SECRET", value);
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fns()).toEqual([VERIFY]);
  });

  it("counts the same customer under the same keys, and another customer under another email key", async () => {
    const { POST } = await load();
    await POST(post(request), context());
    await POST(post({ ...request, idempotency_key: "fedcba9876543210fedcba9876543210" }), context());
    await POST(post({ ...request, email: "zoe@example.test", idempotency_key: "aaaabbbbccccddddaaaabbbbccccdddd" }), context());
    const quotaCalls = fake.calls.filter((call) => call.fn === QUOTA);
    expect(quotaCalls).toHaveLength(6);
    // Two steps per request: its own counters, then the page's.
    const keys = [0, 2, 4].map((i) => [...countersOf(quotaCalls[i]), ...countersOf(quotaCalls[i + 1])].map((c) => c.key));
    expect(keys[1]).toEqual(keys[0]);
    // Same network and page, another email: only the email counter differs.
    expect(keys[2].filter((key) => !keys[0].includes(key))).toHaveLength(1);
  });

  it("shares the page's counter between every customer of a page, and only of that page", async () => {
    const { POST } = await load();
    await POST(post(request), context());
    await POST(post({ ...request, email: "zoe@example.test" }, { "x-forwarded-for": "198.51.100.20" }), context());
    await POST(post(request, {}, "autre-salon"), context("autre-salon"));
    const keys = pageKeys();
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});

describe("POST /api/booking/[slug] — the bot challenge (Cloudflare Turnstile)", () => {
  const verifyCalls = () => fake.calls.filter((call) => call.fn === VERIFY);
  const refused = (codes: string[]): Answer => ({ status: 200, body: { success: false, "error-codes": codes } });

  it("asks Cloudflare Siteverify with the secret, the token and the client's address — uncached, within 3 seconds", async () => {
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const { POST } = await load();
    await POST(post(request), context());
    const [call] = verifyCalls();
    expect(call.body).toEqual({ secret: TURNSTILE_SECRET, response: TOKEN, remoteip: "203.0.113.7" });
    expect(call.init.method).toBe("POST");
    expect(call.init.cache).toBe("no-store");
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
    expect(timeouts.mock.calls[0]).toEqual([3_000]);
  });

  it("refuses a request without a token: 403 CHALLENGE_FAILED — no Cloudflare, no counter, no engine", async () => {
    const { POST } = await load();
    const response = await POST(await withoutToken(post(request)), context());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "CHALLENGE_FAILED" });
    expect(fake.calls).toEqual([]);
  });

  it.each([
    ["an empty token", ""],
    ["a token longer than Cloudflare's 2048 characters", "x".repeat(2049)],
    ["a token with a space", "0.abc def"],
  ])("refuses %s without asking Cloudflare", async (_label, token) => {
    const { POST } = await load();
    const response = await POST(post(request, { "x-turnstile-token": token }), context());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "CHALLENGE_FAILED" });
    expect(fake.calls).toEqual([]);
  });

  it.each<[string, Answer]>([
    ["an invalid token", refused(["invalid-input-response"])],
    ["an expired or already used token", refused(["timeout-or-duplicate"])],
    ["a token Cloudflare did not receive", refused(["missing-input-response"])],
    ["a refusal without a reason", { status: 200, body: { success: false } }],
    ["a token of another widget action", { status: 200, body: { ...verified, action: "contact" } }],
    ["a token solved on another host", { status: 200, body: { ...verified, hostname: "evil.example" } }],
    ["an answer without a host", { status: 200, body: { ...verified, hostname: undefined } }],
    ["a token refused with an HTTP 400", { status: 400, body: { success: false, "error-codes": ["invalid-input-response"] } }],
  ])("refuses %s: 403 CHALLENGE_FAILED, no counter, no engine", async (_label, answer) => {
    fake.challenge = answer;
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "CHALLENGE_FAILED" });
    expect(fns()).toEqual([VERIFY]);
  });

  it.each<[string, Answer]>([
    ["Cloudflare cannot be reached", "network"],
    ["Cloudflare does not answer within 3 seconds", "timeout"],
    ["Cloudflare answers a server error", { status: 500, body: {} }],
    ["Cloudflare answers something unreadable", "unreadable"],
    ["Cloudflare answers an unexpected shape", { status: 200, body: { success: "yes" } }],
    ["the secret is refused", refused(["invalid-input-secret"])],
    ["the secret is refused with an HTTP 400 (as Cloudflare does)", { status: 400, body: { success: false, "error-codes": ["invalid-input-secret"] } }],
    ["a SUCCESS claimed with an HTTP error", { status: 400, body: verified }],
    ["Cloudflare reports an internal error", refused(["internal-error"])],
  ])("fails CLOSED when %s: 503 PROTECTION_UNAVAILABLE, no counter, no engine", async (_label, answer) => {
    fake.challenge = answer;
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fns()).toEqual([VERIFY]);
  });

  it.each<[string, Record<string, string>]>([
    ["no site key", { TURNSTILE_SITE_KEY: "" }],
    ["no secret", { TURNSTILE_SECRET_KEY: "" }],
    ["a malformed secret", { TURNSTILE_SECRET_KEY: "not a key!" }],
    ["a test site key with a real secret", { TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }],
    ["no configured site origin", { NEXT_PUBLIC_SITE_URL: "" }],
  ])("fails CLOSED without a usable configuration (%s): nothing is called", async (_label, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fake.calls).toEqual([]);
  });

  describe("Cloudflare's test keys", () => {
    const TEST_SITE_KEY = "1x00000000000000000000AA";
    const TEST_SECRET = "1x0000000000000000000000000000000AA";
    const DUMMY = "XXXX.DUMMY.TOKEN.XXXX";

    beforeEach(() => {
      vi.stubEnv("TURNSTILE_SITE_KEY", TEST_SITE_KEY);
      vi.stubEnv("TURNSTILE_SECRET_KEY", TEST_SECRET);
      // Cloudflare's test answers carry no real action nor host.
      fake.challenge = { status: 200, body: { success: true, "error-codes": [], hostname: "example.com", action: "" } };
    });

    it("are honoured on a local site, for a local request", async () => {
      const { POST } = await load();
      const response = await POST(post(request, { "x-turnstile-token": DUMMY }), context());
      expect(response.status).toBe(200);
      expect(fns()).toEqual([VERIFY, QUOTA, QUOTA, BOOK]);
      expect(verifyCalls()[0].body).toMatchObject({ secret: TEST_SECRET, response: DUMMY });
    });

    it("are NEVER honoured when the configured site is hosted: every booking refused, nothing called", async () => {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.beautizzy.example");
      const { POST } = await load();
      const response = await POST(post(request, { "x-turnstile-token": DUMMY }), context());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
      expect(fake.calls).toEqual([]);
    });

    it("are NEVER honoured when the request reaches a hosted address, whatever the configured origin says", async () => {
      const { POST } = await load();
      const hosted = new Request("https://booking.beautizzy.example/api/booking/chez-amelie", {
        method: "POST",
        headers: { origin: SITE, "content-type": "application/json", "x-turnstile-token": DUMMY },
        body: JSON.stringify(request),
      });
      const response = await POST(hosted, context());
      expect(response.status).toBe(503);
      expect(fake.calls).toEqual([]);
      expect(logs).toContain("booking: challenge unavailable (test keys on a hosted site)");
    });
  });

  it("a retry after an unknown outcome: same body, same key, NEW token — the engine sees the very same request", async () => {
    fake.booking = "network";
    const { POST } = await load();
    const first = await POST(post(request, { "x-turnstile-token": "0.first-token" }), context());
    expect(first.status).toBe(502);
    fake.booking = { status: 200, body: booked };
    const second = await POST(post(request, { "x-turnstile-token": "0.second-token" }), context());
    expect(second.status).toBe(200);

    const engine = fake.calls.filter((call) => call.fn === BOOK).map((call) => call.body);
    expect(engine).toHaveLength(2);
    expect(engine[1]).toEqual(engine[0]);
    expect(engine[0].p_idempotency_key).toBe(KEY);
    expect(verifyCalls().map((call) => call.body.response)).toEqual(["0.first-token", "0.second-token"]);
  });

  it("a token is single-use: sent again, Cloudflare's refusal stops it before the counters and the engine", async () => {
    const spent = new Set<string>();
    fake.challenge = (form) => {
      if (spent.has(form.response)) return refused(["timeout-or-duplicate"]);
      spent.add(form.response);
      return { status: 200, body: verified };
    };
    const { POST } = await load();
    expect((await POST(post(request), context())).status).toBe(200);
    const replay = await POST(post(request), context());
    expect(replay.status).toBe(403);
    expect(await replay.json()).toEqual({ status: "CHALLENGE_FAILED" });
    expect(fns()).toEqual([VERIFY, QUOTA, QUOTA, BOOK, VERIFY]);
  });

  it("never forwards the token — not to the counters, not to the engine, not in a log", async () => {
    const { POST } = await load();
    await POST(post(request), context());
    const beyondCloudflare = JSON.stringify(fake.calls.filter((call) => call.fn !== VERIFY).map((call) => [call.body, call.headers]));
    expect(beyondCloudflare).not.toContain(TOKEN);
    expect(logs.join("\n")).not.toContain(TOKEN);
  });

  it("logs a refusal by Cloudflare's known codes only — nothing else from the answer, never the token or the secret", async () => {
    fake.challenge = { status: 200, body: { success: false, "error-codes": ["timeout-or-duplicate", "<injected>"], echo: TOKEN } };
    const { POST } = await load();
    await POST(post(request), context());
    expect(logs).toContain("booking: challenge refused (timeout-or-duplicate)");
    for (const value of ["<injected>", TOKEN, TURNSTILE_SECRET]) expect(logs.join("\n")).not.toContain(value);
  });
});

/**
 * The counters of `online_booking_take_request_quota` (migration
 * 20261019120000), modelled: one call increments EVERY counter it is given —
 * a refused call too — as one atomic step, and answers whether all of them are
 * still within their limit. One window: a test lasts milliseconds. Each call
 * first yields, so every request in flight interleaves with the others between
 * its two steps, as on a real server. (The same scenarios run against the real
 * function on PostgreSQL in the review harness.)
 */
function counterDatabase() {
  const hits = new Map<string, number>();
  const take = async (counters: Counter[]): Promise<Answer> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (counters.length < 1 || counters.length > 8 || counters.some((c) => !/^[0-9a-f]{64}$/.test(c.key))) {
      return { status: 400, body: { code: "22023" } };
    }
    let allowed = true;
    for (const counter of counters) {
      const count = (hits.get(counter.key) ?? 0) + 1;
      hits.set(counter.key, count);
      if (count > counter.limit) allowed = false;
    }
    return { status: 200, body: allowed };
  };
  return { hits, take };
}

describe("POST /api/booking/[slug] — one client cannot use up the page's shared quota", () => {
  let database: ReturnType<typeof counterDatabase>;
  let sent = 0;

  beforeEach(() => {
    database = counterDatabase();
    fake.quota = database.take;
    sent = 0;
  });

  /** A new booking attempt (its own key) from a network, by default with its own email and a verified token. */
  const from = (network: string, email?: string, token = TOKEN) => {
    sent += 1;
    return post(
      { ...request, email: email ?? `client${sent}@example.test`, idempotency_key: String(sent).padStart(32, "0") },
      { "x-forwarded-for": network, "x-turnstile-token": token },
    );
  };
  type Handler = Awaited<ReturnType<typeof load>>["POST"];
  const together = (POST: Handler, requests: Request[]) =>
    Promise.all(requests.map(async (r) => (await POST(r, context())).status));
  const count = (statuses: number[], status: number) => statuses.filter((s) => s === status).length;
  const bookings = () => fns().filter((fn) => fn === BOOK).length;
  const pageHits = () => {
    const [key] = pageKeys();
    return key === undefined ? 0 : (database.hits.get(key) ?? 0);
  };

  it("a network refused by its own limits adds nothing more to the page: another customer still books", async () => {
    const { POST } = await load();
    const flood: number[] = [];
    for (let i = 0; i < 60; i += 1) flood.push((await POST(from("203.0.113.7"), context())).status);
    expect(count(flood, 200)).toBe(10);
    expect(count(flood, 429)).toBe(50);

    const customer = await POST(from("198.51.100.20"), context());
    expect(customer.status).toBe(200);
    expect(await customer.json()).toEqual(booked);
    expect(bookings()).toBe(11);
    // Only the 10 requests its own limits allowed reached the page's counter (+ the customer).
    expect(pageHits()).toBe(11);
  });

  it("30 simultaneous requests from one network: exactly 10 pass, and the page keeps room for 20 others", async () => {
    const { POST } = await load();
    const flood = await together(POST, Array.from({ length: 30 }, () => from("203.0.113.7")));
    expect(count(flood, 200)).toBe(10);
    expect(count(flood, 429)).toBe(20);

    const customers = await together(POST, Array.from({ length: 20 }, (_, i) => from(`198.51.100.${i + 1}`)));
    expect(customers).toEqual(Array<number>(20).fill(200));
    expect(bookings()).toBe(30);
    expect(pageHits()).toBe(30);
  });

  it("still holds the page to 30 under concurrency: 45 customers on 45 networks at once, exactly 30 booked", async () => {
    const { POST } = await load();
    const statuses = await together(POST, Array.from({ length: 45 }, (_, i) => from(`198.51.100.${i + 1}`)));
    expect(count(statuses, 200)).toBe(30);
    expect(count(statuses, 429)).toBe(15);
    expect(bookings()).toBe(30);
    expect(pageHits()).toBe(45);
  });

  it("a flood and real customers at once: the page's 30 are shared, the flood gets at most its network's 10", async () => {
    const { POST } = await load();
    const statuses = await together(POST, [
      ...Array.from({ length: 30 }, () => from("203.0.113.7")),
      ...Array.from({ length: 25 }, (_, i) => from(`198.51.100.${i + 1}`)),
    ]);
    const flood = statuses.slice(0, 30);
    const customers = statuses.slice(30);
    expect(count(statuses, 200)).toBe(30);
    expect(count(flood, 200)).toBeLessThanOrEqual(10);
    expect(count(customers, 200)).toBeGreaterThanOrEqual(20);
    expect(bookings()).toBe(30);
    // 10 from the flood's network + 25 customers reached the page's counter.
    expect(pageHits()).toBe(35);
  });

  it("requests without a verified token never reach a counter: a flood of them from 60 networks leaves the page to real customers", async () => {
    fake.challenge = (form) =>
      form.response === TOKEN ? { status: 200, body: verified } : { status: 200, body: { success: false, "error-codes": ["invalid-input-response"] } };
    const { POST } = await load();
    const flood = await together(POST, Array.from({ length: 60 }, (_, i) => from(`198.51.4.${i + 1}`, undefined, `0.forged-${i}`)));
    expect(count(flood, 403)).toBe(60);
    expect(database.hits.size).toBe(0);
    expect(bookings()).toBe(0);

    const customer = await POST(from("198.51.100.20"), context());
    expect(customer.status).toBe(200);
    expect(pageHits()).toBe(1);
  });

  it("keeps the client's own limits: one email from 7 networks, the 7th refused", async () => {
    const { POST } = await load();
    const statuses: number[] = [];
    for (let i = 1; i <= 7; i += 1) statuses.push((await POST(from(`198.51.100.${i}`, "marie.dupont@example.test"), context())).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429]);
    expect(pageHits()).toBe(6);
  });
});

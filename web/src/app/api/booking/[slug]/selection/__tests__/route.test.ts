import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE = "https://ref.supabase.co";
const SECRET = "sb_secret_test_value";
const LIMIT_SECRET = "test-request-limit-secret-0123456789abcdef";
const SITE = "http://localhost:3000";
const KEY = "0123456789abcdef0123456789abcdef";
const FINGERPRINT = "9".repeat(64);
const TURNSTILE_SITE_KEY = "0x4AAAAAAAsiteKeyOfTheTests";
const TURNSTILE_SECRET = "0x4AAAAAAAsecretKeyOfTheTests00000";
const TOKEN = "0.turnstile-token-of-the-tests";
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const verified = { success: true, "error-codes": [], hostname: "localhost", action: "booking", cdata: "" };

const QUOTA = "online_booking_take_request_quota";
const BOOK = "online_booking_create_selection_booking";
const VERIFY = "siteverify";

const request = {
  service_ids: ["tech-couleur", "svc-coupe"],
  starts_at: "2026-11-16T13:00:00Z",
  selection_fingerprint: FINGERPRINT,
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
    services: [
      { id: "tech-couleur", name: "Couleur", duration_minutes: 90 },
      { id: "svc-coupe", name: "Coupe", duration_minutes: 45 },
    ],
    duration_minutes: 135,
    starts_at: "2026-11-16T13:00:00Z",
    ends_at: "2026-11-16T15:15:00Z",
    local_date: "2026-11-16",
    local_time: "14:00",
    time_zone: "Europe/Paris",
  },
};

type Answer = { status: number; body: unknown } | "network" | "timeout";
interface Fake {
  challenge: Answer;
  quota: Answer;
  /** One answer per engine call, in order (the last one repeats). */
  booking: Answer[];
  calls: { fn: string; body: Record<string, unknown> }[];
}
let fake: Fake;
let logs: string[];

function answerWith(answer: Answer): Response {
  if (answer === "network") throw new TypeError("fetch failed");
  if (answer === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
}

function post(body: unknown, headers: Record<string, string> = {}, slug = "chez-amelie") {
  return new Request(`${SITE}/api/booking/${slug}/selection`, {
    method: "POST",
    headers: {
      origin: SITE,
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.7",
      "x-turnstile-token": TOKEN,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const context = (slug = "chez-amelie") => ({ params: Promise.resolve({ slug }) });

async function load() {
  vi.resetModules();
  return import("../route");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "enabled");
  vi.stubEnv("ONLINE_BOOKING_REQUEST_LIMIT_SECRET", LIMIT_SECRET);
  vi.stubEnv("TURNSTILE_SITE_KEY", TURNSTILE_SITE_KEY);
  vi.stubEnv("TURNSTILE_SECRET_KEY", TURNSTILE_SECRET);
  fake = { challenge: { status: 200, body: verified }, quota: { status: 200, body: true }, booking: [{ status: 200, body: booked }], calls: [] };
  let engineCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url === SITEVERIFY) {
        fake.calls.push({ fn: VERIFY, body: Object.fromEntries(new URLSearchParams(String(init.body))) });
        return answerWith(fake.challenge);
      }
      const fn = url.replace(`${SUPABASE}/rest/v1/rpc/`, "");
      fake.calls.push({ fn, body: JSON.parse(init.body as string) as Record<string, unknown> });
      if (fn === QUOTA) return answerWith(fake.quota);
      if (fn === BOOK) {
        const answer = fake.booking[Math.min(engineCalls, fake.booking.length - 1)]!;
        engineCalls += 1;
        return answerWith(answer);
      }
      throw new Error(`unexpected call ${fn}`);
    }),
  );
  logs = [];
  for (const level of ["error", "warn", "log", "info"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const fns = () => fake.calls.map((call) => call.fn);
const engineBodies = () => fake.calls.filter((call) => call.fn === BOOK).map((call) => call.body);

describe("POST /api/booking/[slug]/selection — ONE appointment for an ordered selection", () => {
  it("verifies the challenge, takes the booking counters, then calls the multi-service engine ONCE with exactly the permitted fields", async () => {
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(booked);
    expect(fns()).toEqual([VERIFY, QUOTA, QUOTA, BOOK]);
    expect(engineBodies()).toEqual([
      {
        p_slug: "chez-amelie",
        p_service_ids: ["tech-couleur", "svc-coupe"],
        p_starts_at: "2026-11-16T13:00:00Z",
        p_first_name: "Marie",
        p_last_name: "Dupont",
        p_email: "marie.dupont@example.test",
        p_phone: "06 12 34 56 78",
        p_selection_fingerprint: FINGERPRINT,
        p_idempotency_key: KEY,
      },
    ]);
  });

  it("takes the SAME counters as a single-service booking: a selection is one booking", async () => {
    const { POST } = await load();
    await POST(post(request), context());
    const counters = fake.calls.filter((call) => call.fn === QUOTA).map((call) => (call.body.p_counters as { limit: number }[]).map((c) => c.limit));
    expect(counters).toEqual([[10, 40, 6], [30]]);
  });

  it.each([
    ["SLOT_UNAVAILABLE", { status: "SLOT_UNAVAILABLE" }],
    ["SELECTION_CHANGED", { status: "SELECTION_CHANGED" }],
    ["SELECTION_TOO_LONG", { status: "SELECTION_TOO_LONG" }],
    ["UNKNOWN_SERVICE + service_id", { status: "UNKNOWN_SERVICE", service_id: "svc-coupe" }],
    ["BUSY", { status: "BUSY" }],
    ["IDEMPOTENCY_KEY_REUSED", { status: "IDEMPOTENCY_KEY_REUSED" }],
    ["INVALID_REQUEST service_ids", { status: "INVALID_REQUEST", field: "service_ids" }],
  ])("forwards the engine's %s as it is", async (_label, body) => {
    fake.booking = [{ status: 200, body }];
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
  });

  it("answers UNAVAILABLE when the engine answers NULL (switch off, page paused, lapsed Plus…)", async () => {
    fake.booking = [{ status: 200, body: null }];
    const { POST } = await load();
    expect(await (await POST(post(request), context())).json()).toEqual({ status: "UNAVAILABLE" });
  });

  it("40001 — the engine rolled back: the SAME request under the SAME key is sent again, and its answer forwarded", async () => {
    fake.booking = [{ status: 409, body: { code: "40001", message: "the selection changed while it was being booked" } }, { status: 200, body: booked }];
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(booked);
    const [first, second] = engineBodies();
    expect(second).toEqual(first);
    // One door: one challenge, one quota — the retry is the engine's only.
    expect(fns()).toEqual([VERIFY, QUOTA, QUOTA, BOOK, BOOK]);
  });

  it("40001 every time: BUSY — nothing booked, the customer retries the same request", async () => {
    fake.booking = [{ status: 409, body: { code: "40001" } }];
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "BUSY" });
    expect(engineBodies().length).toBeGreaterThanOrEqual(2);
    expect(engineBodies().length).toBeLessThanOrEqual(3);
  });

  it("the engine function missing (PGRST202 — the migration is not applied): UNAVAILABLE, nothing ran", async () => {
    fake.booking = [{ status: 404, body: { code: "PGRST202", message: "Could not find the function" } }];
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    expect(engineBodies()).toHaveLength(1);
  });

  it.each<[string, Answer]>([
    ["a network failure", "network"],
    ["a timeout", "timeout"],
    ["a server error", { status: 500, body: { code: "XX000" } }],
    ["another 404", { status: 404, body: { code: "PGRST125" } }],
    ["an answer it does not understand", { status: 200, body: { status: "BOOKED", booking: { reference: "x" } } }],
  ])("%s: 502 ERROR — the outcome is unknown, never retried by the server, never a success", async (_label, answer) => {
    fake.booking = [answer];
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ status: "ERROR" });
    expect(engineBodies()).toHaveLength(1);
  });

  it("never logs, nor answers, the customer's details, the fingerprint or a secret", async () => {
    fake.booking = [{ status: 500, body: { code: "XX000", message: "marie.dupont@example.test" } }];
    const { POST } = await load();
    const text = await (await POST(post(request), context())).text();
    for (const leak of ["Marie", "marie.dupont", "06 12", FINGERPRINT, SECRET, TOKEN, LIMIT_SECRET]) {
      expect(logs.join("\n")).not.toContain(leak);
      expect(text).not.toContain(leak);
    }
  });
});

describe("POST /api/booking/[slug]/selection — the door", () => {
  const refusals: [string, () => Request, number, unknown][] = [
    ["another origin", () => post(request, { origin: "https://evil.example" }), 403, { status: "REJECTED" }],
    ["a cross-site fetch", () => post(request, { "sec-fetch-site": "cross-site" }), 403, { status: "REJECTED" }],
    ["a body that is not JSON", () => post(request, { "content-type": "text/plain" }), 415, { status: "REJECTED" }],
    ["a body over 4 KB", () => post({ ...request, first_name: "M".repeat(5000) }), 413, { status: "REJECTED" }],
    ["unparsable JSON", () => post("{"), 400, { status: "REJECTED" }],
    ["a client-provided price", () => post({ ...request, price_cents: 100 }), 400, { status: "REJECTED" }],
    ["a client-provided total", () => post({ ...request, total: 13450 }), 400, { status: "REJECTED" }],
    ["the single-service body", () => post({ ...request, service_ids: undefined, service_id: "svc-coupe" }), 400, { status: "REJECTED" }],
    ["no service", () => post({ ...request, service_ids: [] }), 400, { status: "INVALID_REQUEST", field: "service_ids" }],
    ["a ninth service", () => post({ ...request, service_ids: Array.from({ length: 9 }, (_, i) => `svc-${i}`) }), 400, { status: "INVALID_REQUEST", field: "service_ids" }],
    ["a duplicate service", () => post({ ...request, service_ids: ["svc-coupe", "svc-coupe"] }), 400, { status: "INVALID_REQUEST", field: "service_ids" }],
    ["a malformed fingerprint", () => post({ ...request, selection_fingerprint: "abc" }), 400, { status: "INVALID_REQUEST", field: "selection_fingerprint" }],
    ["a malformed key", () => post({ ...request, idempotency_key: "short" }), 400, { status: "INVALID_REQUEST", field: "idempotency_key" }],
    ["an invalid email", () => post({ ...request, email: "marie" }), 400, { status: "INVALID_REQUEST", field: "email" }],
  ];

  it.each(refusals)("refuses %s — no Cloudflare, no counter, no engine", async (_label, make, status, body) => {
    const { POST } = await load();
    const response = await POST(make(), context());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(body);
    expect(fake.calls).toEqual([]);
  });

  it("is a 404 when this deployment offers no booking flow, on the production website, and for a malformed slug", async () => {
    vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "");
    let { POST } = await load();
    expect((await POST(post(request), context())).status).toBe(404);
    vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "enabled");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://beautizzy.fr");
    ({ POST } = await load());
    expect((await POST(post(request), context())).status).toBe(404);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    ({ POST } = await load());
    expect((await POST(post(request, {}, "Bad_Slug"), context("Bad_Slug"))).status).toBe(404);
    expect(fake.calls).toEqual([]);
  });

  it("refuses a request without a challenge token, or with one Cloudflare refuses: 403 CHALLENGE_FAILED — no counter, no engine", async () => {
    const { POST } = await load();
    const headers = new Headers(post(request).headers);
    headers.delete("x-turnstile-token");
    const bare = new Request(`${SITE}/api/booking/chez-amelie/selection`, { method: "POST", headers, body: JSON.stringify(request) });
    expect(await (await POST(bare, context())).json()).toEqual({ status: "CHALLENGE_FAILED" });
    fake.challenge = { status: 200, body: { success: false, "error-codes": ["timeout-or-duplicate"] } };
    const refused = await POST(post(request), context());
    expect(refused.status).toBe(403);
    expect(fns()).toEqual([VERIFY]);
  });

  it("fails CLOSED when Cloudflare cannot answer: 503, no counter, no engine", async () => {
    fake.challenge = "network";
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fns()).toEqual([VERIFY]);
  });

  it("rejects a request over its limits before the engine (429), and fails closed without the counters (503)", async () => {
    fake.quota = { status: 200, body: false };
    let { POST } = await load();
    let response = await POST(post(request), context());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(fns()).toEqual([VERIFY, QUOTA]);

    fake.calls = [];
    fake.quota = { status: 404, body: { code: "PGRST202" } };
    ({ POST } = await load());
    response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(fns()).not.toContain(BOOK);
  });
});

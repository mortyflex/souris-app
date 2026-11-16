import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE = "https://ref.supabase.co";
const SECRET = "sb_secret_test_value";
const LIMIT_SECRET = "test-request-limit-secret-0123456789abcdef";
const SITE = "http://localhost:3000";
const KEY = "0123456789abcdef0123456789abcdef";

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

type Answer = { status: number; body: unknown } | "network";
interface Fake {
  quota: Answer;
  booking: Answer;
  calls: { fn: string; body: Record<string, unknown>; headers: Record<string, string> }[];
}

function fakeSupabase(fake: Fake) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const fn = url.replace(`${SUPABASE}/rest/v1/rpc/`, "");
    fake.calls.push({ fn, body: JSON.parse(init.body as string), headers: init.headers as Record<string, string> });
    const answer = fn === "online_booking_take_request_quota" ? fake.quota : fn === "online_booking_create_booking" ? fake.booking : undefined;
    if (answer === undefined) throw new Error(`unexpected call ${fn}`);
    if (answer === "network") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
  });
}

function post(body: unknown, headers: Record<string, string> = {}, slug = "chez-amelie") {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request(`${SITE}/api/booking/${slug}`, {
    method: "POST",
    headers: { origin: SITE, "content-type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1", ...headers },
    body: text,
  });
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
  fake = { quota: { status: 200, body: true }, booking: { status: 200, body: booked }, calls: [] };
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

describe("POST /api/booking/[slug] — success through the server boundary", () => {
  it("takes the quota, then books with exactly the permitted fields, and answers the server's confirmation", async () => {
    const { POST } = await load();
    const response = await POST(post(request), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(booked);
    expect(fns()).toEqual(["online_booking_take_request_quota", "online_booking_create_booking"]);

    const bookingCall = fake.calls[1];
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

    const counters = fake.calls[0].body.p_counters as { key: string; limit: number; window_seconds: number }[];
    expect(counters).toHaveLength(4);
    for (const counter of counters) expect(counter.key).toMatch(/^[0-9a-f]{64}$/);
    const sent = JSON.stringify(fake.calls[0].body);
    for (const secretOrPersonal of ["203.0.113.7", "marie", "example.test", "chez-amelie", LIMIT_SECRET]) {
      expect(sent).not.toContain(secretOrPersonal);
    }
  });

  it("never logs, nor answers, the customer's details or a secret", async () => {
    fake.booking = { status: 500, body: { message: "internal detail with marie.dupont@example.test" } };
    const { POST } = await load();
    const response = await POST(post(request), context());
    const text = await response.text();

    for (const value of [SECRET, LIMIT_SECRET, "marie", "Dupont", "06 12 34 56 78", "internal detail"]) {
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
  it("rejects a request over its limit BEFORE the booking engine is called", async () => {
    fake.quota = { status: 200, body: false };
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(await response.json()).toEqual({ status: "RATE_LIMITED" });
    expect(fns()).toEqual(["online_booking_take_request_quota"]);
  });

  it.each<[string, Answer]>([
    ["the counter function is missing (migration not applied)", { status: 404, body: { code: "PGRST202" } }],
    ["the counter function fails", { status: 500, body: {} }],
    ["the database cannot be reached", "network"],
    ["an unexpected answer", { status: 200, body: "yes" }],
  ])("fails CLOSED when %s: no booking", async (_label, answer) => {
    fake.quota = answer;
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fns()).toEqual(["online_booking_take_request_quota"]);
  });

  it.each([
    ["missing", ""],
    ["too short", "short-secret"],
  ])("fails CLOSED when the HMAC secret is %s: nothing is called at all", async (_label, value) => {
    vi.stubEnv("ONLINE_BOOKING_REQUEST_LIMIT_SECRET", value);
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fake.calls).toEqual([]);
  });

  it("counts the same customer under the same keys, and another customer under another email key", async () => {
    const { POST } = await load();
    await POST(post(request), context());
    await POST(post({ ...request, idempotency_key: "fedcba9876543210fedcba9876543210" }), context());
    await POST(post({ ...request, email: "zoe@example.test", idempotency_key: "aaaabbbbccccddddaaaabbbbccccdddd" }), context());
    const keys = fake.calls.filter((call) => call.fn === "online_booking_take_request_quota").map((call) =>
      (call.body.p_counters as { key: string }[]).map((counter) => counter.key),
    );
    expect(keys[1]).toEqual(keys[0]);
    // Same network and page, another email: only the email counter differs.
    expect(keys[2].filter((key) => !keys[0].includes(key))).toHaveLength(1);
  });
});

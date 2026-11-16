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
interface Counter {
  key: string;
  limit: number;
  window_seconds: number;
}
interface Fake {
  /** An answer, or one decided from the counters of the call. */
  quota: Answer | ((counters: Counter[]) => Answer | Promise<Answer>);
  booking: Answer;
  calls: { fn: string; body: Record<string, unknown>; headers: Record<string, string> }[];
}

const QUOTA = "online_booking_take_request_quota";
const BOOK = "online_booking_create_booking";

function fakeSupabase(fake: Fake) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const fn = url.replace(`${SUPABASE}/rest/v1/rpc/`, "");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    fake.calls.push({ fn, body, headers: init.headers as Record<string, string> });
    const answer =
      fn === QUOTA
        ? typeof fake.quota === "function"
          ? await fake.quota(body.p_counters as Counter[])
          : fake.quota
        : fn === BOOK
          ? fake.booking
          : undefined;
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
  it("takes the client's own quota, then the page's, then books with exactly the permitted fields", async () => {
    const { POST } = await load();
    const response = await POST(post(request), context());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual(booked);
    expect(fns()).toEqual([QUOTA, QUOTA, BOOK]);
    expect(quotaSteps()).toEqual([OWN_STEP, PAGE_STEP]);

    const bookingCall = fake.calls[2];
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
  it("rejects a request over its own limits BEFORE the booking engine — and before the page's shared counter", async () => {
    fake.quota = { status: 200, body: false };
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(await response.json()).toEqual({ status: "RATE_LIMITED" });
    expect(fns()).toEqual([QUOTA]);
    expect(quotaSteps()).toEqual([OWN_STEP]);
  });

  it("rejects a request the page's limit refuses, after the client's own limits allowed it: no booking", async () => {
    fake.quota = (counters) => ({ status: 200, body: !isPageStep(counters) });
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("600");
    expect(await response.json()).toEqual({ status: "RATE_LIMITED" });
    expect(fns()).toEqual([QUOTA, QUOTA]);
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
    expect(fns()).toEqual([QUOTA]);
  });

  it.each(failures)("fails CLOSED when, at the page's step, %s: no booking", async (_label, answer) => {
    fake.quota = (counters) => (isPageStep(counters) ? answer : { status: 200, body: true });
    const { POST } = await load();
    const response = await POST(post(request), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "PROTECTION_UNAVAILABLE" });
    expect(fns()).toEqual([QUOTA, QUOTA]);
  });

  it("keeps ONE time budget of 5 seconds for both steps: the page's step gets what the first left", async () => {
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
    expect(timeouts.mock.calls.slice(0, 2)).toEqual([[5_000], [2_000]]);
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
    expect(fns()).toEqual([QUOTA]);
    expect(logs).toContain("booking: request protection unavailable (timeout)");
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

  /** A new booking attempt (its own key) from a network, by default with its own email. */
  const from = (network: string, email?: string) => {
    sent += 1;
    return post(
      { ...request, email: email ?? `client${sent}@example.test`, idempotency_key: String(sent).padStart(32, "0") },
      { "x-forwarded-for": network },
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

  it("keeps the client's own limits: one email from 7 networks, the 7th refused", async () => {
    const { POST } = await load();
    const statuses: number[] = [];
    for (let i = 1; i <= 7; i += 1) statuses.push((await POST(from(`198.51.100.${i}`, "marie.dupont@example.test"), context())).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429]);
    expect(pageHits()).toBe(6);
  });
});

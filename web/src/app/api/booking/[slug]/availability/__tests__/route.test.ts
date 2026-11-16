import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseAvailability } from "@/features/availability/availability";

const SUPABASE = "https://ref.supabase.co";
const SITE = "http://localhost:3000";

const answer = {
  time_zone: "Europe/Paris",
  slot_minutes: 15,
  first_date: "2026-11-16",
  last_date: "2026-12-15",
  services: [{ id: "svc-coupe", name: "Coupe", duration_minutes: 45 }],
  status: "SLOTS",
  service: { id: "svc-coupe", name: "Coupe", duration_minutes: 45 },
  date: "2026-11-16",
  slots: [{ starts_at: "2026-11-16T13:00:00Z", ends_at: "2026-11-16T13:45:00Z", local_time: "14:00" }],
  // Never forwarded: not part of the approved contract.
  internal: "should never reach the browser",
};

let calls: { fn: string; body: Record<string, unknown> }[];
let quota: unknown;
let availability: { status: number; body: unknown } | "network";

function get(query: string, headers: Record<string, string> = {}) {
  return new Request(`${SITE}/api/booking/chez-amelie/availability${query}`, {
    headers: { "x-forwarded-for": "203.0.113.7", "sec-fetch-site": "same-origin", ...headers },
  });
}
const context = { params: Promise.resolve({ slug: "chez-amelie" }) };

async function load() {
  vi.resetModules();
  return import("../route");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_value");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "enabled");
  vi.stubEnv("ONLINE_BOOKING_REQUEST_LIMIT_SECRET", "test-request-limit-secret-0123456789abcdef");
  calls = [];
  quota = true;
  availability = { status: 200, body: answer };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const fn = url.replace(`${SUPABASE}/rest/v1/rpc/`, "");
      calls.push({ fn, body: JSON.parse(init.body as string) });
      if (fn === "online_booking_take_request_quota") return new Response(JSON.stringify(quota), { status: 200 });
      if (availability === "network") throw new TypeError("fetch failed");
      return new Response(JSON.stringify(availability.body), { status: availability.status });
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/booking/[slug]/availability", () => {
  it("answers the server's availability, approved fields only, never cached", async () => {
    const { GET } = await load();
    const response = await GET(get("?service=svc-coupe&date=2026-11-16"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(body.status).toBe("OK");
    expect(JSON.stringify(body)).not.toContain("internal");
    // The browser reads it with the very same parser as the server.
    expect(parseAvailability(body.availability)).toMatchObject({ status: "SLOTS", slots: [{ localTime: "14:00" }] });
    expect(calls.map((call) => call.fn)).toEqual(["online_booking_take_request_quota", "online_booking_public_availability"]);
    expect(calls[1].body).toEqual({ p_slug: "chez-amelie", p_service_id: "svc-coupe", p_date: "2026-11-16" });
  });

  it("answers UNAVAILABLE when the page does not accept bookings", async () => {
    availability = { status: 200, body: null };
    const { GET } = await load();
    const response = await GET(get("?service=svc-coupe&date=2026-11-16"), context);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
  });

  it.each([
    ["an unknown parameter", "?service=svc-coupe&business_id=1"],
    ["a malformed date", "?service=svc-coupe&date=16/11/2026"],
    ["an impossible date", "?service=svc-coupe&date=2026-02-30"],
    ["a malformed service", "?service=svc%20coupe"],
    ["a repeated parameter", "?date=2026-11-16&date=2026-11-17"],
  ])("refuses %s before anything is called", async (_label, query) => {
    const { GET } = await load();
    const response = await GET(get(query), context);
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("refuses a cross-site read", async () => {
    const { GET } = await load();
    const response = await GET(get("", { "sec-fetch-site": "cross-site" }), context);
    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it("is rate-limited before the availability function is read", async () => {
    quota = false;
    const { GET } = await load();
    const response = await GET(get("?service=svc-coupe&date=2026-11-16"), context);
    expect(response.status).toBe(429);
    expect(calls.map((call) => call.fn)).toEqual(["online_booking_take_request_quota"]);
  });

  it("fails closed without its request-limit secret", async () => {
    vi.stubEnv("ONLINE_BOOKING_REQUEST_LIMIT_SECRET", "");
    const { GET } = await load();
    const response = await GET(get(""), context);
    expect(response.status).toBe(503);
    expect(calls).toEqual([]);
  });

  it("answers ERROR — never an empty day — when the lookup fails", async () => {
    availability = "network";
    const { GET } = await load();
    const response = await GET(get("?service=svc-coupe&date=2026-11-16"), context);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ status: "ERROR" });
  });

  it("is a 404 where no booking flow is offered", async () => {
    vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "");
    const { GET } = await load();
    const response = await GET(get(""), context);
    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });
});

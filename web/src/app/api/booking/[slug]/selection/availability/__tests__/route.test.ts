import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseSelectionAvailability } from "@/features/availability/selection";

const SUPABASE = "https://ref.supabase.co";
const SITE = "http://localhost:3000";
const READ = "online_booking_public_selection_availability";

const envelope = {
  time_zone: "Europe/Paris",
  slot_minutes: 15,
  first_date: "2026-11-16",
  last_date: "2026-12-15",
  services: [
    { id: "svc-coupe", name: "Coupe", duration_minutes: 45, price_cents: 4500, description: null, category: null },
    { id: "tech-couleur", name: "Couleur", duration_minutes: 90, price_cents: 0, description: null, category: null },
  ],
};
const selection = {
  services: [envelope.services[1], envelope.services[0]],
  duration_minutes: 135,
  fingerprint: "e".repeat(64),
};
const slots = {
  ...envelope,
  status: "SLOTS",
  selection,
  date: "2026-11-16",
  slots: [{ starts_at: "2026-11-16T13:00:00Z", ends_at: "2026-11-16T15:15:00Z", local_time: "14:00" }],
  internal: "never forwarded",
};

let calls: { fn: string; body: Record<string, unknown> }[];
let quota: unknown;
let answer: { status: number; body: unknown } | "network";

function get(query: string, headers: Record<string, string> = {}) {
  return new Request(`${SITE}/api/booking/chez-amelie/selection/availability${query}`, {
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
  answer = { status: 200, body: slots };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const fn = url.replace(`${SUPABASE}/rest/v1/rpc/`, "");
      calls.push({ fn, body: JSON.parse(init.body as string) });
      if (fn === "online_booking_take_request_quota") return new Response(JSON.stringify(quota), { status: 200 });
      if (answer === "network") throw new TypeError("fetch failed");
      return new Response(JSON.stringify(answer.body), { status: answer.status });
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/booking/[slug]/selection/availability", () => {
  it("asks for the WHOLE selection, in her order, and answers the server's reading — approved fields only, never cached", async () => {
    const { GET } = await load();
    const response = await GET(get("?service=tech-couleur&service=svc-coupe&date=2026-11-16"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("internal");
    const parsed = parseSelectionAvailability(body.availability);
    expect(parsed?.selection?.services.map((service) => service.id)).toEqual(["tech-couleur", "svc-coupe"]);
    expect(parsed?.selection?.fingerprint).toBe("e".repeat(64));
    expect(calls.map((call) => call.fn)).toEqual(["online_booking_take_request_quota", READ]);
    expect(calls[1]!.body).toEqual({ p_slug: "chez-amelie", p_service_ids: ["tech-couleur", "svc-coupe"], p_date: "2026-11-16" });
  });

  it.each([
    ["DOES_NOT_FIT", { ...envelope, status: "DOES_NOT_FIT", selection, longest_interval_minutes: 120 }],
    ["SELECTION_TOO_LONG", { ...envelope, status: "SELECTION_TOO_LONG", selection: { ...selection, duration_minutes: 800 }, max_minutes: 720 }],
    ["UNKNOWN_SERVICE", { ...envelope, status: "UNKNOWN_SERVICE", service_id: "svc-gone" }],
    ["OUT_OF_WINDOW", { ...envelope, status: "OUT_OF_WINDOW", selection, date: "2027-02-01" }],
    ["INVALID_SELECTION", { ...envelope, status: "INVALID_SELECTION", reason: "DUPLICATE" }],
  ])("forwards %s with its own fields", async (status, body) => {
    answer = { status: 200, body };
    const { GET } = await load();
    const response = await GET(get("?service=tech-couleur&service=svc-coupe&date=2026-11-16"), context);
    const answered = await response.json();
    expect(answered.status).toBe("OK");
    expect(answered.availability.status).toBe(status);
    expect(parseSelectionAvailability(answered.availability)).toBeDefined();
  });

  it.each([
    ["no service", "?date=2026-11-16"],
    ["a ninth service", `?${Array.from({ length: 9 }, (_, i) => `service=svc-${i}`).join("&")}`],
    ["a duplicate", "?service=svc-coupe&service=svc-coupe"],
    ["a malformed id", "?service=%20svc-coupe"],
    ["two dates", "?service=svc-coupe&date=2026-11-16&date=2026-11-17"],
    ["a malformed date", "?service=svc-coupe&date=16-11-2026"],
    ["an unknown parameter", "?service=svc-coupe&price=0"],
  ])("refuses %s: 400, nothing asked", async (_label, query) => {
    const { GET } = await load();
    const response = await GET(get(query), context);
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("accepts eight distinct services", async () => {
    const { GET } = await load();
    const query = `?${Array.from({ length: 8 }, (_, i) => `service=svc-${i}`).join("&")}`;
    answer = { status: 200, body: { ...envelope, status: "UNKNOWN_SERVICE", service_id: "svc-0" } };
    expect((await GET(get(query), context)).status).toBe(200);
    expect((calls[1]!.body.p_service_ids as string[]).length).toBe(8);
  });

  it("answers UNAVAILABLE for a page that does not accept bookings — and when the database has no such function", async () => {
    answer = { status: 200, body: null };
    let { GET } = await load();
    expect(await (await GET(get("?service=svc-coupe"), context)).json()).toEqual({ status: "UNAVAILABLE" });
    answer = { status: 404, body: { code: "PGRST202" } };
    ({ GET } = await load());
    expect(await (await GET(get("?service=svc-coupe"), context)).json()).toEqual({ status: "UNAVAILABLE" });
  });

  it("a failed read is an ERROR (502) — never an empty day", async () => {
    answer = "network";
    let { GET } = await load();
    expect((await GET(get("?service=svc-coupe&date=2026-11-16"), context)).status).toBe(502);
    answer = { status: 200, body: { ...envelope, status: "SLOTS" } };
    ({ GET } = await load());
    expect(await (await GET(get("?service=svc-coupe&date=2026-11-16"), context)).json()).toEqual({ status: "ERROR" });
  });

  it("is rate-limited with the availability counter (fail closed), refuses cross-site reads, and is a 404 without the flow", async () => {
    quota = false;
    let { GET } = await load();
    expect((await GET(get("?service=svc-coupe"), context)).status).toBe(429);
    expect(calls.map((call) => call.fn)).toEqual(["online_booking_take_request_quota"]);
    quota = true;
    calls = [];
    ({ GET } = await load());
    expect((await GET(get("?service=svc-coupe", { "sec-fetch-site": "cross-site" }), context)).status).toBe(403);
    vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "");
    ({ GET } = await load());
    expect((await GET(get("?service=svc-coupe"), context)).status).toBe(404);
    expect(calls).toEqual([]);
  });
});

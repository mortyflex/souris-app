import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE = "https://ref.supabase.co";
const envelope = {
  time_zone: "Europe/Paris",
  slot_minutes: 15,
  first_date: "2026-11-16",
  last_date: "2026-12-15",
  services: [{ id: "svc-coupe", name: "Coupe", duration_minutes: 45, price_cents: 4500, description: null, category: null }],
};
type Answer = { status: number; body: unknown } | "network";
let selection: Answer;
let single: Answer;
let calls: string[];

const reply = (answer: Answer) => {
  if (answer === "network") throw new TypeError("fetch failed");
  return new Response(JSON.stringify(answer.body), { status: answer.status });
};

async function load() {
  vi.resetModules();
  return import("../booking-catalog");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_value");
  calls = [];
  single = { status: 200, body: { ...envelope, services: [{ id: "svc-coupe", name: "Coupe", duration_minutes: 45 }], status: "CHOOSE_SERVICE" } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const fn = url.replace(`${SUPABASE}/rest/v1/rpc/`, "");
      calls.push(fn);
      return reply(fn === "online_booking_public_selection_availability" ? selection : single);
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getBookingCatalog — which booking the server supports, decided by its own answer", () => {
  it("a server with the multi-service contract: the selection mode, from ONE read", async () => {
    selection = { status: 200, body: { ...envelope, status: "INVALID_SELECTION", reason: "EMPTY" } };
    const { getBookingCatalog } = await load();
    const catalog = await getBookingCatalog("chez-amelie");
    expect(catalog).toMatchObject({ mode: "selection", firstDate: "2026-11-16", timeZone: "Europe/Paris" });
    expect(catalog?.services[0]).toMatchObject({ id: "svc-coupe", priceCents: 4500 });
    expect(calls).toEqual(["online_booking_public_selection_availability"]);
  });

  it("a server without it (PostgREST 404 PGRST202): the deployed single-service flow", async () => {
    selection = { status: 404, body: { code: "PGRST202", message: "Could not find the function" } };
    const { getBookingCatalog } = await load();
    expect(await getBookingCatalog("chez-amelie")).toMatchObject({ mode: "single", services: [{ id: "svc-coupe" }] });
    expect(calls).toEqual(["online_booking_public_selection_availability", "online_booking_public_availability"]);
  });

  it("a page that does not accept bookings: null, whichever server", async () => {
    selection = { status: 200, body: null };
    let { getBookingCatalog } = await load();
    expect(await getBookingCatalog("chez-amelie")).toBeNull();
    selection = { status: 404, body: { code: "PGRST202" } };
    single = { status: 200, body: null };
    ({ getBookingCatalog } = await load());
    expect(await getBookingCatalog("chez-amelie")).toBeNull();
  });

  it.each<[string, Answer]>([
    ["a network failure", "network"],
    ["a server error", { status: 500, body: { code: "XX000" } }],
    ["another 404 (not PGRST202)", { status: 404, body: { code: "PGRST125" } }],
    ["a 404 without a body", { status: 404, body: "" }],
    ["a missing grant", { status: 401, body: { code: "42501" } }],
    ["an answer it does not understand", { status: 200, body: { status: "SLOTS" } }],
  ])("%s is a failure — never a reason to fall back to the older flow", async (_label, answer) => {
    selection = answer;
    const { getBookingCatalog } = await load();
    await expect(getBookingCatalog("chez-amelie")).rejects.toThrow();
    expect(calls).toEqual(["online_booking_public_selection_availability"]);
  });

  it("asks with no ids and no date, and never for a malformed slug", async () => {
    selection = { status: 200, body: { ...envelope, status: "INVALID_SELECTION", reason: "EMPTY" } };
    const fetchMock = vi.mocked(fetch);
    const { getBookingCatalog } = await load();
    await getBookingCatalog("chez-amelie");
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ p_slug: "chez-amelie", p_service_ids: null, p_date: null });
    expect(await getBookingCatalog("Bad_Slug")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

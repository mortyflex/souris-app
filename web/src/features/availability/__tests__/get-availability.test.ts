import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "sb_secret_test_value";
const answer = {
  time_zone: "Europe/Paris",
  slot_minutes: 15,
  first_date: "2026-11-16",
  last_date: "2026-12-15",
  services: [{ id: "svc-coupe", name: "Coupe", duration_minutes: 45 }],
  status: "SLOTS",
  service: { id: "svc-coupe", name: "Coupe", duration_minutes: 45 },
  date: "2026-11-20",
  slots: [{ starts_at: "2026-11-20T08:00:00Z", ends_at: "2026-11-20T08:45:00Z", local_time: "09:00" }],
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function load() {
  vi.resetModules();
  return import("../get-availability");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getAvailability", () => {
  it("asks the ONE availability function by slug, with the secret key, uncached", async () => {
    const fetchMock = vi.fn(async () => respond(answer));
    vi.stubGlobal("fetch", fetchMock);
    const { getAvailability } = await load();

    await expect(getAvailability("chez-amelie", { serviceId: "svc-coupe", date: "2026-11-20" })).resolves.toMatchObject({
      status: "SLOTS",
      slots: [{ localTime: "09:00" }],
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ref.supabase.co/rest/v1/rpc/online_booking_public_availability");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.body).toBe(JSON.stringify({ p_slug: "chez-amelie", p_service_id: "svc-coupe", p_date: "2026-11-20" }));
    expect((init.headers as Record<string, string>).apikey).toBe(SECRET);
  });

  it("sends no service and no date as null — never a Business or staff identifier", async () => {
    const fetchMock = vi.fn(async () => respond({ ...answer, status: "CHOOSE_SERVICE", service: undefined, date: undefined }));
    vi.stubGlobal("fetch", fetchMock);
    const { getAvailability } = await load();
    await getAvailability("chez-amelie", {});
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ p_slug: "chez-amelie", p_service_id: null, p_date: null });
  });

  it("answers null when the page does not accept bookings (the server answers null)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(null)));
    const { getAvailability } = await load();
    await expect(getAvailability("chez-amelie", {})).resolves.toBeNull();
  });

  it.each(["Bad_Slug", "ab", "../admin", ""])("never calls the database for the malformed slug %j", async (slug) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { getAvailability } = await load();
    await expect(getAvailability(slug, {})).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws instead of showing a failure as « no slot »", async () => {
    const { getAvailability } = await load();
    vi.stubGlobal("fetch", vi.fn(async () => respond({}, 500)));
    await expect(getAvailability("chez-amelie", {})).rejects.toThrow("HTTP 500");
    vi.stubGlobal("fetch", vi.fn(async () => respond({ status: "SLOTS" })));
    await expect(getAvailability("chez-amelie", {})).rejects.toThrow("unexpected answer");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(getAvailability("chez-amelie", {})).rejects.toThrow("network");
  });

  it("never puts the key in an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ message: SECRET }, 401)));
    const { getAvailability } = await load();
    const failure: unknown = await getAvailability("chez-amelie", {}).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain(SECRET);
  });
});

describe("isAvailabilityPreviewEnabled", () => {
  async function loadPreview() {
    vi.resetModules();
    return import("../preview");
  }

  it("is off unless the switch says exactly « enabled »", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.beautizzy.fr");
    for (const value of [undefined, "", "true", "1", "ENABLED "]) {
      if (value === undefined) vi.stubEnv("ONLINE_BOOKING_AVAILABILITY_PREVIEW", "");
      else vi.stubEnv("ONLINE_BOOKING_AVAILABILITY_PREVIEW", value);
      const { isAvailabilityPreviewEnabled } = await loadPreview();
      expect(isAvailabilityPreviewEnabled()).toBe(false);
    }
    vi.stubEnv("ONLINE_BOOKING_AVAILABILITY_PREVIEW", "enabled");
    expect((await loadPreview()).isAvailabilityPreviewEnabled()).toBe(true);
  });

  it("never shows on the production website, even with the switch set", async () => {
    vi.stubEnv("ONLINE_BOOKING_AVAILABILITY_PREVIEW", "enabled");
    for (const site of ["https://beautizzy.fr", "https://www.beautizzy.fr/", "https://BeautIzzy.fr"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", site);
      expect((await loadPreview()).isAvailabilityPreviewEnabled()).toBe(false);
    }
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect((await loadPreview()).isAvailabilityPreviewEnabled()).toBe(true);
  });
});

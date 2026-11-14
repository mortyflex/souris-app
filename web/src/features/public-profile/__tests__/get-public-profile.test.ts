import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "sb_secret_test_value";
const answer = { slug: "chez-amelie", name: "Chez Amélie", booking_enabled: false };

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function load() {
  vi.resetModules();
  return import("../get-public-profile");
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getPublicProfile", () => {
  it("asks the ONE public-read function, with the secret key, uncached", async () => {
    const fetchMock = vi.fn(async () => respond(answer));
    vi.stubGlobal("fetch", fetchMock);
    const { getPublicProfile } = await load();

    await expect(getPublicProfile("chez-amelie")).resolves.toMatchObject({ slug: "chez-amelie", name: "Chez Amélie" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ref.supabase.co/rest/v1/rpc/online_booking_public_profile");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.body).toBe(JSON.stringify({ p_slug: "chez-amelie" }));
    expect((init.headers as Record<string, string>).apikey).toBe(SECRET);
  });

  it.each(["Bad_Slug", "ab", "a--b", "../admin", "x' or '1'='1", ""])(
    "answers no profile for the malformed slug %j without calling the database",
    async (slug) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { getPublicProfile } = await load();
      await expect(getPublicProfile(slug)).resolves.toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("answers no profile when the server answers null (unknown, draft, unpublished, lapsed)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(null)));
    const { getPublicProfile } = await load();
    await expect(getPublicProfile("nobody-here")).resolves.toBeNull();
  });

  it("answers no profile when the server returns another slug than the one asked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ ...answer, slug: "someone-else" })));
    const { getPublicProfile } = await load();
    await expect(getPublicProfile("chez-amelie")).resolves.toBeNull();
  });

  it("throws on a failed lookup instead of pretending the page does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ message: "permission denied" }, 403)));
    const { getPublicProfile } = await load();
    await expect(getPublicProfile("chez-amelie")).rejects.toThrow("HTTP 403");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const again = await load();
    await expect(again.getPublicProfile("chez-amelie")).rejects.toThrow("network");
  });

  it("names the missing variable, never a value", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubGlobal("fetch", vi.fn());
    const { getPublicProfile } = await load();
    const failure = await getPublicProfile("chez-amelie").catch((error: unknown) => error as Error);
    expect((failure as Error).message).toBe("Missing server environment variable: SUPABASE_SECRET_KEY");
  });

  it("never puts the secret in an error message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({ hint: SECRET }, 500)));
    const { getPublicProfile } = await load();
    const failure = await getPublicProfile("chez-amelie").catch((error: unknown) => error as Error);
    expect((failure as Error).message).not.toContain(SECRET);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The server's configuration of the bot challenge. Siteverify itself — every
 * answer, every failure — is exercised through the booking route
 * (src/app/api/booking/[slug]/__tests__/route.test.ts) with a mocked fetch.
 */

const REAL_SITE_KEY = "0x4AAAAAAAsiteKeyOfTheTests";
const REAL_SECRET = "0x4AAAAAAAsecretKeyOfTheTests00000";

async function load() {
  vi.resetModules();
  return import("../turnstile");
}

let logs: string[];

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("TURNSTILE_SITE_KEY", REAL_SITE_KEY);
  vi.stubEnv("TURNSTILE_SECRET_KEY", REAL_SECRET);
  logs = [];
  for (const level of ["error", "warn", "log", "info"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("challengeSetup / challengeSiteKey", () => {
  it("gives the page the site key — and only the site key — of a usable configuration", async () => {
    const { challengeSetup, challengeSiteKey } = await load();
    expect(challengeSiteKey()).toBe(REAL_SITE_KEY);
    expect(challengeSetup()).toEqual({
      ok: true,
      siteKey: REAL_SITE_KEY,
      secretKey: REAL_SECRET,
      testing: false,
      siteHostname: "localhost",
    });
  });

  it("expects the CONFIGURED site's host", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://Staging.BeautIzzy.example");
    const { challengeSetup } = await load();
    expect(challengeSetup()).toMatchObject({ ok: true, siteHostname: "staging.beautizzy.example", testing: false });
  });

  it.each<[string, Record<string, string>, string]>([
    ["no site key", { TURNSTILE_SITE_KEY: "" }, "not configured"],
    ["no secret", { TURNSTILE_SECRET_KEY: "   " }, "not configured"],
    ["a malformed site key", { TURNSTILE_SITE_KEY: "<script>" }, "malformed key"],
    ["a secret with a space", { TURNSTILE_SECRET_KEY: "0x4AAAA AAAA secret" }, "malformed key"],
    ["a test site key with a real secret", { TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }, "test and real keys mixed"],
    ["a real site key with a test secret", { TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA" }, "test and real keys mixed"],
    ["no site origin", { NEXT_PUBLIC_SITE_URL: "" }, "no site origin"],
    ["an unreadable site origin", { NEXT_PUBLIC_SITE_URL: "not a url" }, "no site origin"],
  ])("refuses %s (fail closed), logging the reason, never a key", async (_label, env, reason) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { challengeSetup, challengeSiteKey } = await load();
    expect(challengeSetup()).toEqual({ ok: false, reason });
    expect(challengeSiteKey()).toBeUndefined();
    expect(logs).toEqual([`booking: challenge unavailable (${reason})`]);
    for (const value of [REAL_SITE_KEY, REAL_SECRET]) expect(logs.join("\n")).not.toContain(value);
  });

  describe("Cloudflare's test keys", () => {
    const SITE_KEYS = ["1x00000000000000000000AA", "2x00000000000000000000AB", "1x00000000000000000000BB", "2x00000000000000000000BB", "3x00000000000000000000FF"];
    const SECRETS = ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"];

    it.each(SITE_KEYS.flatMap((site) => SECRETS.map((secret) => [site, secret])))(
      "%s + %s: honoured on a local site, as a test configuration",
      async (site, secret) => {
        vi.stubEnv("TURNSTILE_SITE_KEY", site);
        vi.stubEnv("TURNSTILE_SECRET_KEY", secret);
        const { challengeSetup } = await load();
        expect(challengeSetup()).toMatchObject({ ok: true, testing: true });
      },
    );

    it.each(["http://127.0.0.1:3000", "http://192.168.1.20:3000", "http://10.0.2.2:3000", "http://studio.localhost:3000"])(
      "are honoured with a local site origin (%s)",
      async (origin) => {
        vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
        vi.stubEnv("TURNSTILE_SITE_KEY", SITE_KEYS[0]);
        vi.stubEnv("TURNSTILE_SECRET_KEY", SECRETS[0]);
        const { challengeSetup } = await load();
        expect(challengeSetup()).toMatchObject({ ok: true, testing: true });
      },
    );

    it.each(["https://staging.beautizzy.example", "https://beautizzy.fr", "https://beautizzy-web.vercel.app", "https://localhost.evil.example"])(
      "are NEVER honoured on a hosted site (%s)",
      async (origin) => {
        vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
        vi.stubEnv("TURNSTILE_SITE_KEY", SITE_KEYS[0]);
        vi.stubEnv("TURNSTILE_SECRET_KEY", SECRETS[0]);
        const { challengeSetup, challengeSiteKey } = await load();
        expect(challengeSetup()).toEqual({ ok: false, reason: "test keys on a hosted site" });
        expect(challengeSiteKey()).toBeUndefined();
      },
    );
  });
});

describe("isLocalHostname", () => {
  it.each([
    ["localhost", true],
    ["LOCALHOST", true],
    ["app.localhost", true],
    ["127.0.0.1", true],
    ["[::1]", true],
    ["::1", true],
    ["10.0.2.2", true],
    ["192.168.1.20", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["172.32.0.1", false],
    ["192.169.0.1", false],
    ["8.8.8.8", false],
    ["localhost.evil.example", false],
    ["evil-localhost", false],
    ["beautizzy.fr", false],
    ["", false],
  ])("%s → %s", async (hostname, local) => {
    const { isLocalHostname } = await load();
    expect(isLocalHostname(hostname)).toBe(local);
  });
});

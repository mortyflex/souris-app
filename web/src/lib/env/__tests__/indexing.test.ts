import { afterEach, describe, expect, it, vi } from "vitest";

import { isIndexableDeployment, isProductionSiteUrl, NOINDEX_HEADER, PRODUCTION_HOSTS } from "../production-hosts";
import { robotsRules, siteRobots } from "../indexing";

const PRODUCTION = "https://beautizzy.fr";
const NOT_PRODUCTION = [
  ["Staging", "https://staging.beautizzy.fr"],
  ["a Vercel preview", "https://beautizzy-web-git-feature-team.vercel.app"],
  ["local development", "http://localhost:3000"],
  ["no configuration", undefined],
  ["a blank value", "   "],
  ["a malformed value", "beautizzy.fr"],
  ["a look-alike host", "https://beautizzy.fr.example.com"],
  ["a sub-domain", "https://app.beautizzy.fr"],
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the production host rule", () => {
  it("recognises only the production website's hosts, whatever the case", () => {
    expect(PRODUCTION_HOSTS).toEqual(["beautizzy.fr", "www.beautizzy.fr"]);
    expect(isProductionSiteUrl(PRODUCTION)).toBe(true);
    expect(isProductionSiteUrl("https://www.beautizzy.fr/")).toBe(true);
    expect(isProductionSiteUrl("https://BeautIzzy.FR")).toBe(true);
  });

  it.each(NOT_PRODUCTION)("never takes %s for production", (_, url) => {
    expect(isProductionSiteUrl(url)).toBe(false);
  });
});

describe("robots.txt", () => {
  it("lets crawlers into the production website, never into the API", () => {
    expect(robotsRules(PRODUCTION)).toEqual({ rules: { userAgent: "*", allow: "/", disallow: "/api/" } });
  });

  it.each(NOT_PRODUCTION)("shuts every crawler out of %s", (_, url) => {
    expect(robotsRules(url)).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("is generated from the configured canonical origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://staging.beautizzy.fr");
    const { default: robots } = await import("@/app/robots");
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

describe("the robots meta of every page", () => {
  it("is absent on production (the default: index, follow)", () => {
    expect(siteRobots(PRODUCTION)).toBeUndefined();
  });

  it.each(NOT_PRODUCTION)("says noindex, nofollow on %s", (_, url) => {
    expect(siteRobots(url)).toEqual({ index: false, follow: false });
  });
});

describe("the X-Robots-Tag header (next.config.ts)", () => {
  async function headersFor(siteUrl: string | undefined, vercelEnv = "") {
    if (siteUrl === undefined) vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    else vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    vi.resetModules();
    const { default: config } = await import("../../../../next.config");
    return config.headers ? config.headers() : [];
  }

  it("is never sent by the production website", async () => {
    expect(await headersFor(PRODUCTION)).toEqual([]);
  });

  it.each(NOT_PRODUCTION)("is sent on every path of %s", async (_, url) => {
    expect(await headersFor(url)).toEqual([{ source: "/:path*", headers: [NOINDEX_HEADER] }]);
  });

  it.each(["preview", "development"])("is sent by a Vercel %s deployment even with the production origin", async (environment) => {
    expect(await headersFor(PRODUCTION, environment)).toEqual([{ source: "/:path*", headers: [NOINDEX_HEADER] }]);
  });

  it("is never sent by Vercel's Production environment of the production website", async () => {
    expect(await headersFor(PRODUCTION, "production")).toEqual([]);
  });

  it("says noindex, nofollow", () => {
    expect(NOINDEX_HEADER).toEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
  });
});

describe("Vercel environments (VERCEL_ENV, set by Vercel itself)", () => {
  it.each([
    ["production", true],
    ["", true], // off Vercel: the configured origin alone decides
    [undefined, true],
    ["preview", false],
    ["development", false],
    [" Preview ", false],
  ] as const)("with the production origin, %j is indexable: %s", (environment, indexable) => {
    expect(isIndexableDeployment(PRODUCTION, environment)).toBe(indexable);
    expect(siteRobots(PRODUCTION, environment) === undefined).toBe(indexable);
    expect(robotsRules(PRODUCTION, environment)).toEqual(
      indexable ? { rules: { userAgent: "*", allow: "/", disallow: "/api/" } } : { rules: { userAgent: "*", disallow: "/" } },
    );
  });

  it.each(NOT_PRODUCTION)("never makes %s indexable, even in Vercel's Production environment", (_, url) => {
    expect(isIndexableDeployment(url, "production")).toBe(false);
  });

  it("the robots meta and robots.txt read VERCEL_ENV from the deployment", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", PRODUCTION);
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.resetModules();
    const indexing = await import("../indexing");
    const { default: robots } = await import("@/app/robots");
    expect(indexing.siteRobots()).toEqual({ index: false, follow: false });
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

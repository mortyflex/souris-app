import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ANDROID_PACKAGE, STORES, storeAvailability, type StoreAvailability } from "@/lib/stores";

import { PendingPlatforms, StoreBadge, StoreBadges } from "../store-links";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const APPLE = "https://apps.apple.com/fr/app/beautizzy/id6700000000";
const GOOGLE = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

const CONFIGS: Record<string, StoreAvailability> = {
  none: storeAvailability({ appStore: { status: "pending" }, googlePlay: { status: "pending" } }),
  apple: storeAvailability({ appStore: { status: "public", url: APPLE }, googlePlay: { status: "pending" } }),
  google: storeAvailability({ appStore: { status: "pending" }, googlePlay: { status: "public", url: GOOGLE } }),
  both: storeAvailability({ appStore: { status: "public", url: APPLE }, googlePlay: { status: "public", url: GOOGLE } }),
};

/** The marketing header (desktop action + mobile menu), from one store configuration. */
async function header(availability: StoreAvailability, contactEmail = "") {
  vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", contactEmail);
  vi.resetModules();
  const { SiteHeader } = await import("@/components/layout/site-header");
  return renderToStaticMarkup(<SiteHeader variant="marketing" availability={availability} />);
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ");
const storeLinks = (html: string) =>
  [...html.matchAll(/<a href="(https:\/\/(?:apps\.apple\.com|play\.google\.com)[^"]*)"([^>]*)>/g)].map(([, href, rest]) => ({ href: href.replaceAll("&amp;", "&"), rest }));

describe("download actions in the header, from one store configuration", () => {
  it("pre-launch: no badge, no store link, an honest statement — never a pretend download button", async () => {
    const html = await header(CONFIGS.none!);
    expect(storeLinks(html)).toEqual([]);
    expect(html).not.toContain("/stores/");
    expect(text(html)).toContain("Bientôt pour iPhone et Android");
    expect(text(html)).toContain("Bientôt sur l’App Store et Google Play.");
    expect(html).not.toMatch(/<a [^>]*>Télécharger/);
  });

  it("pre-launch with a contact address: « Demander un accès » is the action, never « Télécharger »", async () => {
    const html = await header(CONFIGS.none!, "bonjour@example.test");
    expect(html).toContain("mailto:bonjour@example.test");
    expect(text(html)).not.toContain("Télécharger");
  });

  it.each([
    ["apple", [APPLE], "Bientôt sur Google Play."],
    ["google", [GOOGLE], "Bientôt sur l’App Store."],
    ["both", [APPLE, GOOGLE], undefined],
  ] as const)("%s public: the mobile menu links the official badge(s) to the listing(s) only, the rest still « Bientôt »", async (config, urls, sentence) => {
    const html = await header(CONFIGS[config]!, "bonjour@example.test");
    const links = storeLinks(html);
    expect(links.map((link) => link.href)).toEqual(urls);
    for (const link of links) {
      expect(link.rest).toContain('target="_blank"');
      expect(link.rest).toContain('rel="noopener noreferrer"');
    }
    if (sentence) expect(text(html)).toContain(sentence);
    else expect(text(html)).not.toContain("Bientôt");
    expect(html).toMatch(/<a [^>]*href="\/#telecharger"[^>]*>Télécharger<\/a>/);
  });

  it("no TestFlight or testing-track link can ever reach the page", async () => {
    const html = await header(
      storeAvailability({ appStore: { status: "public", url: "https://testflight.apple.com/join/AbCdEf12" }, googlePlay: { status: "public", url: "https://play.google.com/apps/internaltest/1" } }),
    );
    expect(html).not.toMatch(/testflight|internaltest/);
    expect(storeLinks(html)).toEqual([]);
  });
});

describe("the store components", () => {
  it("a badge is the official artwork, unchanged, named by store and platform, at the same visible height", () => {
    const both = CONFIGS.both!.available;
    const apple = renderToStaticMarkup(<StoreBadge store={both[0]!} height={48} />);
    const google = renderToStaticMarkup(<StoreBadge store={both[1]!} height={48} />);
    expect(apple).toContain('src="/stores/app-store-badge-fr.svg"');
    expect(apple).toContain('alt="Télécharger dans l’App Store — BeautIzzy pour iPhone (nouvel onglet)"');
    expect(apple).toMatch(/style="[^"]*height:48px/);
    expect(google).toContain('src="/stores/google-play-badge-fr.png"');
    expect(google).toContain('alt="Disponible sur Google Play — BeautIzzy pour Android (nouvel onglet)"');
    // Google's PNG carries its own clear space: drawn taller so both badges show the same height.
    expect(google).toMatch(/style="[^"]*height:63px/);
  });

  it("no store available: no badge list at all", () => {
    expect(renderToStaticMarkup(<StoreBadges stores={[]} />)).toBe("");
  });

  it("the platforms still to come are typographic tiles — no Apple logo, no Google Play triangle, nothing pressable", () => {
    const html = renderToStaticMarkup(<PendingPlatforms stores={CONFIGS.none!.pending} />);
    const tiles = html.match(/<li class="platform-tile[^"]*">[\s\S]*?<\/li>/g) ?? [];
    expect(tiles.map((tile) => text(tile).trim())).toEqual(["iPhone App Store", "Android Google Play"]);
    for (const tile of tiles) expect(tile).not.toMatch(/<svg|<img|<a |<button|hover:|cursor-pointer/);
    expect(renderToStaticMarkup(<PendingPlatforms stores={CONFIGS.both!.pending} />)).toBe("");
  });
});

describe("store badge compliance", () => {
  const STORE_DIR = path.join(__dirname, "../../../../public/stores");
  const OFFICIAL = Object.values(STORES).map((store) => store.badge.src);

  it("the publicly served store folder holds the official badges and nothing else (no custom or redrawn artwork)", () => {
    expect(readdirSync(STORE_DIR).sort()).toEqual(OFFICIAL.map((src) => path.basename(src)).sort());
  });

  it("the official artwork is byte-identical to what Apple and Google publish (downloaded 2026-11-16)", () => {
    const sha = (file: string) => createHash("sha256").update(readFileSync(path.join(STORE_DIR, file))).digest("hex");
    expect(sha("app-store-badge-fr.svg")).toBe("86b6a05f6c8ac9e9a0637edf4f15420d06c8c7bc69662792a46793c1f948b023");
    expect(sha("google-play-badge-fr.png")).toBe("57d0e69e021d5d08f1fcacfc44e6dd3c79f5d74627bfbc0f696a88f03fb06c4a");
  });

  it("in every configuration, every store image in the header is official artwork inside a link to the matching verified listing", async () => {
    const malformed = storeAvailability({ appStore: { status: "public", url: "https://testflight.apple.com/join/x" }, googlePlay: { status: "public", url: "" } });
    for (const [name, config] of [...Object.entries(CONFIGS), ["malformed", malformed] as const]) {
      const html = await header(config, "bonjour@example.test");
      const images = [...html.matchAll(/<img[^>]*src="(\/stores\/[^"]+)"/g)].map(([, src]) => src);
      const linked = [...html.matchAll(/<a href="([^"]+)"[^>]*><img[^>]*src="(\/stores\/[^"]+)"/g)].map(([, href, src]) => ({ href: href.replaceAll("&amp;", "&"), src }));
      expect(linked, name).toHaveLength(images.length); // never a badge without its link
      for (const { href, src } of linked) {
        expect(OFFICIAL).toContain(src);
        expect(href).toMatch(src === STORES.appStore.badge.src ? /^https:\/\/apps\.apple\.com\// : /^https:\/\/play\.google\.com\/store\/apps\/details\?/);
      }
      expect(images.length, name).toBeLessThanOrEqual(config.available.length);
    }
  });
});

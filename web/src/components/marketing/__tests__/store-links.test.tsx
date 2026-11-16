import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ANDROID_PACKAGE, STORES, storeAvailability, type StoreAvailability } from "@/lib/stores";

import { PendingPlatforms, StoreBadges } from "../store-links";

vi.mock("../screens", () => {
  const screen = (name: string) => ({
    image: { src: `/_next/static/media/${name}.webp`, width: 1206, height: 2622, blurDataURL: "data:image/webp;base64,AA==" },
    alt: `Capture ${name}`,
  });
  return { SCREENS: new Proxy({}, { get: (_target, name) => screen(String(name)) }) };
});

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

/** Hero, header, closing call, footer and FAQ, all from the SAME configuration. */
async function render(availability: StoreAvailability, contactEmail = "") {
  vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", contactEmail);
  vi.resetModules();
  const { Hero } = await import("../hero");
  const { SiteHeader } = await import("@/components/layout/site-header");
  const { FinalCta } = await import("../final-cta");
  const { SiteFooter } = await import("../site-footer");
  const { FaqSection } = await import("../faq-section");
  const part = (node: React.ReactElement) => renderToStaticMarkup(node);
  return {
    hero: part(<Hero availability={availability} />),
    header: part(<SiteHeader variant="marketing" availability={availability} />),
    final: part(<FinalCta availability={availability} />),
    footer: part(<SiteFooter availability={availability} />),
    faq: part(<FaqSection availability={availability} />),
  };
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&amp;", "&").replace(/\s+/g, " ");
const storeLinks = (html: string) => [...html.matchAll(/<a href="(https:\/\/(?:apps\.apple\.com|play\.google\.com)[^"]*)"([^>]*)>/g)].map(([, href, rest]) => ({ href: href.replaceAll("&amp;", "&"), rest }));

describe("download actions, from one store configuration", () => {
  it("pre-launch: no badge and no store link anywhere; every place says « Bientôt »", async () => {
    const page = await render(CONFIGS.none!);
    for (const html of Object.values(page)) {
      expect(storeLinks(html)).toEqual([]);
      expect(html).not.toContain("/stores/");
    }
    for (const html of [page.hero, page.final, page.footer]) expect(text(html)).toContain("Bientôt sur l’App Store et Google Play.");
    expect(text(page.faq)).toContain("Elle n’y est pas encore publiée");
    expect(text(page.header)).toContain("Bientôt pour iPhone et Android"); // a statement, not a button
    expect(page.header).not.toMatch(/<a [^>]*>Télécharger/);
  });

  it("pre-launch with a contact address: « Demander un accès » is the action, never « Télécharger »", async () => {
    const page = await render(CONFIGS.none!, "bonjour@example.test");
    expect(page.hero).toContain("mailto:bonjour@example.test");
    expect(page.header).toContain("mailto:bonjour@example.test");
    expect(text(page.header)).not.toContain("Télécharger");
  });

  it.each([
    ["apple", [APPLE], "Bientôt sur Google Play."],
    ["google", [GOOGLE], "Bientôt sur l’App Store."],
    ["both", [APPLE, GOOGLE], undefined],
  ] as const)("%s public: the official badge(s), linking to the listing(s) only, the rest still « Bientôt »", async (config, urls, sentence) => {
    const page = await render(CONFIGS[config]!, "bonjour@example.test");
    for (const html of [page.hero, page.final, page.footer]) {
      const links = storeLinks(html);
      expect(links.map((link) => link.href)).toEqual(urls);
      for (const link of links) {
        expect(link.rest).toContain('target="_blank"');
        expect(link.rest).toContain('rel="noopener noreferrer"');
      }
      if (sentence) expect(text(html)).toContain(sentence);
      else expect(text(html)).not.toContain("Bientôt");
    }
    // The header points to the closing call, which carries the badges; no contact action once downloadable.
    expect(page.header).toMatch(/<a [^>]*href="\/#telecharger"[^>]*>Télécharger<\/a>/);
    expect(page.final).toContain('id="telecharger"');
    expect(page.hero).not.toContain("Demander un accès");
  });

  it("the badges are the official artwork, unchanged, with an accessible name naming store and platform", async () => {
    const page = await render(CONFIGS.both!);
    expect(page.hero).toContain('src="/stores/app-store-badge-fr.svg"');
    expect(page.hero).toContain('src="/stores/google-play-badge-fr.png"');
    expect(page.hero).toContain('alt="Télécharger dans l’App Store — BeautIzzy pour iPhone (nouvel onglet)"');
    expect(page.hero).toContain('alt="Disponible sur Google Play — BeautIzzy pour Android (nouvel onglet)"');
    // Google's PNG carries its own clear space: drawn taller so both badges show the same height.
    const img = (file: string) => page.hero.match(new RegExp(`<img[^>]*src="/stores/${file}"[^>]*>`))?.[0] ?? "";
    expect(img("app-store-badge-fr.svg")).toMatch(/style="[^"]*height:48px/);
    expect(img("google-play-badge-fr.png")).toMatch(/style="[^"]*height:63px/);
  });

  it("no TestFlight or testing-track link can ever reach the page", async () => {
    const page = await render(
      storeAvailability({ appStore: { status: "public", url: "https://testflight.apple.com/join/AbCdEf12" }, googlePlay: { status: "public", url: "https://play.google.com/apps/internaltest/1" } }),
    );
    for (const html of Object.values(page)) {
      expect(html).not.toMatch(/testflight|internaltest/);
      expect(storeLinks(html)).toEqual([]);
    }
  });

  it("the hero no longer offers « Découvrir l’application »: availability is the action", async () => {
    const page = await render(CONFIGS.none!);
    expect(text(page.hero)).not.toContain("Découvrir l’application");
    expect(text(page.hero)).toContain("application mobile pour iPhone et Android");
  });
});

describe("platform identification before launch", () => {
  it("names the platforms in typographic tiles — no Apple logo, no Google Play triangle, no pressable look", async () => {
    const page = await render(CONFIGS.none!);
    for (const html of [page.hero, page.final, page.footer]) {
      const tiles = html.match(/<li class="platform-tile[^"]*">[\s\S]*?<\/li>/g) ?? [];
      expect(tiles.map((tile) => text(tile).trim())).toEqual(["iPhone App Store", "Android Google Play"]);
      for (const tile of tiles) {
        expect(tile).not.toMatch(/<svg|<img|<a |<button|hover:|cursor-pointer/);
      }
    }
  });

  it("only the platforms still pending get a tile", async () => {
    const page = await render(CONFIGS.apple!);
    const tiles = page.hero.match(/<li class="platform-tile[^"]*">[\s\S]*?<\/li>/g) ?? [];
    expect(tiles.map((tile) => text(tile).trim())).toEqual(["Android Google Play"]);
  });

  it("the footer carries the trademark notice the guidelines ask for, matching what is shown", async () => {
    expect(text((await render(CONFIGS.none!)).footer)).toContain(
      "iPhone est une marque d’Apple Inc., déposée aux États-Unis et dans d’autres pays. App Store est une marque de service d’Apple Inc. Android et Google Play sont des marques de Google LLC.",
    );
    const both = text((await render(CONFIGS.both!)).footer);
    expect(both).toContain("Apple, le logo Apple et iPhone sont des marques d’Apple Inc.");
    expect(both).toContain("Android, Google Play et le logo Google Play sont des marques de Google LLC.");
  });
});

describe("the store components, on their own", () => {
  it("no store available: no badge list at all", () => {
    expect(renderToStaticMarkup(<StoreBadges stores={[]} />)).toBe("");
  });

  it("nothing pending: no platform tiles and no « Bientôt » at all", () => {
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

  it("in every configuration, every store image is official artwork inside a link to the matching verified listing", async () => {
    const malformed = storeAvailability({ appStore: { status: "public", url: "https://testflight.apple.com/join/x" }, googlePlay: { status: "public", url: "" } });
    for (const [name, config] of [...Object.entries(CONFIGS), ["malformed", malformed] as const]) {
      const page = await render(config, "bonjour@example.test");
      for (const html of Object.values(page)) {
        const images = [...html.matchAll(/<img[^>]*src="(\/stores\/[^"]+)"/g)].map(([, src]) => src);
        const linked = [...html.matchAll(/<a href="([^"]+)"[^>]*><img[^>]*src="(\/stores\/[^"]+)"/g)].map(([, href, src]) => ({ href: href.replaceAll("&amp;", "&"), src }));
        expect(linked, name).toHaveLength(images.length); // never a badge without its link
        for (const { href, src } of linked) {
          expect(OFFICIAL).toContain(src);
          expect(href).toMatch(src === STORES.appStore.badge.src ? /^https:\/\/apps\.apple\.com\// : /^https:\/\/play\.google\.com\/store\/apps\/details\?/);
        }
        expect(images.length, name).toBeLessThanOrEqual(config.available.length);
      }
    }
  });

  it("before launch, availability is said in words only: no store image, no store link, no download wording", async () => {
    const page = await render(CONFIGS.none!, "bonjour@example.test");
    for (const html of Object.values(page)) {
      expect(html).not.toContain("/stores/");
      expect(text(html)).not.toMatch(/Télécharger dans|Disponible sur Google Play|Disponible sur l’App Store/);
    }
  });
});

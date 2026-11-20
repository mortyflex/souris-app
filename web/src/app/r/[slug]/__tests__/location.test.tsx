import { generateKeyPairSync, verify } from "node:crypto";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The request of each test: its headers, or none at all (a render outside a request).
const request = vi.hoisted(() => ({ headers: undefined as Headers | undefined }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (request.headers === undefined) throw new Error("`headers` was called outside a request scope");
    return request.headers;
  },
}));

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15";

const DESTINATION = "12%20avenue%20Jean%20Jaur%C3%A8s%2C%2069007%20Lyon";
const APPLE = `href="https://maps.apple.com/directions?destination=${DESTINATION}"`;
const GOOGLE = `href="https://www.google.com/maps/dir/?api=1&amp;destination=${DESTINATION}"`;
/** iPadOS Safari asking for desktop websites (its default): a Mac to the server. */
const IPAD_AS_MAC = MAC;
const ANDROID_DESKTOP_SITE = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";

const FULL = {
  visibility: "FULL_ADDRESS",
  street: "12 avenue Jean Jaurès",
  postal_code: "69007",
  city: "Lyon",
  directions_destination: "12 avenue Jean Jaurès, 69007 Lyon",
};
const CITY = { visibility: "CITY_ONLY", city: "Lyon" };
/** The public answer of a page (20261020120000 applied), at the level its professional chose. */
const page = (location: unknown, address: string | null = null) => ({
  slug: "chez-amelie",
  name: "Chez Amélie",
  description: "Coiffure sur rendez-vous.",
  phone: null,
  email: null,
  address,
  location,
  booking_enabled: true,
  time_zone: "Europe/Paris",
});
const fullPage = page(FULL, "12 avenue Jean Jaurès\n69007 Lyon");
/** A database that predates the contract: no `location` key, the raw legacy text in `address`. */
const legacyPage = { slug: "chez-amelie", name: "Chez Amélie", address: "8 rue des Lilas\n69001 Lyon", booking_enabled: true };

const choose = {
  time_zone: "Europe/Paris",
  slot_minutes: 15,
  first_date: "2026-11-16",
  last_date: "2026-12-15",
  services: [{ id: "svc-coupe", name: "Coupe", duration_minutes: 45 }],
  status: "CHOOSE_SERVICE",
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
/** The profile, then (booking page) the multi-service read — absent on this server — and the single-service read. */
function serve(profile: unknown) {
  const fetchMock = vi.fn(async (url: string) => {
    const name = String(url);
    if (name.endsWith("online_booking_public_profile")) return respond(profile);
    if (name.endsWith("online_booking_public_selection_availability")) return respond({ code: "PGRST202", message: "Could not find the function" }, 404);
    return respond(choose);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function load() {
  vi.resetModules();
  const [profilePage, bookingPage] = await Promise.all([import("../page"), import("../reserver/page")]);
  return { profilePage, bookingPage };
}
const props = (slug = "chez-amelie") => ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) });
const visit = (userAgent: string | undefined, more: Record<string, string> = {}) => {
  request.headers = new Headers({ ...(userAgent !== undefined ? { "user-agent": userAgent } : {}), ...more });
};
async function profileHtml(profile: unknown) {
  serve(profile);
  const { profilePage } = await load();
  return renderToStaticMarkup(await profilePage.default(props()));
}
const count = (html: string, text: string) => html.split(text).length - 1;
/** The page's own content — the site header (its logo) and the footer left out. */
const mainOf = (html: string) => html.slice(html.indexOf("<main"), html.indexOf("</main>"));

/** The `professional` the booking page hands to the flow. */
function findProfessional(node: unknown): { name: string; location?: unknown } | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProfessional(child);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== "object" || node === null || !("props" in node)) return undefined;
  const element = node as ReactElement<{ professional?: { name: string; location?: unknown }; children?: unknown }>;
  return element.props.professional ?? findProfessional(element.props.children);
}
async function bookingProfessional(profile: unknown) {
  serve(profile);
  const { bookingPage } = await load();
  return findProfessional(await bookingPage.default(props()));
}

// A FICTIONAL signing identity, generated for this run.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
function configureMaps() {
  vi.stubEnv("APPLE_MAPS_TEAM_ID", "A1B2C3D4E5");
  vi.stubEnv("APPLE_MAPS_KEY_ID", "Z9Y8X7W6V5");
  vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", PEM);
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ref.supabase.co");
  vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_value");
  for (const name of ["APPLE_MAPS_TEAM_ID", "APPLE_MAPS_KEY_ID", "APPLE_MAPS_PRIVATE_KEY"]) vi.stubEnv(name, "");
  visit(IPHONE);
});

afterEach(() => {
  request.headers = undefined;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/r/[slug] — the location, at the level the server applied", () => {
  it("a complete published address: its lines, « Itinéraire » and the map vignette — nothing under the map", async () => {
    const html = await profileHtml(fullPage);

    expect(html).toContain('data-location="address"');
    expect(html).toContain('<span class="block">12 avenue Jean Jaurès</span><span class="block">69007 Lyon</span>');
    expect(html).toContain("Itinéraire</a>");
    expect(count(html, 'id="profile-place-lilac"')).toBe(1);
    expect(html).not.toMatch(/Ouvrir dans|data-directions-secondary/);
  });

  it("a published city: the city under « Lieu » — no street, no postal code, no destination, no link to a map", async () => {
    // The owner still stores a street and a postal code: the server does not send them, and nothing invents them.
    const html = await profileHtml(page(CITY));

    expect(html).toContain('data-location="city"');
    expect(html).toMatch(/<dt[^>]*>Lieu<\/dt>/);
    expect(html).toMatch(/<dd[^>]*>Lyon<\/dd>/);
    expect(html).not.toMatch(/Jaurès|69007|maps\.apple|google\.com\/maps|Itinéraire|destination|data-directions/);
  });

  it("a hidden location, or one never chosen (the server answers the same null): no place at all", async () => {
    const html = await profileHtml(page(null));

    expect(html).toContain("Chez Amélie");
    expect(html).not.toMatch(/data-location|Adresse|Lieu|Lyon|maps\.|Itinéraire|apple-mapkit|profile-place/);
  });

  it("a database that predates the contract: its RAW legacy address is never shown — no fallback to `address`", async () => {
    const html = await profileHtml(legacyPage);

    expect(html).toContain("Chez Amélie");
    expect(html).not.toMatch(/Lilas|69001|Lyon|data-location|Adresse|maps\.|Itinéraire/);
  });

  it("never shows more than `location` says, whatever `address` carries beside it", async () => {
    const html = await profileHtml(page(CITY, "9 rue Secrète\n69007 Lyon"));
    expect(html).not.toMatch(/Secrète|69007/);
    expect(html).toMatch(/<dd[^>]*>Lyon<\/dd>/);
  });

  it("a location the website cannot read is no location: the page stays online, without a place", async () => {
    for (const location of [{ ...FULL, latitude: 45.74 }, { visibility: "CITY_ONLY", city: "Lyon", street: "12 avenue Jean Jaurès" }, "Lyon", { visibility: "HIDDEN" }]) {
      const html = await profileHtml(page(location));
      expect(html).toContain("Chez Amélie");
      expect(html).not.toMatch(/data-location|Jaurès|Itinéraire/);
    }
  });

  it("the page's metadata never carries the location, at any level", async () => {
    for (const profile of [fullPage, page(CITY), page(null), legacyPage]) {
      serve(profile);
      const { profilePage } = await load();
      const metadata = await profilePage.generateMetadata(props());
      expect(JSON.stringify(metadata)).not.toMatch(/Jaurès|69007|Lyon|Lilas|69001|maps\./);
    }
  });

  it("carries no structured data, no coordinates and no map script", async () => {
    const html = await profileHtml(fullPage);
    expect(html).not.toMatch(/application\/ld\+json|schema\.org|geo:|latitude|longitude|<script|<iframe|mapkit\.js|maps\.googleapis/i);
  });
});

describe("directions — what « Itinéraire » and the map open, for the visitor's platform", () => {
  /** The map and « Itinéraire » of a page: how many links lead to each application. */
  const links = (html: string) => [count(html, APPLE), count(html, GOOGLE)];

  it("an iPhone: « Itinéraire » and the map are the Apple Plans link the chooser takes over in the browser — Google Maps waits in it", async () => {
    visit(IPHONE);
    const html = await profileHtml(fullPage);
    expect(links(html)).toEqual([2, 0]);
    expect(html).toMatch(/data-provider="apple"[^>]*>(<svg[\s\S]*?<\/svg>)?Itinéraire<\/a>/);
    // The chooser's list is the browser's to draw once tapped: nothing of it in the server's page.
    expect(html).not.toMatch(/<dialog|Ouvrir avec/);
  });

  it("an iPad presenting itself as a Mac, and a Mac: Apple Plans — the browser alone tells the iPad by its touch screen", async () => {
    visit(IPAD_AS_MAC);
    expect(links(await profileHtml(fullPage))).toEqual([2, 0]);
  });

  it("an Android phone: Google Maps, directly — NEVER Apple Plans", async () => {
    visit(ANDROID);
    const html = await profileHtml(fullPage);
    expect(links(html)).toEqual([0, 2]);
    expect(html).not.toMatch(/maps\.apple\.com|Apple Plans|data-provider="apple"/);
  });

  it("Android in « desktop site » mode: its platform hint still says Android — Google Maps, directly", async () => {
    visit(ANDROID_DESKTOP_SITE, { "sec-ch-ua-platform": '"Android"' });
    expect(links(await profileHtml(fullPage))).toEqual([0, 2]);
  });

  it("Windows and Linux desktops: Google Maps, directly — never Apple Plans", async () => {
    for (const userAgent of [WINDOWS, LINUX]) {
      visit(userAgent);
      const html = await profileHtml(fullPage);
      expect(links(html)).toEqual([0, 2]);
      expect(html).not.toMatch(/maps\.apple\.com|Apple Plans/);
    }
  });

  it("trusts the browser's platform hint over its user agent", async () => {
    visit(WINDOWS, { "sec-ch-ua-platform": '"macOS"' });
    expect(links(await profileHtml(fullPage))).toEqual([2, 0]);
  });

  it("an unknown platform, no user agent, or no request at all: Google Maps, which opens in any browser", async () => {
    for (const setup of [() => visit("curl/8.7.1"), () => visit(undefined), () => (request.headers = undefined)]) {
      setup();
      const html = await profileHtml(fullPage);
      expect(links(html)).toEqual([0, 2]);
      expect(html).toContain("Itinéraire</a>");
    }
  });

  it("no platform shows Waze, nor a second link under the map", async () => {
    for (const userAgent of [IPHONE, MAC, ANDROID, WINDOWS, LINUX, undefined]) {
      visit(userAgent);
      const html = await profileHtml(fullPage);
      expect(html).not.toMatch(/waze|Ouvrir dans|data-directions-secondary/i);
    }
  });

  it("a page without a published address never reads the request: nothing about the visitor is needed", async () => {
    let read = 0;
    request.headers = new Proxy(new Headers({ "user-agent": IPHONE }), {
      get(target, key, receiver) {
        if (key === "get") read += 1;
        const value = Reflect.get(target, key, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await profileHtml(page(null));
    await profileHtml(legacyPage);
    expect(read).toBe(0);
  });

  it("works without any map: the directions never depend on the image", async () => {
    const html = await profileHtml(fullPage);
    expect(mainOf(html)).not.toContain("<img");
    expect(html).not.toContain("apple-mapkit");
    expect(html).toContain("Itinéraire</a>");
    expect(count(html, APPLE)).toBe(2);
  });
});

describe("the map — an Apple Maps snapshot when this deployment can sign one", () => {
  const imageOf = (html: string) => (html.match(/<img [^>]*src="(https:\/\/snapshot\.apple-mapkit\.com[^"]*)"/)?.[1] ?? "").replace(/&amp;/g, "&");

  it("without credentials — every environment today: the Nacre artwork, no request to Apple, no claim of a map", async () => {
    for (const profile of [fullPage, page(CITY)]) {
      const html = await profileHtml(profile);
      expect(mainOf(html)).not.toContain("<img");
      expect(html).not.toMatch(/apple-mapkit|Plan : Apple Plans|data-map-credit/);
      expect(html).toContain("profile-place-lilac");
    }
  });

  it("with credentials: a signed URL the visitor's browser asks Apple for — verified with the public key", async () => {
    configureMaps();
    const html = await profileHtml(fullPage);
    const url = imageOf(html);

    expect(url.startsWith("https://snapshot.apple-mapkit.com/api/v1/snapshot?center=12%20avenue%20Jean%20Jaur%C3%A8s%2C%2069007%20Lyon&")).toBe(true);
    const at = url.lastIndexOf("&signature=");
    const signed = url.slice("https://snapshot.apple-mapkit.com".length, at);
    const signature = Buffer.from(url.slice(at + "&signature=".length), "base64url");
    expect(verify("sha256", Buffer.from(signed, "utf8"), { key: publicKey, dsaEncoding: "ieee-p1363" }, signature)).toBe(true);
    // Apple's own marks on the image are the map's attribution: no caption of the page's own.
    expect(html).not.toMatch(/Plan : Apple Plans|data-map-credit/);
    // The artwork stays underneath, and the directions stay links of their own.
    expect(html).toContain("profile-place-lilac");
    expect(count(html, APPLE)).toBe(2);
  });

  it("a city: a town-level map of the CITY NAME, with no marker — and never the private street or postal code", async () => {
    configureMaps();
    const parameters = new URL(imageOf(await profileHtml(page(CITY, null)))).searchParams;
    expect(parameters.get("center")).toBe("Lyon");
    expect(parameters.get("z")).toBe("11");
    expect(parameters.has("annotations")).toBe(false);
  });

  it("a page that publishes no place signs nothing and asks Apple for nothing", async () => {
    configureMaps();
    for (const profile of [page(null), legacyPage]) {
      const html = await profileHtml(profile);
      expect(mainOf(html)).not.toContain("<img");
      expect(html).not.toMatch(/apple-mapkit|signature=|data-location-map/);
    }
  });

  it("never sends the signing key, nor the Supabase secret, to a page", async () => {
    configureMaps();
    const html = await profileHtml(fullPage);
    const body = PEM.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
    expect(html).not.toContain("PRIVATE KEY");
    for (let index = 0; index + 16 <= body.length; index += 16) expect(html).not.toContain(body.slice(index, index + 16));
    expect(html).not.toContain("sb_secret");
  });

  it("a malformed credential: no map, and the page — address and directions — is exactly as without one", async () => {
    const plain = await profileHtml(fullPage);
    configureMaps();
    vi.stubEnv("APPLE_MAPS_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----\nbroken\n-----END PRIVATE KEY-----");
    expect(await profileHtml(fullPage)).toBe(plain);
  });

  it("the server never downloads the image itself: only the profile is fetched", async () => {
    configureMaps();
    const fetchMock = serve(fullPage);
    const { profilePage } = await load();
    renderToStaticMarkup(await profilePage.default(props()));
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["https://ref.supabase.co/rest/v1/rpc/online_booking_public_profile"]);
  });
});

describe("/r/[slug]/reserver — the booking flow receives the SAME location, and nothing more", () => {
  beforeEach(() => {
    vi.stubEnv("ONLINE_BOOKING_WEB_BOOKING", "enabled");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("TURNSTILE_SITE_KEY", "0x4AAAAAAAsiteKeyOfTheTests");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "0x4AAAAAAAsecretKeyOfTheTests00000");
  });

  it("a complete published address: its lines and the directions of this visitor's platform (Android: Google Maps alone)", async () => {
    visit(ANDROID);
    const professional = await bookingProfessional(fullPage);
    expect(professional).toEqual({
      name: "Chez Amélie",
      location: {
        kind: "address",
        lines: ["12 avenue Jean Jaurès", "69007 Lyon"],
        spoken: "12 avenue Jean Jaurès, 69007 Lyon",
        directions: {
          primary: { provider: "google", providerName: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}` },
        },
      },
    });
  });

  it("an iPhone: the flow receives Apple Plans and the chooser's two applications — as plain data", async () => {
    visit(IPHONE);
    const professional = await bookingProfessional(fullPage);
    const apple = { provider: "apple", providerName: "Apple Plans", url: `https://maps.apple.com/directions?destination=${DESTINATION}` };
    const google = { provider: "google", providerName: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}` };
    expect(professional?.location).toEqual({
      kind: "address",
      lines: ["12 avenue Jean Jaurès", "69007 Lyon"],
      spoken: "12 avenue Jean Jaurès, 69007 Lyon",
      directions: { primary: apple, chooser: { links: [apple, google], offer: "always" } },
    });
    expect(JSON.parse(JSON.stringify(professional))).toEqual(professional);
  });

  it("a published city: the city — the flow never receives a street, a postal code or a destination", async () => {
    const professional = await bookingProfessional(page(CITY, null));
    expect(professional?.location).toEqual({ kind: "city", city: "Lyon" });
    expect(JSON.stringify(professional)).not.toMatch(/Jaurès|69007|maps\.|destination/);
  });

  it("a hidden location, one never chosen, or a legacy address: the flow receives NO location", async () => {
    for (const profile of [page(null), legacyPage, page({ visibility: "HIDDEN" })]) {
      const professional = await bookingProfessional(profile);
      expect(professional).toEqual({ name: "Chez Amélie" });
      expect(JSON.stringify(professional)).not.toMatch(/Lilas|69001|Lyon|address/);
    }
  });

  it("what the flow receives is plain data: nothing of the server crosses with it", async () => {
    configureMaps();
    const professional = await bookingProfessional(fullPage);
    expect(JSON.parse(JSON.stringify(professional))).toEqual(professional);
    expect(JSON.stringify(professional)).not.toMatch(/PRIVATE KEY|sb_secret|teamId=(?!A1B2C3D4E5)/);
  });

  it("the first screen of the flow shows the services — unchanged by the location", async () => {
    serve(fullPage);
    const { bookingPage } = await load();
    const html = renderToStaticMarkup(await bookingPage.default(props()));
    expect(html).toContain("Choisissez une prestation");
    expect(html).toContain("Coupe");
    expect(html).toContain("Étape 1 sur 4");
  });
});

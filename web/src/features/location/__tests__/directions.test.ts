import { describe, expect, it } from "vitest";

import {
  appleDirectionsUrl,
  directionsLinks,
  googleDirectionsUrl,
  MAX_DIRECTIONS_URL_LENGTH,
  preferredMapsProvider,
} from "../directions";

const DESTINATION = "12 avenue Jean Jaurès, 69007 Lyon";
const ENCODED = "12%20avenue%20Jean%20Jaur%C3%A8s%2C%2069007%20Lyon";

// Real-world user agents (abridged where the version does not matter).
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // iPadOS asks for desktop websites by default: it presents itself as a Mac.
  ipadDesktopClass:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  // A phone without Google services: Google Maps still opens in its browser.
  huawei: "Mozilla/5.0 (Linux; Android 12; ANA-NX9; HMSCore 6.13.0.321) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/15.0.4.312 Mobile Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  chromeOs: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  // Old Windows Phones named both platforms.
  windowsPhone: "Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0 Mobile Safari/537.36 Edge/15.15254",
  bot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  curl: "curl/8.7.1",
};

describe("Apple Plans — unified Maps URLs", () => {
  it("builds https://maps.apple.com/directions with the destination percent-encoded", () => {
    expect(appleDirectionsUrl(DESTINATION)).toBe(`https://maps.apple.com/directions?destination=${ENCODED}`);
  });

  it("sends no origin, no travel mode, no coordinates: Plans starts from where the visitor is", () => {
    const url = new URL(appleDirectionsUrl(DESTINATION) ?? "");
    expect([...url.searchParams.keys()]).toEqual(["destination"]);
    expect(url.searchParams.get("destination")).toBe(DESTINATION);
    expect(url.origin + url.pathname).toBe("https://maps.apple.com/directions");
  });
});

describe("Google Maps — Maps URLs", () => {
  it("builds https://www.google.com/maps/dir/?api=1 with the destination percent-encoded (commas as %2C)", () => {
    expect(googleDirectionsUrl(DESTINATION)).toBe(`https://www.google.com/maps/dir/?api=1&destination=${ENCODED}`);
  });

  it("always carries api=1 — without it Google ignores every parameter — and nothing but the destination", () => {
    const url = new URL(googleDirectionsUrl(DESTINATION) ?? "");
    expect([...url.searchParams.keys()]).toEqual(["api", "destination"]);
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe(DESTINATION);
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/");
  });
});

describe("encoding — a destination can never become another parameter, another host or a script", () => {
  it.each([
    ["an ampersand", "Salon Léa & Co, 3 rue de l’Église, 75001 Paris"],
    ["a question mark and a hash", "Porte ? #2, 1 rue Neuve, 13002 Marseille"],
    ["an equals sign and a plus", "Bât. A=B + C, 10 rue Haute, 1000 Bruxelles"],
    ["a slash and a backslash", "1/2 rue du Port \\ Quai, 17000 La Rochelle"],
    ["a percent sign", "100% Beauté, 2 rue Basse, 59000 Lille"],
    ["an attempt at a second parameter", "x&destination=evil&dir_action=navigate, 75001 Paris"],
    ["an attempt at a URL", "https://evil.example/?q=, 75001 Paris"],
    ["quotes and angle brackets", `"><script>alert(1)</script>, 75001 Paris`],
    ["non-Latin letters", "東京都渋谷区 1-2-3, 150-0002 東京"],
    ["an emoji", "🌸 Institut, 4 rue des Fleurs, 31000 Toulouse"],
  ])("%s survives as ONE destination value", (_label, destination) => {
    for (const build of [appleDirectionsUrl, googleDirectionsUrl]) {
      const built = build(destination);
      expect(built).toBeDefined();
      const url = new URL(built ?? "");
      expect(url.searchParams.get("destination")).toBe(destination);
      expect(url.searchParams.getAll("destination")).toHaveLength(1);
      expect(["maps.apple.com", "www.google.com"]).toContain(url.hostname);
      expect(url.protocol).toBe("https:");
      // Nothing of the destination leaves the query.
      expect(built).not.toMatch(/[<>"\\ ]/);
      expect(url.hash).toBe("");
    }
  });

  it("builds nothing from a text that is not a plain single line", () => {
    for (const destination of ["", " ", "a\nb", `a${String.fromCharCode(0x202e)}b`, " padded", "x".repeat(321)]) {
      expect(appleDirectionsUrl(destination)).toBeUndefined();
      expect(googleDirectionsUrl(destination)).toBeUndefined();
      expect(directionsLinks(destination)).toBeUndefined();
    }
  });

  it("builds nothing beyond the documented URL limit (2 048 characters), rather than a link that breaks", () => {
    // 300 four-byte characters: 3 600 characters once percent-encoded.
    const long = "🌸".repeat(300);
    expect(encodeURIComponent(long).length).toBeGreaterThan(MAX_DIRECTIONS_URL_LENGTH);
    expect(appleDirectionsUrl(long)).toBeUndefined();
    expect(googleDirectionsUrl(long)).toBeUndefined();
    expect(directionsLinks(long)).toBeUndefined();
    // A long but realistic address stays well within it.
    expect((googleDirectionsUrl(`${"Résidence des Tilleuls ".repeat(8)}, 69007 Lyon`) ?? "").length).toBeLessThan(MAX_DIRECTIONS_URL_LENGTH);
  });
});

describe("the visitor's probable maps application", () => {
  it.each([
    ["an iPhone (Safari)", UA.iphoneSafari],
    ["an iPhone (Chrome)", UA.iphoneChrome],
    ["an iPad", UA.ipadSafari],
    ["an iPad asking for desktop websites", UA.ipadDesktopClass],
    ["a Mac (Safari)", UA.macSafari],
    ["a Mac (Chrome)", UA.macChrome],
  ])("%s → Apple Plans", (_label, userAgent) => {
    expect(preferredMapsProvider({ userAgent })).toBe("apple");
  });

  it.each([
    ["an Android phone (Chrome)", UA.androidChrome],
    ["an Android phone (Firefox)", UA.androidFirefox],
    ["an Android tablet", UA.androidTablet],
    ["an Android phone without Google services", UA.huawei],
    ["a device that names both Android and iPhone", UA.windowsPhone],
  ])("%s → Google Maps", (_label, userAgent) => {
    expect(preferredMapsProvider({ userAgent })).toBe("google");
  });

  it.each([
    ["Windows (Edge)", UA.windowsEdge],
    ["Windows (Firefox)", UA.windowsFirefox],
    ["Linux", UA.linuxFirefox],
    ["ChromeOS", UA.chromeOs],
    ["a crawler", UA.bot],
    ["a command-line client", UA.curl],
    ["an empty user agent", ""],
    ["no user agent at all", undefined],
    ["a null user agent", null],
    ["nonsense", "\u0000\u0001 ???"],
  ])("%s → Google Maps, whose website opens in any browser", (_label, userAgent) => {
    expect(preferredMapsProvider({ userAgent })).toBe("google");
  });

  it("with no request at all, the universal default", () => {
    expect(preferredMapsProvider()).toBe("google");
  });

  it("trusts the platform client hint over the user agent when a browser sends one", () => {
    // Chrome on Android asking for the desktop site presents a Linux desktop user agent.
    expect(preferredMapsProvider({ userAgent: UA.linuxFirefox, platformHint: '"Android"' })).toBe("google");
    expect(preferredMapsProvider({ userAgent: UA.windowsEdge, platformHint: '"macOS"' })).toBe("apple");
    expect(preferredMapsProvider({ userAgent: UA.macChrome, platformHint: '"Windows"' })).toBe("google");
    expect(preferredMapsProvider({ userAgent: UA.windowsEdge, platformHint: '"iOS"' })).toBe("apple");
    expect(preferredMapsProvider({ userAgent: UA.macChrome, platformHint: '"Chrome OS"' })).toBe("google");
    expect(preferredMapsProvider({ userAgent: UA.macChrome, platformHint: '"Linux"' })).toBe("google");
    // A hint it does not know decides nothing: the user agent does.
    expect(preferredMapsProvider({ userAgent: UA.iphoneSafari, platformHint: '"Unknown"' })).toBe("apple");
    expect(preferredMapsProvider({ userAgent: UA.iphoneSafari, platformHint: "" })).toBe("apple");
  });
});

describe("directionsLinks — the probable application first, the other one always beside it", () => {
  it("an Apple device: « Itinéraire » opens Plans, Google Maps is the alternative", () => {
    expect(directionsLinks(DESTINATION, { userAgent: UA.iphoneSafari })).toEqual({
      primary: { provider: "apple", providerName: "Plans", url: `https://maps.apple.com/directions?destination=${ENCODED}` },
      alternative: { provider: "google", providerName: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${ENCODED}` },
    });
  });

  it("an Android device: « Itinéraire » opens Google Maps, Plans is the alternative", () => {
    const links = directionsLinks(DESTINATION, { userAgent: UA.androidChrome });
    expect(links?.primary.provider).toBe("google");
    expect(links?.alternative?.provider).toBe("apple");
  });

  it("a desktop that is not a Mac, or an unknown platform: a link that works in any browser, and the alternative", () => {
    for (const userAgent of [UA.windowsEdge, UA.linuxFirefox, UA.bot, undefined]) {
      const links = directionsLinks(DESTINATION, { userAgent });
      expect(links?.primary.url).toBe(`https://www.google.com/maps/dir/?api=1&destination=${ENCODED}`);
      expect(links?.alternative?.url).toBe(`https://maps.apple.com/directions?destination=${ENCODED}`);
    }
  });

  it("both links lead to the SAME destination, whatever the platform", () => {
    for (const userAgent of Object.values(UA)) {
      const links = directionsLinks(DESTINATION, { userAgent });
      const destinations = [links?.primary.url, links?.alternative?.url].map((url) => new URL(url ?? "").searchParams.get("destination"));
      expect(destinations).toEqual([DESTINATION, DESTINATION]);
    }
  });

  it("never carries the visitor's position, nor asks a maps service for one", () => {
    const text = JSON.stringify(directionsLinks(DESTINATION, { userAgent: UA.iphoneSafari }));
    expect(text).not.toMatch(/origin|source|saddr|sll|geolocation|current|lat|lng/i);
  });
});

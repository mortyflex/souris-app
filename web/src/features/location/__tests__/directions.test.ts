import { describe, expect, it } from "vitest";

import * as directionsModule from "../directions";
import {
  appleDirectionsUrl,
  directionsLinks,
  googleDirectionsUrl,
  MAX_DIRECTIONS_URL_LENGTH,
  PLATFORM_DIRECTIONS,
  visitorPlatform,
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

describe("two applications, never a third", () => {
  it("builds Apple Plans and Google Maps links only — no other provider, no application scheme", () => {
    expect(Object.keys(directionsModule).filter((name) => /DirectionsUrl$/.test(name)).sort()).toEqual(["appleDirectionsUrl", "googleDirectionsUrl"]);
    for (const userAgent of Object.values(UA)) {
      const text = JSON.stringify(directionsLinks(DESTINATION, { userAgent }));
      expect(text).not.toMatch(/waze|comgooglemaps|maps:\/\/|geo:|intent:/i);
    }
  });
});

describe("encoding — a destination can never become another parameter, another host or a script", () => {
  it.each([
    ["an ampersand", "Salon Léa & Co, 3 rue de l’Église, 75001 Paris"],
    ["a question mark and a hash", "Porte ? #2, 1 rue Neuve, 13002 Marseille"],
    ["an equals sign and a plus", "Bât. A=B + C, 10 rue Haute, 1000 Bruxelles"],
    ["a slash and a backslash", "1/2 rue du Port \\ Quai, 17000 La Rochelle"],
    ["a percent sign", "100% Beauté, 2 rue Basse, 59000 Lille"],
    ["an attempt at a second parameter", "x&destination=evil&dir_action=navigate&q=evil&navigate=no, 75001 Paris"],
    ["an attempt at a URL", "https://evil.example/?q=, 75001 Paris"],
    ["quotes and angle brackets", `"><script>alert(1)</script>, 75001 Paris`],
    ["non-Latin letters", "東京都渋谷区 1-2-3, 150-0002 東京"],
    ["an emoji", "🌸 Institut, 4 rue des Fleurs, 31000 Toulouse"],
  ])("%s survives as ONE destination value", (_label, destination) => {
    for (const [build, parameter, host] of [
      [appleDirectionsUrl, "destination", "maps.apple.com"],
      [googleDirectionsUrl, "destination", "www.google.com"],
    ] as const) {
      const built = build(destination);
      expect(built).toBeDefined();
      const url = new URL(built ?? "");
      expect(url.searchParams.get(parameter)).toBe(destination);
      expect(url.searchParams.getAll(parameter)).toHaveLength(1);
      expect(url.hostname).toBe(host);
      expect(url.protocol).toBe("https:");
      // Nothing of the destination leaves the query.
      expect(built).not.toMatch(/[<>"\\ ]/);
      expect(url.hash).toBe("");
    }
    // Google keeps its own « api=1 » whatever the text says.
    expect(new URL(googleDirectionsUrl(destination) ?? "").searchParams.getAll("api")).toEqual(["1"]);
  });

  it("builds nothing from a text that is not a plain single line", () => {
    for (const destination of ["", " ", "a\nb", `a${String.fromCharCode(0x202e)}b`, " padded", "x".repeat(321)]) {
      expect(appleDirectionsUrl(destination)).toBeUndefined();
      expect(googleDirectionsUrl(destination)).toBeUndefined();
      expect(directionsLinks(destination)).toBeUndefined();
      expect(directionsLinks(destination, { userAgent: UA.iphoneSafari })).toBeUndefined();
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

describe("the visitor's platform", () => {
  it.each([
    ["an iPhone (Safari)", UA.iphoneSafari],
    ["an iPhone (Chrome)", UA.iphoneChrome],
    ["an iPad", UA.ipadSafari],
  ])("%s → iOS", (_label, userAgent) => {
    expect(visitorPlatform({ userAgent })).toBe("ios");
  });

  it.each([
    ["a Mac (Safari)", UA.macSafari],
    ["a Mac (Chrome)", UA.macChrome],
    // iPadOS asks for desktop websites by default: it presents itself as a Mac — the browser tells them apart (below).
    ["an iPad asking for desktop websites", UA.ipadDesktopClass],
  ])("%s → macOS", (_label, userAgent) => {
    expect(visitorPlatform({ userAgent })).toBe("macos");
  });

  it.each([
    ["an Android phone (Chrome)", UA.androidChrome],
    ["an Android phone (Firefox)", UA.androidFirefox],
    ["an Android tablet", UA.androidTablet],
    ["an Android phone without Google services", UA.huawei],
    ["a device that names both Android and iPhone", UA.windowsPhone],
  ])("%s → Android", (_label, userAgent) => {
    expect(visitorPlatform({ userAgent })).toBe("android");
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
  ])("%s → other", (_label, userAgent) => {
    expect(visitorPlatform({ userAgent })).toBe("other");
  });

  it("with no request at all: other", () => {
    expect(visitorPlatform()).toBe("other");
  });

  it("trusts the platform client hint over the user agent when a browser sends one", () => {
    // Chrome on Android asking for the desktop site presents a Linux desktop user agent.
    expect(visitorPlatform({ userAgent: UA.linuxFirefox, platformHint: '"Android"' })).toBe("android");
    expect(visitorPlatform({ userAgent: UA.windowsEdge, platformHint: '"macOS"' })).toBe("macos");
    expect(visitorPlatform({ userAgent: UA.macChrome, platformHint: '"Windows"' })).toBe("other");
    expect(visitorPlatform({ userAgent: UA.windowsEdge, platformHint: '"iOS"' })).toBe("ios");
    expect(visitorPlatform({ userAgent: UA.macChrome, platformHint: '"Chrome OS"' })).toBe("other");
    expect(visitorPlatform({ userAgent: UA.macChrome, platformHint: '"Chromium OS"' })).toBe("other");
    expect(visitorPlatform({ userAgent: UA.macChrome, platformHint: '"Linux"' })).toBe("other");
    // A hint it does not know decides nothing: the user agent does.
    expect(visitorPlatform({ userAgent: UA.iphoneSafari, platformHint: '"Unknown"' })).toBe("ios");
    expect(visitorPlatform({ userAgent: UA.iphoneSafari, platformHint: "" })).toBe("ios");
  });
});

describe("what « Itinéraire » and the map do on each platform", () => {
  const APPLE = { provider: "apple", providerName: "Apple Plans", url: `https://maps.apple.com/directions?destination=${ENCODED}` } as const;
  const GOOGLE = { provider: "google", providerName: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${ENCODED}` } as const;
  const on = (userAgent: string | undefined, platformHint?: string) => directionsLinks(DESTINATION, { userAgent, platformHint });

  it("iPhone and iPad (Safari, Chrome): « Ouvrir avec » — exactly Apple Plans, then Google Maps; Apple Plans without JavaScript", () => {
    for (const userAgent of [UA.iphoneSafari, UA.iphoneChrome, UA.ipadSafari]) {
      expect(on(userAgent)).toEqual({ primary: APPLE, chooser: { links: [APPLE, GOOGLE], offer: "always" } });
    }
  });

  it("an iPad presenting itself as a Mac: the same two applications — offered once the browser finds a touch screen", () => {
    expect(on(UA.ipadDesktopClass)).toEqual({ primary: APPLE, chooser: { links: [APPLE, GOOGLE], offer: "touch-screen" } });
  });

  it("a Mac: Apple Plans, directly — its page carries the chooser only for an iPad that looks like it", () => {
    for (const userAgent of [UA.macSafari, UA.macChrome]) {
      const links = on(userAgent);
      expect(links?.primary).toEqual(APPLE);
      expect(links?.chooser?.offer).toBe("touch-screen");
    }
  });

  it("Android — phone, tablet, Firefox, without Google services, « desktop site » mode: Google Maps, directly — NEVER a chooser, NEVER Apple Plans", () => {
    for (const links of [
      on(UA.androidChrome),
      on(UA.androidFirefox),
      on(UA.androidTablet),
      on(UA.huawei),
      on(UA.windowsPhone),
      // Chrome on Android asking for the desktop site: a Linux desktop user agent, an Android platform hint.
      on("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", '"Android"'),
    ]) {
      expect(links).toEqual({ primary: GOOGLE });
      expect(JSON.stringify(links)).not.toMatch(/apple|Plans|chooser/i);
    }
  });

  it("Windows, Linux, ChromeOS, a crawler, no request: Google Maps, directly — never Apple Plans", () => {
    for (const userAgent of [UA.windowsEdge, UA.windowsFirefox, UA.linuxFirefox, UA.chromeOs, UA.bot, UA.curl, undefined]) {
      expect(on(userAgent)).toEqual({ primary: GOOGLE });
    }
    // Firefox on Android in « desktop site » mode sends no hint: a Linux desktop to the server — the same Google Maps link.
    expect(on(UA.linuxFirefox)).toEqual({ primary: GOOGLE });
  });

  it("Apple Plans only on an Apple platform; the chooser only on iPhone and iPad (or what may be one)", () => {
    for (const [platform, { primary, chooser }] of Object.entries(PLATFORM_DIRECTIONS)) {
      const apple = platform === "ios" || platform === "macos";
      expect(primary === "apple").toBe(apple);
      expect(chooser !== undefined).toBe(apple);
    }
    expect(PLATFORM_DIRECTIONS.ios.chooser).toBe("always");
    expect(PLATFORM_DIRECTIONS.macos.chooser).toBe("touch-screen");
  });

  it("an Apple device whose Google link cannot be built keeps Apple Plans, alone; elsewhere nothing replaces Google Maps", () => {
    // Apple's base is five characters shorter than Google's: a destination can fit one (2 044) and not the other (2 049).
    const destination = `${"€".repeat(220)}${"a".repeat(18)}`;
    expect(appleDirectionsUrl(destination)).toBeDefined();
    expect(googleDirectionsUrl(destination)).toBeUndefined();
    expect(directionsLinks(destination, { userAgent: UA.iphoneSafari })).toEqual({ primary: expect.objectContaining({ provider: "apple" }) });
    expect(directionsLinks(destination, { userAgent: UA.androidChrome })).toBeUndefined();
  });

  it("every link leads to the SAME published destination, whatever the platform", () => {
    for (const userAgent of Object.values(UA)) {
      const links = on(userAgent);
      for (const link of [links!.primary, ...(links!.chooser?.links ?? [])]) {
        expect(new URL(link.url).searchParams.get("destination")).toBe(DESTINATION);
      }
    }
  });

  it("never carries the visitor's position, nor asks a maps service for one", () => {
    for (const userAgent of [UA.iphoneSafari, UA.androidChrome, UA.windowsEdge, UA.macSafari]) {
      const text = JSON.stringify(on(userAgent));
      expect(text).not.toMatch(/origin|source|saddr|sll|[?&]ll=|geolocation|current|lat=|lng=/i);
    }
  });
});

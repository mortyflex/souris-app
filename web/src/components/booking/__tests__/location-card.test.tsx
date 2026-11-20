import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { DirectionsLinks } from "@/features/location/directions";
import type { LocationView } from "@/features/location/location-view";

import * as locationCard from "../location-card";
import { DirectionsActions, LocationLines, LocationMap, LocationPanel, LocationRow } from "../location-card";

const DESTINATION = "12%20avenue%20Jean%20Jaur%C3%A8s%2C%2069007%20Lyon";
const SPOKEN = "12 avenue Jean Jaurès, 69007 Lyon";
const APPLE_URL = `https://maps.apple.com/directions?destination=${DESTINATION}`;
const GOOGLE_URL = `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}`;
const MAP_URL =
  "https://snapshot.apple-mapkit.com/api/v1/snapshot?center=12%20avenue%20Jean%20Jaur%C3%A8s%2C%2069007%20Lyon&z=16&size=600x300&scale=2&expires=1795089600&teamId=A1B2C3D4E5&keyId=Z9Y8X7W6V5&signature=c2lnbmF0dXJl";
const CITY_MAP_URL =
  "https://snapshot.apple-mapkit.com/api/v1/snapshot?center=Lyon&z=11&size=600x300&scale=2&expires=1795089600&teamId=A1B2C3D4E5&keyId=Z9Y8X7W6V5&signature=Y2l0eQ";

const apple = { provider: "apple", providerName: "Apple Plans", url: APPLE_URL } as const;
const google = { provider: "google", providerName: "Google Maps", url: GOOGLE_URL } as const;
/** What the server makes of the address for an iPhone or an iPad, a Mac, an Android phone, a PC. */
const onIos: DirectionsLinks = { primary: apple, chooser: { links: [apple, google], offer: "always" } };
const onMac: DirectionsLinks = { primary: apple, chooser: { links: [apple, google], offer: "touch-screen" } };
const onAndroid: DirectionsLinks = { primary: google };
const onPc: DirectionsLinks = { primary: google };
const onApple = onIos;
const address: LocationView = { kind: "address", lines: ["12 avenue Jean Jaurès", "69007 Lyon"], spoken: SPOKEN, directions: onApple };
const androidAddress: LocationView = { ...address, directions: onAndroid };
/** Every platform's view of the same address, with its map. */
const everyPlatform: readonly (readonly [string, LocationView])[] = [
  ["an iPhone or an iPad", { ...address, directions: onIos, mapUrl: MAP_URL }],
  ["a Mac", { ...address, directions: onMac, mapUrl: MAP_URL }],
  ["Android", { ...address, directions: onAndroid, mapUrl: MAP_URL }],
  ["Windows, Linux or anything else", { ...address, directions: onPc, mapUrl: MAP_URL }],
];
const withMap: LocationView = { ...address, mapUrl: MAP_URL };
const city: LocationView = { kind: "city", city: "Lyon" };
const cityWithMap: LocationView = { ...city, mapUrl: CITY_MAP_URL };

const html = (element: React.ReactElement) => renderToStaticMarkup(element);
const escaped = (url: string) => url.replace(/&/g, "&amp;");
const count = (markup: string, text: string) => markup.split(text).length - 1;
/** Every `<a …>` of a page, as its attribute text. */
const anchors = (markup: string) => [...markup.matchAll(/<a ([^>]*)>/g)].map((match) => match[1] ?? "");
const attribute = (tag: string, name: string) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("« Itinéraire » — the ONLY directions action, the same on every platform", () => {
  it("is a link to the platform's application, rendered as such by the server — one link, nothing beside it", () => {
    const markup = html(<DirectionsActions directions={onApple} spoken={SPOKEN} />);
    const [primary, ...rest] = anchors(markup);

    expect(rest).toHaveLength(0);
    expect(attribute(primary!, "href")).toBe(escaped(APPLE_URL));
    expect(attribute(primary!, "data-provider")).toBe("apple");
    expect(attribute(primary!, "aria-label")).toBe(`Itinéraire vers ${SPOKEN} (Apple Plans, nouvel onglet)`);
    expect(markup).toContain("Itinéraire</a>");
    // Before the page runs, it is a plain link: the chooser arrives in the browser, on an iPhone or an iPad.
    expect(primary).not.toMatch(/role="button"|aria-haspopup|data-chooser/);
  });

  it("on Android, and on a PC: Google Maps — never Apple Plans", () => {
    for (const directions of [onAndroid, onPc]) {
      const markup = html(<DirectionsActions directions={directions} spoken={SPOKEN} />);
      expect(anchors(markup)).toHaveLength(1);
      expect(attribute(anchors(markup)[0]!, "href")).toBe(escaped(GOOGLE_URL));
      expect(markup).not.toMatch(/maps\.apple\.com|Apple Plans/);
    }
  });

  it("inside a summary: « Itinéraire » alone, as a quiet link — no « Ouvrir dans … » beside it", () => {
    for (const directions of [onIos, onMac, onAndroid, onPc]) {
      const markup = html(<DirectionsActions compact directions={directions} spoken={SPOKEN} />);
      expect(anchors(markup)).toHaveLength(1);
      expect(text(markup)).toBe("Itinéraire");
      expect(markup).not.toMatch(/Ouvrir dans|data-provider-mark/);
    }
  });

  it("every link leaves the page safely: a new tab, no opener, no referrer — the booking flow keeps its state", () => {
    for (const [, location] of everyPlatform) {
      const markups = [html(<LocationRow location={location} />), html(<LocationPanel location={location} professionalName="Léa" headingId="h" />), html(<LocationLines location={location} />)];
      for (const tag of markups.flatMap(anchors)) {
        expect(attribute(tag, "target")).toBe("_blank");
        expect(attribute(tag, "rel")).toBe("noopener noreferrer");
        expect(attribute(tag, "href")).toMatch(/^https:\/\/(maps\.apple\.com\/directions\?|www\.google\.com\/maps\/dir\/\?)/);
      }
    }
  });

  it("is a 44 px target as a button and as a quiet link; the map is a large target of its own", () => {
    const markups = [html(<DirectionsActions directions={onApple} spoken={SPOKEN} />), html(<DirectionsActions compact directions={onApple} spoken={SPOKEN} />)];
    for (const tag of markups.flatMap(anchors)) expect(attribute(tag, "class")).toContain("min-h-11");
    expect(html(<LocationMap location={address} idPrefix="t" />)).toMatch(/<a [^>]*class="relative block aspect-\[2\/1\] w-full/);
  });

  it("keeps the site's visible focus ring: no link removes its outline", () => {
    const markup = html(<LocationRow location={withMap} />) + html(<LocationPanel location={withMap} professionalName="Léa" headingId="h" />);
    expect(markup).not.toMatch(/outline-none|focus:outline-0|outline-0/);
    const css = readFileSync(path.join(__dirname, "../../../app/globals.css"), "utf8");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline: 2px solid var\(--color-accent\)/);
  });

  it("never asks for the visitor's position, never tries an application scheme, runs no script of its own", () => {
    const markup = html(<LocationRow location={withMap} />) + html(<LocationPanel location={withMap} professionalName="Léa" headingId="h" />);
    expect(markup).not.toMatch(/geolocation|getCurrentPosition|onclick|javascript:|<script|<iframe|origin=|saddr=|source=|comgooglemaps|geo:/i);
    for (const file of ["../location-card.tsx", "../map-snapshot-image.tsx", "../directions-chooser.tsx", "../provider-mark.tsx"]) {
      expect(readFileSync(path.join(__dirname, file), "utf8")).not.toMatch(/geolocation|getCurrentPosition|watchPosition/);
    }
  });
});

describe("no third application, no second link — on every platform", () => {
  it.each(everyPlatform)("%s: « Itinéraire » and the map are the ONLY two links, to the SAME place", (_platform, location) => {
    for (const markup of [html(<LocationRow location={location} />), html(<LocationPanel location={location} professionalName="Léa" headingId="h" />)]) {
      const links = anchors(markup);
      expect(links).toHaveLength(2);
      expect(attribute(links[0]!, "href")).toBe(attribute(links[1]!, "href"));
      expect(attribute(links[0]!, "aria-label")).toBe(attribute(links[1]!, "aria-label"));
      expect(markup).not.toMatch(/Ouvrir dans|data-directions-secondary|data-provider-mark|waze/i);
    }
  });

  it("the card offers no provider row any more: the component is gone", () => {
    expect(Object.keys(locationCard)).not.toContain("SecondaryDirections");
    const source = readFileSync(path.join(__dirname, "../location-card.tsx"), "utf8");
    expect(source).not.toMatch(/waze|Waze|secondaryLink|data-directions-secondary|pointer-coarse/);
    expect(readFileSync(path.join(__dirname, "../provider-mark.tsx"), "utf8")).not.toMatch(/waze/i);
  });
});

describe("the map of a complete address — the same action as « Itinéraire », nothing under it", () => {
  it("without a snapshot: the Nacre artwork with its pin — the same link as « Itinéraire »", () => {
    const markup = html(<LocationMap location={address} idPrefix="t" />);

    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("apple-mapkit");
    expect(markup).toContain('data-animated="false" class="nacre');
    expect(markup).toContain('id="t-place-lilac"');
    const [map, ...rest] = anchors(markup);
    expect(rest).toHaveLength(0);
    expect(attribute(map!, "href")).toBe(escaped(APPLE_URL));
    expect(attribute(map!, "aria-label")).toBe(`Itinéraire vers ${SPOKEN} (Apple Plans, nouvel onglet)`);
    // The artwork never claims to be Apple's map.
    expect(markup).not.toMatch(/Plan :|data-map-credit/);
  });

  it("with a snapshot: Apple's image OVER the artwork, asked by the browser from Apple, in the frame's own size", () => {
    const markup = html(<LocationMap location={withMap} idPrefix="t" />);
    const image = markup.match(/<img ([^>]*)>/)?.[1] ?? "";

    expect(attribute(image, "src")).toBe(escaped(MAP_URL));
    expect(attribute(image, "width")).toBe("600");
    expect(attribute(image, "height")).toBe("300");
    expect(attribute(image, "alt")).toBe("");
    expect(attribute(image, "loading")).toBe("lazy");
    // The artwork is still underneath: it shows while the image loads, and if it cannot be read.
    expect(markup.indexOf("nacre")).toBeLessThan(markup.indexOf("<img"));
    expect(count(markup, "<img")).toBe(1);
    // The map is the same action as « Itinéraire »; the image carries no name of its own.
    expect(attribute(anchors(markup)[0]!, "href")).toBe(escaped(APPLE_URL));
  });


  it("shows the image whole, never cropped — Apple's attribution drawn on it stays visible", () => {
    const markup = html(<LocationMap location={withMap} idPrefix="t" />);
    expect(markup).toMatch(/<a [^>]*class="[^"]*aspect-\[2\/1\][^"]*overflow-hidden/);
    expect(markup).toMatch(/<img [^>]*class="absolute inset-0 h-full w-full object-cover"/);
    // Nothing is laid over the image: the pin belongs to the artwork UNDER it.
    const frame = markup.slice(markup.indexOf("<a "), markup.indexOf("</a>"));
    expect(frame.indexOf("<img")).toBeGreaterThan(frame.lastIndexOf("rounded-full"));
  });

  it("no caption, no link under the map: Apple's own marks on the image are the map's attribution", () => {
    for (const [, location] of [...everyPlatform, ["a city", cityWithMap] as const]) {
      const markup = html(<LocationMap location={location} idPrefix="t" />);
      expect(markup).not.toMatch(/Plan : Apple Plans|data-map-credit|Plan :|Ouvrir dans|data-directions-secondary/);
      // The map's column holds the frame alone.
      expect(markup).toMatch(/^<div data-location-map="" data-map-kind="(address|city)" class="[^"]*">(<a |<div aria-hidden)/);
      expect(markup).toMatch(/<\/(a|div)><\/div>$/);
    }
  });

  it.each(everyPlatform)("%s: the map opens what « Itinéraire » opens", (_platform, location) => {
    const map = anchors(html(<LocationMap location={location} idPrefix="t" />));
    const itineraire = anchors(html(<DirectionsActions directions={location.kind === "address" ? location.directions! : onPc} spoken={SPOKEN} />));
    expect(map).toHaveLength(1);
    expect(attribute(map[0]!, "href")).toBe(attribute(itineraire[0]!, "href"));
  });

  it("never sends Apple's image through this website: a plain <img>, no optimizer, no proxy", () => {
    const markup = html(<LocationMap location={withMap} idPrefix="t" />);
    expect(markup).toMatch(/<img [^>]*src="https:\/\/snapshot\.apple-mapkit\.com\/api\/v1\/snapshot\?/);
    expect(markup).not.toMatch(/_next\/image|srcset|src="\//i);
    const source = readFileSync(path.join(__dirname, "../map-snapshot-image.tsx"), "utf8");
    expect(source).not.toMatch(/from "next\/image"|fetch\(/);
  });

  it("the image hides itself when Apple refuses it — expired signature, quota, outage — and never retries", () => {
    const source = readFileSync(path.join(__dirname, "../map-snapshot-image.tsx"), "utf8");
    expect(source).toMatch(/addEventListener\("error", fail/);
    expect(source).toMatch(/image\.naturalWidth === 0\) fail\(\)/);
    expect(source).toMatch(/image\.hidden = true/);
    expect(source).toMatch(/setAttribute\("data-map-state", "failed"\)/);
    // No second attempt, no other source: the code (comments aside) never sets a timer nor a new address.
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).not.toMatch(/setTimeout|setInterval|\.src\s*=|fetch\(/);
  });
});

describe("the map of a city — a picture, never a place", () => {
  it("has no marker, no link, no destination, no application to open", () => {
    for (const location of [city, cityWithMap]) {
      const markup = html(<LocationMap location={location} idPrefix="t" />);
      expect(anchors(markup)).toHaveLength(0);
      expect(markup).not.toMatch(/maps\.apple\.com|google\.com\/maps|Itinéraire|Ouvrir dans|href=|data-directions/);
      expect(markup).toContain('data-map-kind="city"');
      // The artwork carries no pin: nothing reads as « exactly here ».
      expect(markup).not.toContain("size-10 place-items-center rounded-full");
      expect(markup).toMatch(/<div aria-hidden="true" class="[^"]*aspect-\[2\/1\]/);
    }
  });

  it("with a snapshot: the town-level image the server signed, as it is — and no caption", () => {
    const markup = html(<LocationMap location={cityWithMap} idPrefix="t" />);
    expect(attribute(markup.match(/<img ([^>]*)>/)?.[1] ?? "", "src")).toBe(escaped(CITY_MAP_URL));
    expect(markup).not.toContain("Plan :");
  });
});

describe("LocationRow — the profile", () => {
  it("a complete address: on the left its label, two lines and « Itinéraire »; on the right the map — nothing else", () => {
    const markup = html(<LocationRow location={withMap} />);
    expect(markup).toContain('data-location="address"');
    expect(markup).toMatch(/<dt[^>]*>Adresse<\/dt>/);
    expect(markup).toContain('<span class="block">12 avenue Jean Jaurès</span><span class="block">69007 Lyon</span>');
    // « Itinéraire » and the map: Apple Plans on an iPhone (the chooser comes in the browser); Google Maps nowhere in the page.
    expect(count(markup, `href="${escaped(APPLE_URL)}"`)).toBe(2);
    expect(count(markup, `href="${escaped(GOOGLE_URL)}"`)).toBe(0);
    expect(count(markup, "<img")).toBe(1);
    const left = markup.slice(0, markup.indexOf('<dd class="col-span-2 sm:col-span-1">'));
    expect(anchors(left)).toHaveLength(1);
  });

  it("reads in order: the address, « Itinéraire », the map", () => {
    const markup = html(<LocationRow location={withMap} />);
    const order = ["12 avenue Jean Jaurès", "Itinéraire</a>", "<img"].map((needle) => markup.indexOf(needle));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("a city: the name under « Lieu » — nothing else of the place", () => {
    const markup = html(<LocationRow location={city} />);
    expect(markup).toContain('data-location="city"');
    expect(markup).toMatch(/<dt[^>]*>Lieu<\/dt>/);
    expect(markup).toMatch(/<dd[^>]*>Lyon<\/dd>/);
    expect(markup).not.toMatch(/Adresse|Itinéraire|Ouvrir dans|href=|data-directions/);
  });

  it("is a valid row of a description list: a term, then descriptions — the map in one of them", () => {
    const markup = html(
      <dl>
        <LocationRow location={withMap} />
      </dl>,
    );
    expect(markup).toMatch(/^<dl><div data-location="address"/);
    expect(count(markup, "<dt")).toBe(1);
    expect(count(markup, "<dd")).toBe(3);
    expect(markup).toMatch(/<dd class="col-span-2 sm:col-span-1"><div data-location-map=""/);
  });

  it("stacks the map under the text on a phone and beside it from 640 px — never off the screen", () => {
    const markup = html(<LocationRow location={withMap} />);
    expect(markup).toMatch(/grid-cols-\[2\.5rem_minmax\(0,1fr\)\][^"]*sm:grid-cols-\[2\.5rem_minmax\(0,1fr\)_minmax\(0,17rem\)\]/);
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("break-words");
  });

  it("escapes what the professional typed", () => {
    const hostile: LocationView = { ...address, lines: ['<img src=x onerror="alert(1)">', "<b>69007</b> Lyon"], spoken: '"><script>alert(1)</script>' };
    const markup = html(<LocationRow location={hostile} />);
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("<img src=x");
    expect(markup).not.toContain("<b>69007</b>");
  });
});

describe("LocationPanel — the confirmation of a booking", () => {
  it("a complete address: where to go, « Itinéraire », the map — nothing else", () => {
    const markup = html(<LocationPanel location={withMap} professionalName="Studio Léa" headingId="place" />);
    expect(markup).toMatch(/<section aria-labelledby="place" data-location="address"/);
    expect(markup).toMatch(/<h3 id="place"[^>]*>Lieu du rendez-vous<\/h3>/);
    expect(text(markup)).toBe("Lieu du rendez-vous 12 avenue Jean Jaurès 69007 Lyon Itinéraire");
    expect(count(markup, "<img")).toBe(1);
    expect(markup).not.toContain("Pour l’adresse exacte");
    expect(markup).not.toContain("Plan :");
  });

  it("a city: the city, and whom to ask for the rest — no directions, no address", () => {
    const markup = html(<LocationPanel location={city} professionalName="Studio Léa" headingId="place" />);
    expect(markup).toContain('data-location="city"');
    expect(markup).toContain("Lyon");
    expect(markup).toContain("Pour l’adresse exacte, contactez Studio Léa.");
    expect(markup).not.toMatch(/Itinéraire|Ouvrir dans|href=|Jaurès|69007/);
  });
});

describe("LocationLines — inside a summary", () => {
  it("a complete address: its lines and « Itinéraire » as a quiet link, no map", () => {
    const markup = html(<LocationLines location={withMap} />);
    expect(markup).toContain("12 avenue Jean Jaurès");
    expect(markup).toContain("69007 Lyon");
    expect(anchors(markup)).toHaveLength(1);
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("nacre");
    expect(text(html(<LocationLines location={androidAddress} />))).toBe("12 avenue Jean Jaurès 69007 Lyon Itinéraire");
  });

  it("a city: the name alone", () => {
    expect(html(<LocationLines location={cityWithMap} />)).toBe('<span class="block">Lyon</span>');
  });

  it("an address without a directions link keeps its lines, and offers nothing to open", () => {
    const bare: LocationView = { kind: "address", lines: ["12 avenue Jean Jaurès", "69007 Lyon"], spoken: SPOKEN };
    const markup = html(<LocationLines location={bare} />);
    expect(markup).toContain("69007 Lyon");
    expect(anchors(markup)).toHaveLength(0);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { LocationView } from "@/features/location/location-view";

import { DirectionsActions, LocationLines, LocationMap, LocationPanel, LocationRow } from "../location-card";

const DESTINATION = "12%20avenue%20Jean%20Jaur%C3%A8s%2C%2069007%20Lyon";
const APPLE_URL = `https://maps.apple.com/directions?destination=${DESTINATION}`;
const GOOGLE_URL = `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}`;
const MAP_URL =
  "https://snapshot.apple-mapkit.com/api/v1/snapshot?center=12%20avenue%20Jean%20Jaur%C3%A8s%2C%2069007%20Lyon&z=16&size=600x300&scale=2&expires=1795089600&teamId=A1B2C3D4E5&keyId=Z9Y8X7W6V5&signature=c2lnbmF0dXJl";
const CITY_MAP_URL =
  "https://snapshot.apple-mapkit.com/api/v1/snapshot?center=Lyon&z=11&size=600x300&scale=2&expires=1795089600&teamId=A1B2C3D4E5&keyId=Z9Y8X7W6V5&signature=Y2l0eQ";

const apple = { provider: "apple", providerName: "Plans", url: APPLE_URL } as const;
const google = { provider: "google", providerName: "Google Maps", url: GOOGLE_URL } as const;
const address: LocationView = {
  kind: "address",
  lines: ["12 avenue Jean Jaurès", "69007 Lyon"],
  spoken: "12 avenue Jean Jaurès, 69007 Lyon",
  directions: { primary: apple, alternative: google },
};
const onAndroid: LocationView = { ...address, directions: { primary: google, alternative: apple } };
const withMap: LocationView = { ...address, mapUrl: MAP_URL };
const city: LocationView = { kind: "city", city: "Lyon" };
const cityWithMap: LocationView = { ...city, mapUrl: CITY_MAP_URL };

const html = (element: React.ReactElement) => renderToStaticMarkup(element);
const escaped = (url: string) => url.replace(/&/g, "&amp;");
const count = (markup: string, text: string) => markup.split(text).length - 1;
/** Every `<a …>` of a page, as its attribute text. */
const anchors = (markup: string) => [...markup.matchAll(/<a ([^>]*)>/g)].map((match) => match[1] ?? "");
const attribute = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe("« Itinéraire » — a visible action that works on its own", () => {
  it("opens the visitor's probable application, and always offers the other one beside it", () => {
    const markup = html(<DirectionsActions directions={address.directions!} spoken={address.spoken} />);
    const [primary, alternative] = anchors(markup);

    expect(attribute(primary!, "href")).toBe(escaped(APPLE_URL));
    expect(attribute(primary!, "data-provider")).toBe("apple");
    expect(markup).toContain("Itinéraire</a>");
    expect(attribute(alternative!, "href")).toBe(escaped(GOOGLE_URL));
    expect(markup).toContain("Ouvrir dans Google Maps</a>");
    expect(anchors(markup)).toHaveLength(2);
  });

  it("on Android: Google Maps first, Plans as the alternative", () => {
    const markup = html(<DirectionsActions directions={onAndroid.directions!} spoken={address.spoken} />);
    const [primary, alternative] = anchors(markup);
    expect(attribute(primary!, "href")).toBe(escaped(GOOGLE_URL));
    expect(attribute(alternative!, "href")).toBe(escaped(APPLE_URL));
    expect(markup).toContain("Ouvrir dans Plans</a>");
  });

  it("says where each link goes, in which application, and that it opens a new tab", () => {
    const [primary, alternative] = anchors(html(<DirectionsActions directions={address.directions!} spoken={address.spoken} />));
    expect(attribute(primary!, "aria-label")).toBe("Itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon (Plans, nouvel onglet)");
    expect(attribute(alternative!, "aria-label")).toBe(
      "Ouvrir dans Google Maps : Itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon (Google Maps, nouvel onglet)",
    );
  });

  it("every link leaves the page safely: a new tab, no opener, no referrer — the booking flow keeps its state", () => {
    for (const tag of anchors(html(<LocationRow location={withMap} />))) {
      expect(attribute(tag, "target")).toBe("_blank");
      expect(attribute(tag, "rel")).toBe("noopener noreferrer");
      expect(attribute(tag, "href")).toMatch(/^https:\/\/(maps\.apple\.com\/directions\?|www\.google\.com\/maps\/dir\/\?)/);
    }
  });

  it("is a 44 px target in every form — the button, and the two quiet links of a summary", () => {
    for (const compact of [false, true]) {
      for (const tag of anchors(html(<DirectionsActions compact={compact} directions={address.directions!} spoken={address.spoken} />))) {
        expect(attribute(tag, "class")).toContain("min-h-11");
      }
    }
  });

  it("keeps the site's visible focus ring: no link removes its outline", () => {
    const markup = html(<LocationRow location={withMap} />) + html(<LocationPanel location={withMap} professionalName="Léa" headingId="h" />);
    expect(markup).not.toMatch(/outline-none|focus:outline-0|outline-0/);
    const css = readFileSync(path.join(__dirname, "../../../app/globals.css"), "utf8");
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline: 2px solid var\(--color-accent\)/);
  });

  it("with only one link to offer, offers it alone", () => {
    const markup = html(<DirectionsActions directions={{ primary: google }} spoken={address.spoken} />);
    expect(anchors(markup)).toHaveLength(1);
    expect(markup).not.toContain("Ouvrir dans");
  });

  it("never asks for the visitor's position, and runs no script to open a map", () => {
    const markup = html(<LocationRow location={withMap} />) + html(<LocationPanel location={withMap} professionalName="Léa" headingId="h" />);
    expect(markup).not.toMatch(/geolocation|getCurrentPosition|onclick|javascript:|<script|<iframe|origin=|saddr=|source=/i);
    for (const file of ["../location-card.tsx", "../map-snapshot-image.tsx"]) {
      expect(readFileSync(path.join(__dirname, file), "utf8")).not.toMatch(/geolocation|getCurrentPosition|watchPosition/);
    }
  });
});

describe("the map of a complete address", () => {
  it("without a snapshot: the Nacre artwork with its pin — and still a link to the directions", () => {
    const markup = html(<LocationMap location={address} idPrefix="t" />);

    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("apple-mapkit");
    expect(markup).toContain('data-animated="false" class="nacre');
    expect(markup).toContain('id="t-place-lilac"');
    const [link] = anchors(markup);
    expect(attribute(link!, "href")).toBe(escaped(APPLE_URL));
    expect(attribute(link!, "aria-label")).toBe("Itinéraire vers 12 avenue Jean Jaurès, 69007 Lyon (Plans, nouvel onglet)");
    // The artwork never claims to be Apple's map.
    expect(markup).not.toContain("Apple Plans");
    expect(markup).not.toContain("data-map-credit");
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
    // The map is the same link to the directions; the image carries no name of its own.
    expect(attribute(anchors(markup)[0]!, "href")).toBe(escaped(APPLE_URL));
  });

  it("shows the image whole, never cropped: a 2 : 1 frame for a 600 × 300 image", () => {
    const markup = html(<LocationMap location={withMap} idPrefix="t" />);
    expect(markup).toMatch(/<a [^>]*class="[^"]*aspect-\[2\/1\][^"]*overflow-hidden/);
    expect(markup).toMatch(/<img [^>]*class="absolute inset-0 h-full w-full object-cover"/);
  });

  it("credits the map's provider in words, beside the marks Apple draws on its image — and only with the image", () => {
    const markup = html(<LocationMap location={withMap} idPrefix="t" />);
    expect(markup).toMatch(/<p data-map-credit=""[^>]*>Plan : Apple Plans<\/p>/);
    // When the image cannot be read, the frame is marked « failed » and the credit goes with it.
    expect(markup).toContain("group-data-[map-state=failed]/map:hidden");
    expect(markup).toMatch(/<div data-location-map="" data-map-kind="address" class="group\/map /);
  });

  it("never sends Apple's image through this website: a plain <img>, no optimizer, no proxy", () => {
    const markup = html(<LocationMap location={withMap} idPrefix="t" />);
    // The browser asks Apple, directly: never this website's optimizer, never one of its own endpoints.
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
  it("has no marker, no link, no destination: nothing to open", () => {
    for (const location of [city, cityWithMap]) {
      const markup = html(<LocationMap location={location} idPrefix="t" />);
      expect(anchors(markup)).toHaveLength(0);
      expect(markup).not.toMatch(/maps\.apple\.com|google\.com\/maps|Itinéraire|href=/);
      expect(markup).toContain('data-map-kind="city"');
      // The artwork carries no pin: nothing reads as « exactly here ».
      expect(markup).not.toContain("size-10 place-items-center rounded-full");
      expect(markup).toMatch(/<div aria-hidden="true" class="[^"]*aspect-\[2\/1\]/);
    }
  });

  it("with a snapshot: the town-level image the server signed, as it is", () => {
    const markup = html(<LocationMap location={cityWithMap} idPrefix="t" />);
    expect(attribute(markup.match(/<img ([^>]*)>/)?.[1] ?? "", "src")).toBe(escaped(CITY_MAP_URL));
    expect(markup).toContain("Plan : Apple Plans");
  });
});

describe("LocationRow — the profile", () => {
  it("a complete address: label, two lines, the actions, the map", () => {
    const markup = html(<LocationRow location={withMap} />);
    expect(markup).toContain('data-location="address"');
    expect(markup).toMatch(/<dt[^>]*>Adresse<\/dt>/);
    expect(markup).toContain('<span class="block">12 avenue Jean Jaurès</span><span class="block">69007 Lyon</span>');
    expect(count(markup, `href="${escaped(APPLE_URL)}"`)).toBe(2);
    expect(count(markup, `href="${escaped(GOOGLE_URL)}"`)).toBe(1);
    expect(count(markup, "<img")).toBe(1);
  });

  it("a city: the name under « Lieu » — nothing else of the place", () => {
    const markup = html(<LocationRow location={city} />);
    expect(markup).toContain('data-location="city"');
    expect(markup).toMatch(/<dt[^>]*>Lieu<\/dt>/);
    expect(markup).toMatch(/<dd[^>]*>Lyon<\/dd>/);
    expect(markup).not.toMatch(/Adresse|Itinéraire|href=|data-directions/);
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
  it("a complete address: where to go, how to get there, the map", () => {
    const markup = html(<LocationPanel location={withMap} professionalName="Studio Léa" headingId="place" />);
    expect(markup).toMatch(/<section aria-labelledby="place" data-location="address"/);
    expect(markup).toMatch(/<h3 id="place"[^>]*>Lieu du rendez-vous<\/h3>/);
    expect(markup).toContain("12 avenue Jean Jaurès");
    expect(markup).toContain("69007 Lyon");
    expect(markup).toContain("Itinéraire</a>");
    expect(count(markup, "<img")).toBe(1);
    expect(markup).not.toContain("Pour l’adresse exacte");
  });

  it("a city: the city, and whom to ask for the rest — no directions, no address", () => {
    const markup = html(<LocationPanel location={city} professionalName="Studio Léa" headingId="place" />);
    expect(markup).toContain('data-location="city"');
    expect(markup).toContain("Lyon");
    expect(markup).toContain("Pour l’adresse exacte, contactez Studio Léa.");
    expect(markup).not.toMatch(/Itinéraire|href=|Jaurès|69007/);
  });
});

describe("LocationLines — inside a summary", () => {
  it("a complete address: its lines and « Itinéraire » as quiet links, no map", () => {
    const markup = html(<LocationLines location={withMap} />);
    expect(markup).toContain("12 avenue Jean Jaurès");
    expect(markup).toContain("69007 Lyon");
    expect(anchors(markup)).toHaveLength(2);
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("nacre");
  });

  it("a city: the name alone", () => {
    expect(html(<LocationLines location={cityWithMap} />)).toBe('<span class="block">Lyon</span>');
  });

  it("an address without a directions link keeps its lines, and offers nothing to open", () => {
    const bare: LocationView = { kind: "address", lines: ["12 avenue Jean Jaurès", "69007 Lyon"], spoken: address.kind === "address" ? address.spoken : "" };
    const markup = html(<LocationLines location={bare} />);
    expect(markup).toContain("69007 Lyon");
    expect(anchors(markup)).toHaveLength(0);
  });
});

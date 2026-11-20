import { isPlainLine } from "./public-location";

/**
 * Directions to a professional's published address — two official, key-less
 * universal links, each opening the provider's application where the device
 * has it and its website otherwise:
 *
 *   Apple Plans   https://maps.apple.com/directions?destination=…
 *                 (unified Maps URLs, iOS 18.4 / macOS 15.4 and later —
 *                 developer.apple.com/documentation/mapkit/unified-map-urls)
 *   Google Maps   https://www.google.com/maps/dir/?api=1&destination=…
 *                 (Maps URLs — developers.google.com/maps/documentation/urls/get-started)
 *
 * Each takes the destination as plain text, percent-encoded here. No origin is
 * sent: each application starts from where the visitor is, which IT knows —
 * this website never asks for a position. No travel mode, no tracking
 * parameter either, and never an application scheme.
 *
 * WHAT « Itinéraire » and the map do depends on the visitor's platform, read
 * from the request (never from the visitor's device, never a promise of what
 * is installed — a website cannot know):
 *
 *   iPhone, iPad             « Ouvrir avec »: Apple Plans, then Google Maps
 *   Mac                      Apple Plans, directly
 *   Android                  Google Maps, directly — never Apple Plans
 *   Windows, Linux, unknown  Google Maps, directly
 *
 * An iPad asking for desktop websites (iPadOS Safari's default) presents
 * itself as a Mac, and sends no client hint: the request cannot tell the two
 * apart. Its page therefore carries the chooser too, offered only where the
 * browser finds a touch screen (`directions-chooser.ts`); a Mac never shows it.
 *
 * Only a COMPLETE published address has a destination (`FULL_ADDRESS`). A city
 * or a hidden location never reaches this module.
 */
export type MapsProvider = "apple" | "google";

/** The visitor's platform, as far as the request says it. */
export type VisitorPlatform = "ios" | "macos" | "android" | "other";

/** When « Itinéraire » asks which application to open: on every iPhone and iPad, or only behind a Mac's user agent with a touch screen. */
export type ChooserOffer = "always" | "touch-screen";

const APPLE_DIRECTIONS = "https://maps.apple.com/directions";
const GOOGLE_DIRECTIONS = "https://www.google.com/maps/dir/";

/** Google's documented limit of a Maps URL; kept for both providers. */
export const MAX_DIRECTIONS_URL_LENGTH = 2048;
/** The longest destination the server can build (street, postal code, city). */
const DESTINATION_MAX = 320;

function directionsUrl(base: string, destination: string): string | undefined {
  // Defence in depth: the destination is the server's validated plain text, and stays one here.
  if (!isPlainLine(destination, DESTINATION_MAX)) return undefined;
  const url = `${base}${encodeURIComponent(destination)}`;
  return url.length <= MAX_DIRECTIONS_URL_LENGTH ? url : undefined;
}

/** Apple Plans: the Maps application of an Apple device. */
export function appleDirectionsUrl(destination: string): string | undefined {
  return directionsUrl(`${APPLE_DIRECTIONS}?destination=`, destination);
}

/** Google Maps: the application where it is installed, the website otherwise. */
export function googleDirectionsUrl(destination: string): string | undefined {
  return directionsUrl(`${GOOGLE_DIRECTIONS}?api=1&destination=`, destination);
}

export interface VisitorHeaders {
  /** The request's `User-Agent`. */
  readonly userAgent?: string | null;
  /** The request's `Sec-CH-UA-Platform` client hint (Chromium), quoted as sent: `"Android"`, `"macOS"`… */
  readonly platformHint?: string | null;
}

/**
 * The visitor's platform, from the request's own headers:
 *
 *   the client hint, when a browser sends one it knows (Chromium: even in
 *   « desktop site » mode, Android says Android);
 *   else the user agent — an Android device always wins (some name both
 *   Android and iPhone); an iPad asking for desktop websites presents itself
 *   as a Mac;
 *   else `other`.
 */
export function visitorPlatform({ userAgent, platformHint }: VisitorHeaders = {}): VisitorPlatform {
  const hint = (platformHint ?? "").replace(/"/g, "").trim().toLowerCase();
  if (hint === "android") return "android";
  if (hint === "ios") return "ios";
  if (hint === "macos") return "macos";
  if (hint === "windows" || hint === "linux" || hint === "chrome os" || hint === "chromeos" || hint === "chromium os") return "other";

  const agent = userAgent ?? "";
  if (/Android/i.test(agent)) return "android";
  if (/\b(iPhone|iPad|iPod)\b/.test(agent)) return "ios";
  if (/Macintosh|Mac OS X/.test(agent)) return "macos";
  return "other";
}

/**
 * What « Itinéraire » and the map open on each platform: the application they
 * link to, and whether they first ask (« Ouvrir avec »: Apple Plans, then
 * Google Maps). Apple Plans is only ever offered on an Apple platform; the
 * chooser only ever on an iPhone or an iPad.
 */
export const PLATFORM_DIRECTIONS: Readonly<Record<VisitorPlatform, { readonly primary: MapsProvider; readonly chooser?: ChooserOffer }>> = {
  ios: { primary: "apple", chooser: "always" },
  macos: { primary: "apple", chooser: "touch-screen" },
  android: { primary: "google" },
  other: { primary: "google" },
};

/** The name of each application, as French speakers know it. */
export const PROVIDER_NAMES: Readonly<Record<MapsProvider, string>> = { apple: "Apple Plans", google: "Google Maps" };

export interface DirectionsLink {
  readonly provider: MapsProvider;
  readonly url: string;
  readonly providerName: string;
}

export interface DirectionsLinks {
  /** « Itinéraire » and the map, as the server renders them — and without JavaScript: ONE application, directly. */
  readonly primary: DirectionsLink;
  /** iPhone and iPad: « Ouvrir avec », exactly Apple Plans then Google Maps. Absent: « Itinéraire » is the direct link. */
  readonly chooser?: { readonly links: readonly [DirectionsLink, DirectionsLink]; readonly offer: ChooserOffer };
}

function link(provider: MapsProvider, destination: string): DirectionsLink | undefined {
  const url = provider === "apple" ? appleDirectionsUrl(destination) : googleDirectionsUrl(destination);
  return url === undefined ? undefined : { provider, url, providerName: PROVIDER_NAMES[provider] };
}

/**
 * The directions of a destination for a visitor's platform. `undefined` when
 * no link can be built (a text that is not a plain line, or a URL beyond the
 * documented limit): the page then shows the address alone.
 */
export function directionsLinks(destination: string, headers: VisitorHeaders = {}): DirectionsLinks | undefined {
  const { primary: provider, chooser: offer } = PLATFORM_DIRECTIONS[visitorPlatform(headers)];
  if (provider === "google") {
    // Android and every other platform: Google Maps or nothing — never Apple Plans in its stead.
    const google = link("google", destination);
    return google === undefined ? undefined : { primary: google };
  }
  const apple = link("apple", destination);
  const google = link("google", destination);
  const primary = apple ?? google;
  if (primary === undefined) return undefined;
  return apple !== undefined && google !== undefined && offer !== undefined
    ? { primary, chooser: { links: [apple, google], offer } }
    : { primary };
}

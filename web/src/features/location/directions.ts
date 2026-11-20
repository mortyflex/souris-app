import { isPlainLine } from "./public-location";

/**
 * Directions to a professional's published address, in the visitor's own maps
 * application — two official, key-less URL schemes:
 *
 *   Apple   https://maps.apple.com/directions?destination=…
 *           (unified Maps URLs — developer.apple.com/documentation/mapkit/unified-map-urls)
 *   Google  https://www.google.com/maps/dir/?api=1&destination=…
 *           (Maps URLs — developers.google.com/maps/documentation/urls/get-started)
 *
 * Both take the destination as plain text, percent-encoded here. No origin is
 * sent: each application starts from where the visitor is, which IT knows —
 * this website never asks for a position. No travel mode either: the visitor
 * keeps her own.
 *
 * Only a COMPLETE published address has a destination (`FULL_ADDRESS`). A city
 * or a hidden location never reaches this module.
 */
export type MapsProvider = "apple" | "google";

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

/** Apple Plans: the Maps application on an Apple device, Apple Maps on the web elsewhere. */
export function appleDirectionsUrl(destination: string): string | undefined {
  return directionsUrl(`${APPLE_DIRECTIONS}?destination=`, destination);
}

/** Google Maps: the application where it is installed, the website otherwise. */
export function googleDirectionsUrl(destination: string): string | undefined {
  return directionsUrl(`${GOOGLE_DIRECTIONS}?api=1&destination=`, destination);
}

export interface VisitorPlatform {
  /** The request's `User-Agent`. */
  readonly userAgent?: string | null;
  /** The request's `Sec-CH-UA-Platform` client hint (Chromium), quoted as sent: `"Android"`, `"macOS"`… */
  readonly platformHint?: string | null;
}

/**
 * The maps application a visitor most probably has:
 *
 *   iPhone, iPad, Mac          Apple Plans
 *   Android                    Google Maps
 *   everything else, unknown   Google Maps — its website opens in any browser
 *
 * A guess from the request, never a promise: the page always offers the other
 * provider beside it. An Android device always wins (some present both names).
 */
export function preferredMapsProvider({ userAgent, platformHint }: VisitorPlatform = {}): MapsProvider {
  const hint = (platformHint ?? "").replace(/"/g, "").trim().toLowerCase();
  if (hint === "android") return "google";
  if (hint === "ios" || hint === "macos") return "apple";
  if (hint === "windows" || hint === "linux" || hint === "chrome os" || hint === "chromeos") return "google";

  const agent = userAgent ?? "";
  if (/Android/i.test(agent)) return "google";
  if (/\b(iPhone|iPad|iPod)\b/.test(agent)) return "apple";
  if (/Macintosh|Mac OS X/.test(agent)) return "apple";
  return "google";
}

export interface DirectionsLink {
  readonly provider: MapsProvider;
  readonly url: string;
  /** The name of the application, as French speakers know it. */
  readonly providerName: string;
}

export interface DirectionsLinks {
  /** « Itinéraire »: the visitor's most probable application. */
  readonly primary: DirectionsLink;
  /** The other provider, always offered beside it. */
  readonly alternative?: DirectionsLink;
}

const PROVIDER_NAMES: Readonly<Record<MapsProvider, string>> = { apple: "Plans", google: "Google Maps" };

/**
 * The two directions links of a destination, the visitor's probable
 * application first. `undefined` when no link can be built for it (a text
 * that is not a plain line, or a URL beyond the documented limit): the page
 * then shows the address alone.
 */
export function directionsLinks(destination: string, platform: VisitorPlatform = {}): DirectionsLinks | undefined {
  const urls: Readonly<Record<MapsProvider, string | undefined>> = {
    apple: appleDirectionsUrl(destination),
    google: googleDirectionsUrl(destination),
  };
  const link = (provider: MapsProvider): DirectionsLink | undefined => {
    const url = urls[provider];
    return url === undefined ? undefined : { provider, url, providerName: PROVIDER_NAMES[provider] };
  };
  const preferred = preferredMapsProvider(platform);
  const other: MapsProvider = preferred === "apple" ? "google" : "apple";
  const primary = link(preferred) ?? link(other);
  if (primary === undefined) return undefined;
  const alternative = primary.provider === preferred ? link(other) : undefined;
  return { primary, ...(alternative !== undefined ? { alternative } : {}) };
}

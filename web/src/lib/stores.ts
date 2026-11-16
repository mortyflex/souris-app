import { STORE_LISTINGS } from "./store-listings";

/**
 * Where BeautIzzy can be downloaded — THE one place that says so.
 *
 * BeautIzzy is a mobile application (iPhone and Android). The website shows
 * an official store badge for a platform ONLY when its public listing is
 * live and its URL has been checked by hand; until then it says « Bientôt ».
 *
 * Rules:
 * - Availability is a FACT about the stores, never derived from the website's
 *   environment (Staging and Production read the same configuration).
 * - A listing is `public` only once anyone can download the app from it.
 *   TestFlight, Play internal / closed testing and private links are NOT
 *   public: their URLs are refused by `publicStoreUrl` anyway.
 * - Each platform is independent (Apple available while Google is pending,
 *   and the reverse).
 * - No URL is ever guessed: a missing or malformed URL makes the platform
 *   « Bientôt », never a dead link.
 *
 * To publish a store link: edit src/lib/store-listings.ts — `status: "public"`
 * and the listing's URL as the store shows it (web/README.md › Store links).
 */

export type StoreId = "appStore" | "googlePlay";

export type StoreListing = { readonly status: "pending" } | { readonly status: "public"; readonly url: string };

// The listings themselves live in ./store-listings.ts (one small file to edit at launch).

/** The Android application id of the production app (app.config.js › android.package). */
export const ANDROID_PACKAGE = "com.mortyflex.sourisapp";

export interface StoreInfo {
  readonly id: StoreId;
  /** « iPhone », « Android » — what a visitor recognises. */
  readonly platform: string;
  readonly storeName: string;
  /** The official localized badge, unchanged (public/stores/, see its README). */
  readonly badge: { readonly src: string; readonly width: number; readonly height: number; readonly alt: string; readonly heightRatio: number };
}

export const STORES: Readonly<Record<StoreId, StoreInfo>> = {
  appStore: {
    id: "appStore",
    platform: "iPhone",
    storeName: "App Store",
    // Apple Marketing Tools, « Download on the App Store », black, fr-FR (SVG, 126.5 × 40).
    badge: { src: "/stores/app-store-badge-fr.svg", width: 127, height: 40, alt: "Télécharger dans l’App Store", heightRatio: 1 },
  },
  googlePlay: {
    id: "googlePlay",
    platform: "Android",
    storeName: "Google Play",
    // Google Play badge, « Disponible sur Google Play », fr (PNG 646 × 250, the badge itself is 192 px tall:
    // drawn 250/192 taller so both badges have the same visible height).
    badge: { src: "/stores/google-play-badge-fr.png", width: 646, height: 250, alt: "Disponible sur Google Play", heightRatio: 250 / 192 },
  },
};

/**
 * The listing's URL if — and only if — it is a public listing of BeautIzzy on
 * that store. Anything else (pending, missing, malformed, TestFlight, Play
 * testing tracks, another app) gives `undefined`.
 */
export function publicStoreUrl(id: StoreId, listing: StoreListing): string | undefined {
  if (listing.status !== "public") return undefined;
  let url: URL;
  try {
    url = new URL(listing.url);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return undefined;
  if (id === "appStore") {
    // https://apps.apple.com/fr/app/beautizzy/id1234567890
    if (url.hostname !== "apps.apple.com") return undefined;
    return /^\/(?:[a-z]{2}(?:-[a-z]{2,4})?\/)?app\/(?:[^/]+\/)?id\d{6,}\/?$/i.test(url.pathname) ? url.toString() : undefined;
  }
  // https://play.google.com/store/apps/details?id=com.mortyflex.sourisapp
  if (url.hostname !== "play.google.com" || url.pathname !== "/store/apps/details") return undefined;
  return url.searchParams.get("id") === ANDROID_PACKAGE ? url.toString() : undefined;
}

export interface StoreLink extends StoreInfo {
  readonly url: string;
}

export interface StoreAvailability {
  /** Platforms whose public listing is live and verified, in display order. */
  readonly available: readonly StoreLink[];
  /** Platforms still to come. */
  readonly pending: readonly StoreInfo[];
}

export function storeAvailability(listings: Readonly<Record<StoreId, StoreListing>> = STORE_LISTINGS): StoreAvailability {
  const available: StoreLink[] = [];
  const pending: StoreInfo[] = [];
  for (const id of ["appStore", "googlePlay"] as const) {
    const url = publicStoreUrl(id, listings[id]);
    if (url) available.push({ ...STORES[id], url });
    else pending.push(STORES[id]);
  }
  return { available, pending };
}

/** « Bientôt sur l’App Store et Google Play. », « Bientôt sur Google Play. » — always the truth. */
export function pendingSentence(pending: readonly StoreInfo[]): string | undefined {
  if (pending.length === 0) return undefined;
  return `Bientôt sur ${pending.map((store) => (store.id === "appStore" ? "l’App Store" : store.storeName)).join(" et ")}.`;
}

/**
 * The trademark notice the brand guidelines ask for (Apple: « Guidelines for
 * Using Apple Trademarks », App Store marketing guidelines; Google: Android
 * brand guidelines, Google Play badge guidelines). The page names iPhone,
 * App Store, Android and Google Play; a badge adds its logo. Trademarks stay
 * in English, as Apple requires.
 */
export function trademarkNotice(availability: StoreAvailability): string {
  const apple = availability.available.some((store) => store.id === "appStore");
  const google = availability.available.some((store) => store.id === "googlePlay");
  return [
    apple
      ? "Apple, le logo Apple et iPhone sont des marques d’Apple Inc., déposées aux États-Unis et dans d’autres pays."
      : "iPhone est une marque d’Apple Inc., déposée aux États-Unis et dans d’autres pays.",
    "App Store est une marque de service d’Apple Inc.",
    google ? "Android, Google Play et le logo Google Play sont des marques de Google LLC." : "Android et Google Play sont des marques de Google LLC.",
  ].join(" ");
}

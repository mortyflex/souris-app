import type { StoreId, StoreListing } from "./stores";

/**
 * BeautIzzy's public store listings — edit ONLY when a listing is live for
 * everyone (never TestFlight, never a Play testing track), with the URL the
 * store itself shows. See src/lib/stores.ts and web/README.md › Store links.
 *
 *   appStore:   { status: "public", url: "https://apps.apple.com/fr/app/beautizzy/id<number>" }
 *   googlePlay: { status: "public", url: "https://play.google.com/store/apps/details?id=com.mortyflex.sourisapp" }
 */
export const STORE_LISTINGS: Readonly<Record<StoreId, StoreListing>> = {
  appStore: { status: "pending" },
  googlePlay: { status: "pending" },
};

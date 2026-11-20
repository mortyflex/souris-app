import "server-only";

import { createPrivateKey, sign, type KeyObject } from "node:crypto";

import { serverEnv } from "@/lib/env/server";

import type { PublicLocation } from "./public-location";
import { SNAPSHOT_FRAME } from "./snapshot-frame";

/**
 * A real map of a published location: an Apple Maps Web Snapshot.
 *
 *   GET https://snapshot.apple-mapkit.com/api/v1/snapshot?…&teamId=…&keyId=…&signature=…
 *   developer.apple.com/documentation/snapshots/get-a-map-snapshot
 *   developer.apple.com/documentation/snapshots/generating-a-url-and-signature-to-create-a-maps-web-snapshot
 *
 * This module only BUILDS and SIGNS the URL, on the server: the request path
 * and its query — team and key ids included — signed with ES256 (ECDSA P-256,
 * SHA-256), the signature Base64 URL-encoded and appended LAST. The visitor's
 * browser then asks Apple for the image itself. This website never downloads
 * a snapshot, never proxies one through its image optimizer, never stores
 * one, and never geocodes anything: Apple resolves the text of the place.
 *
 * What is sent is what the page already publishes, and nothing else:
 *
 *   FULL_ADDRESS   the complete address as the map's centre, a marker on it,
 *                  street-level zoom
 *   CITY_ONLY      the CITY NAME as the centre — no marker, a zoom that shows
 *                  a town, never a street; the private street and postal code
 *                  never enter this module (the public contract does not carry
 *                  them)
 *   no location    nothing: no URL is ever built
 *
 * A URL is valid for a few hours (`expires`), in windows shared by every
 * visitor — so one location is one URL per window, not one per page view.
 * Past its window Apple answers 401 and the page shows its own artwork, like
 * for any image that does not load.
 *
 * Optional: without the three credentials — or with one that is malformed —
 * no URL is built and the page shows its artwork. Nothing is ever logged: not
 * a credential, not an address.
 */
export const SNAPSHOT_ORIGIN = "https://snapshot.apple-mapkit.com";
export const SNAPSHOT_PATH = "/api/v1/snapshot";

/** A URL lives from one to two windows: long enough for a booking, short enough to stop being a link. */
export const SNAPSHOT_WINDOW_SECONDS = 6 * 60 * 60;

/** Street level around an address; a whole town around a city name (Apple: 3 – 20). */
const ZOOM = { FULL_ADDRESS: 16, CITY_ONLY: 11 } as const;
/** The marker of a complete address — BeautIzzy's accent (tokens.css `--bz-accent`), as Apple wants a colour: hex, no « # ». */
const MARKER = [{ point: "center", color: "7354c7", markerStyle: "balloon" }] as const;

/** Apple documents no limit of its own (413 beyond it); a snapshot URL of ours is a few hundred characters. */
const MAX_URL_LENGTH = 2000;

interface SnapshotCredentials {
  readonly teamId: string;
  readonly keyId: string;
  readonly privateKey: KeyObject;
}

/** Apple Developer Team IDs and Key IDs: ten letters or digits. */
const APPLE_ID = /^[A-Z0-9]{10}$/;

let cachedKey: { readonly pem: string; readonly key: KeyObject } | undefined;

/** The .p8 file's text; a value pasted on one line keeps its line breaks as « \n ». */
function readPrivateKey(value: string): KeyObject | undefined {
  const pem = value.replace(/\\n/g, "\n").trim();
  if (cachedKey?.pem === pem) return cachedKey.key;
  try {
    const key = createPrivateKey({ key: pem, format: "pem" });
    // ES256 needs an elliptic-curve key on P-256 — anything else would sign something Apple refuses.
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return undefined;
    cachedKey = { pem, key };
    return key;
  } catch {
    return undefined;
  }
}

/** The three credentials, or nothing: a partial or malformed configuration makes no snapshot (fail closed). */
function readCredentials(): SnapshotCredentials | undefined {
  const teamId = serverEnv.appleMapsTeamId();
  const keyId = serverEnv.appleMapsKeyId();
  const secret = serverEnv.appleMapsPrivateKey();
  if (teamId === undefined || keyId === undefined || secret === undefined) return undefined;
  if (!APPLE_ID.test(teamId) || !APPLE_ID.test(keyId)) return undefined;
  const privateKey = readPrivateKey(secret);
  return privateKey === undefined ? undefined : { teamId, keyId, privateKey };
}

/** Whether this deployment can sign snapshots at all. Says nothing about a value. */
export function isMapSnapshotConfigured(): boolean {
  return readCredentials() !== undefined;
}

/**
 * When a URL signed now stops working, in seconds since the epoch: the end of
 * the window AFTER the current one — the same for every request of a window.
 */
export function snapshotExpiry(nowMs: number): number {
  const now = Math.floor(nowMs / 1000);
  return (Math.floor(now / SNAPSHOT_WINDOW_SECONDS) + 2) * SNAPSHOT_WINDOW_SECONDS;
}

/**
 * The query of a snapshot, unsigned, in a fixed order (reordering a signed
 * query invalidates it). Every value is percent-encoded.
 */
export function snapshotQuery(location: PublicLocation, expires: number): string {
  const exact = location.visibility === "FULL_ADDRESS";
  const parameters: [string, string][] = [
    // Text that Apple geocodes: the published address, or the published city name — nothing more precise.
    ["center", exact ? location.directionsDestination : location.city],
    ["z", String(ZOOM[location.visibility])],
    // The frame the page draws it in (snapshot-frame.ts): shown whole, never cropped.
    ["size", `${SNAPSHOT_FRAME.width}x${SNAPSHOT_FRAME.height}`],
    ["scale", "2"],
    ["t", "standard"],
    ["colorScheme", "light"],
    // Points of interest help to find a street; around a whole town they are noise.
    ["poi", exact ? "1" : "0"],
    ["lang", "fr-FR"],
  ];
  // A marker says « exactly here »: only a complete published address has one.
  if (exact) parameters.push(["annotations", JSON.stringify(MARKER)]);
  parameters.push(["expires", String(expires)]);
  return parameters.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("&");
}

/** ES256 over the exact text sent — the JWS form: the raw r ‖ s pair, Base64 URL-encoded, no padding. */
function signature(text: string, privateKey: KeyObject): string {
  return sign("sha256", Buffer.from(text, "utf8"), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
}

/**
 * The signed URL of the map of a published location, or `undefined` when none
 * can be made: no credentials, a malformed one, or a URL beyond a safe length.
 * The caller then shows the page's own artwork — never a broken or a fake map.
 */
export function mapSnapshotUrl(location: PublicLocation, nowMs: number = Date.now()): string | undefined {
  const credentials = readCredentials();
  if (credentials === undefined) return undefined;
  const query = snapshotQuery(location, snapshotExpiry(nowMs));
  // What Apple verifies: the path and every parameter, the two ids last — then the signature after them.
  const signed = `${SNAPSHOT_PATH}?${query}&teamId=${credentials.teamId}&keyId=${credentials.keyId}`;
  let url: string;
  try {
    url = `${SNAPSHOT_ORIGIN}${signed}&signature=${signature(signed, credentials.privateKey)}`;
  } catch {
    return undefined;
  }
  return url.length <= MAX_URL_LENGTH ? url : undefined;
}

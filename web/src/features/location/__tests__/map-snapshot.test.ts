import { generateKeyPairSync, verify } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isMapSnapshotConfigured,
  mapSnapshotUrl,
  SNAPSHOT_ORIGIN,
  SNAPSHOT_PATH,
  SNAPSHOT_WINDOW_SECONDS,
  snapshotExpiry,
  snapshotQuery,
} from "../map-snapshot";
import type { PublicLocation } from "../public-location";

// A FICTIONAL signing identity, generated for this run: no real Apple
// credential exists in this repository, and none is ever needed by a test.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const TEAM_ID = "A1B2C3D4E5";
const KEY_ID = "Z9Y8X7W6V5";

const FULL: PublicLocation = {
  visibility: "FULL_ADDRESS",
  street: "12 avenue Jean Jaurès",
  postalCode: "69007",
  city: "Lyon",
  directionsDestination: "12 avenue Jean Jaurès, 69007 Lyon",
};
const CITY: PublicLocation = { visibility: "CITY_ONLY", city: "Lyon" };

/** 2026-11-19T10:00:00Z */
const NOW = Date.UTC(2026, 10, 19, 10, 0, 0);

function configure(overrides: Partial<Record<"APPLE_MAPS_TEAM_ID" | "APPLE_MAPS_KEY_ID" | "APPLE_MAPS_PRIVATE_KEY", string | undefined>> = {}) {
  const values = { APPLE_MAPS_TEAM_ID: TEAM_ID, APPLE_MAPS_KEY_ID: KEY_ID, APPLE_MAPS_PRIVATE_KEY: PEM, ...overrides };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value ?? "");
}

/** Splits a signed URL the way Apple reads it: what was signed, and the signature after it. */
function split(url: string) {
  const marker = "&signature=";
  const at = url.lastIndexOf(marker);
  const signed = url.slice(SNAPSHOT_ORIGIN.length, at);
  return { signed, signature: url.slice(at + marker.length), parameters: new URL(url).searchParams };
}

beforeEach(() => configure());
afterEach(() => vi.unstubAllEnvs());

describe("the signed URL — Apple's documented scheme", () => {
  it("asks snapshot.apple-mapkit.com for /api/v1/snapshot, over HTTPS", () => {
    const url = new URL(mapSnapshotUrl(FULL, NOW) ?? "");
    expect(url.origin).toBe("https://snapshot.apple-mapkit.com");
    expect(url.pathname).toBe("/api/v1/snapshot");
    expect(SNAPSHOT_PATH).toBe("/api/v1/snapshot");
  });

  it("signs the request path and EVERY query parameter, the team and key ids included, with ES256 — verified with the public key", () => {
    const url = mapSnapshotUrl(FULL, NOW) ?? "";
    const { signed, signature } = split(url);

    expect(signed.startsWith("/api/v1/snapshot?center=")).toBe(true);
    expect(signed.endsWith(`&teamId=${TEAM_ID}&keyId=${KEY_ID}`)).toBe(true);
    // ES256 as JWS writes it: the raw r ‖ s pair (64 bytes), Base64 URL-encoded, no padding.
    expect(signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    const raw = Buffer.from(signature, "base64url");
    expect(raw).toHaveLength(64);
    expect(verify("sha256", Buffer.from(signed, "utf8"), { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(true);
  });

  it("puts the signature LAST — Apple refuses it anywhere else", () => {
    const url = mapSnapshotUrl(FULL, NOW) ?? "";
    const names = [...new URL(url).searchParams.keys()];
    expect(names.at(-1)).toBe("signature");
    expect(names.slice(-3)).toEqual(["teamId", "keyId", "signature"]);
    expect(names.filter((name) => name === "signature")).toHaveLength(1);
  });

  it("a signature does not survive a changed, added or reordered parameter", () => {
    const url = mapSnapshotUrl(FULL, NOW) ?? "";
    const { signed, signature } = split(url);
    const raw = Buffer.from(signature, "base64url");
    const check = (text: string) => verify("sha256", Buffer.from(text, "utf8"), { key: publicKey, dsaEncoding: "ieee-p1363" }, raw);

    expect(check(signed)).toBe(true);
    expect(check(signed.replace("z=16", "z=20"))).toBe(false);
    expect(check(signed.replace("69007", "69001"))).toBe(false);
    expect(check(`${signed}&poi=0`)).toBe(false);
    expect(check(signed.replace(/expires=\d+/, "expires=9999999999"))).toBe(false);
    expect(check(signed.replace(`teamId=${TEAM_ID}`, "teamId=EVILTEAM00"))).toBe(false);
  });

  it("is not verified by another key", () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey;
    const { signed, signature } = split(mapSnapshotUrl(FULL, NOW) ?? "");
    expect(verify("sha256", Buffer.from(signed, "utf8"), { key: other, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(false);
  });

  it("percent-encodes every value: what is signed is exactly what is sent", () => {
    const url = mapSnapshotUrl(FULL, NOW) ?? "";
    expect(url).toContain("center=12%20avenue%20Jean%20Jaur%C3%A8s%2C%2069007%20Lyon");
    expect(url).not.toMatch(/[ "<>{}\[\]]/);
    expect(new URL(url).searchParams.get("center")).toBe("12 avenue Jean Jaurès, 69007 Lyon");
  });

  it("an address cannot add or replace a parameter", () => {
    const hostile: PublicLocation = { ...FULL, directionsDestination: "1 rue&z=3&teamId=EVIL&signature=x, 75001 Paris" };
    const parameters = new URL(mapSnapshotUrl(hostile, NOW) ?? "").searchParams;
    expect(parameters.get("center")).toBe("1 rue&z=3&teamId=EVIL&signature=x, 75001 Paris");
    expect(parameters.getAll("z")).toEqual(["16"]);
    expect(parameters.getAll("teamId")).toEqual([TEAM_ID]);
    expect(parameters.getAll("signature")).toHaveLength(1);
  });

  it("never contains the private key, nor any part of it", () => {
    const url = mapSnapshotUrl(FULL, NOW) ?? "";
    const body = PEM.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
    expect(url).not.toContain("PRIVATE KEY");
    for (let index = 0; index + 16 <= body.length; index += 16) expect(url).not.toContain(body.slice(index, index + 16));
    expect(Buffer.from(body, "base64").toString("base64url")).not.toBe(split(url).signature);
  });
});

describe("what is asked for", () => {
  it("a complete address: centred on it, street-level, WITH a marker on the centre", () => {
    const parameters = new URL(mapSnapshotUrl(FULL, NOW) ?? "").searchParams;
    expect(parameters.get("center")).toBe("12 avenue Jean Jaurès, 69007 Lyon");
    expect(parameters.get("z")).toBe("16");
    expect(JSON.parse(parameters.get("annotations") ?? "null")).toEqual([{ point: "center", color: "7354c7", markerStyle: "balloon" }]);
    expect(parameters.get("poi")).toBe("1");
  });

  it("a city: centred on the CITY NAME, a town-level zoom, and NO marker at all", () => {
    const url = mapSnapshotUrl(CITY, NOW) ?? "";
    const parameters = new URL(url).searchParams;
    expect(parameters.get("center")).toBe("Lyon");
    expect(parameters.get("z")).toBe("11");
    expect(parameters.has("annotations")).toBe(false);
    expect(parameters.has("overlays")).toBe(false);
    expect(parameters.get("poi")).toBe("0");
    // Nothing more precise than the name of the town: no street, no postal code, no coordinates.
    expect(url).not.toMatch(/Jaur|69007|avenue|point|%2C-?\d|\d+\.\d{3,}/);
  });

  it("the page's own frame and language: 600 × 300 at 2×, a light standard map, in French", () => {
    for (const location of [FULL, CITY]) {
      const parameters = new URL(mapSnapshotUrl(location, NOW) ?? "").searchParams;
      expect(parameters.get("size")).toBe("600x300");
      expect(parameters.get("scale")).toBe("2");
      expect(parameters.get("t")).toBe("standard");
      expect(parameters.get("colorScheme")).toBe("light");
      expect(parameters.get("lang")).toBe("fr-FR");
    }
  });

  it("uses only parameters Apple documents, within their documented ranges", () => {
    const documented = ["center", "z", "size", "scale", "t", "colorScheme", "poi", "lang", "annotations", "expires", "teamId", "keyId", "signature"];
    for (const location of [FULL, CITY]) {
      const parameters = new URL(mapSnapshotUrl(location, NOW) ?? "").searchParams;
      for (const name of parameters.keys()) expect(documented).toContain(name);
      const zoom = Number(parameters.get("z"));
      expect(zoom).toBeGreaterThanOrEqual(3);
      expect(zoom).toBeLessThanOrEqual(20);
      const [width, height] = (parameters.get("size") ?? "").split("x").map(Number);
      for (const side of [width, height]) {
        expect(side).toBeGreaterThanOrEqual(50);
        expect(side).toBeLessThanOrEqual(640);
      }
      expect(["1", "2", "3"]).toContain(parameters.get("scale"));
      // No token (the signature authorizes), no referer (its matching is undocumented), no geocode of ours.
      expect(parameters.has("token")).toBe(false);
      expect(parameters.has("referer")).toBe(false);
    }
  });

  it("the unsigned query keeps ONE fixed order", () => {
    expect(snapshotQuery(FULL, 1_800_000_000).split("&").map((pair) => pair.split("=")[0])).toEqual([
      "center", "z", "size", "scale", "t", "colorScheme", "poi", "lang", "annotations", "expires",
    ]);
    expect(snapshotQuery(CITY, 1_800_000_000).split("&").map((pair) => pair.split("=")[0])).toEqual([
      "center", "z", "size", "scale", "t", "colorScheme", "poi", "lang", "expires",
    ]);
  });
});

describe("expiry — a URL stops being a link", () => {
  it("expires in seconds since the epoch, between one and two windows from now", () => {
    const expires = Number(new URL(mapSnapshotUrl(FULL, NOW) ?? "").searchParams.get("expires"));
    const now = NOW / 1000;
    expect(Number.isInteger(expires)).toBe(true);
    expect(expires - now).toBeGreaterThan(SNAPSHOT_WINDOW_SECONDS);
    expect(expires - now).toBeLessThanOrEqual(2 * SNAPSHOT_WINDOW_SECONDS);
    expect(expires).toBe(snapshotExpiry(NOW));
  });

  it("is the same for every visitor of a window: one location is ONE URL, not one per page view", () => {
    const start = Math.floor(NOW / 1000 / SNAPSHOT_WINDOW_SECONDS) * SNAPSHOT_WINDOW_SECONDS * 1000;
    const first = mapSnapshotUrl(FULL, start);
    expect(new URL(first ?? "").searchParams.get("expires")).toBe(new URL(mapSnapshotUrl(FULL, start + 5 * 60 * 1000) ?? "").searchParams.get("expires"));
    expect(snapshotExpiry(start)).toBe(snapshotExpiry(start + SNAPSHOT_WINDOW_SECONDS * 1000 - 1));
    // The next window signs a new URL.
    expect(snapshotExpiry(start + SNAPSHOT_WINDOW_SECONDS * 1000)).toBe(snapshotExpiry(start) + SNAPSHOT_WINDOW_SECONDS);
  });

  it("a URL signed long ago carries a time that is past: Apple answers 401, and the page falls back", () => {
    const old = Number(new URL(mapSnapshotUrl(FULL, NOW - 3 * SNAPSHOT_WINDOW_SECONDS * 1000) ?? "").searchParams.get("expires"));
    expect(old).toBeLessThan(NOW / 1000);
  });

  it("never signs a URL without an expiry", () => {
    for (const location of [FULL, CITY]) expect(mapSnapshotUrl(location, NOW)).toMatch(/[?&]expires=\d{10}&/);
  });
});

describe("credentials — all three, well-formed, or no snapshot at all (fail closed)", () => {
  it("is configured with the three values", () => {
    expect(isMapSnapshotConfigured()).toBe(true);
  });

  it.each([
    ["no team id", { APPLE_MAPS_TEAM_ID: undefined }],
    ["no key id", { APPLE_MAPS_KEY_ID: undefined }],
    ["no private key", { APPLE_MAPS_PRIVATE_KEY: undefined }],
    ["a blank private key", { APPLE_MAPS_PRIVATE_KEY: "   " }],
    ["a team id of the wrong shape", { APPLE_MAPS_TEAM_ID: "team-id" }],
    ["a key id of the wrong shape", { APPLE_MAPS_KEY_ID: "abc" }],
    ["an id that tries to add a parameter", { APPLE_MAPS_KEY_ID: "ABCDE&z=3X" }],
    ["a private key that is not a key", { APPLE_MAPS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nnot a key\n-----END PRIVATE KEY-----" }],
    ["plain text instead of a key", { APPLE_MAPS_PRIVATE_KEY: "secret" }],
  ])("%s: no URL, for an address or a city", (_label, overrides) => {
    configure(overrides);
    expect(isMapSnapshotConfigured()).toBe(false);
    expect(mapSnapshotUrl(FULL, NOW)).toBeUndefined();
    expect(mapSnapshotUrl(CITY, NOW)).toBeUndefined();
  });

  it("refuses a key that is not on P-256: ES256 cannot be signed with it", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    for (const key of [rsa, p384]) {
      configure({ APPLE_MAPS_PRIVATE_KEY: key });
      expect(mapSnapshotUrl(FULL, NOW)).toBeUndefined();
    }
  });

  it("accepts the .p8 text pasted on ONE line, its line breaks written « \\n »", () => {
    configure({ APPLE_MAPS_PRIVATE_KEY: PEM.trim().replace(/\n/g, "\\n") });
    const { signed, signature } = split(mapSnapshotUrl(FULL, NOW) ?? "");
    expect(verify("sha256", Buffer.from(signed, "utf8"), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("with no configuration at all — every environment today — there is simply no map", () => {
    vi.unstubAllEnvs();
    for (const name of ["APPLE_MAPS_TEAM_ID", "APPLE_MAPS_KEY_ID", "APPLE_MAPS_PRIVATE_KEY"]) vi.stubEnv(name, "");
    expect(isMapSnapshotConfigured()).toBe(false);
    expect(mapSnapshotUrl(FULL)).toBeUndefined();
  });

  it("never writes a credential or an address to the console", () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    mapSnapshotUrl(FULL, NOW);
    configure({ APPLE_MAPS_PRIVATE_KEY: "broken" });
    mapSnapshotUrl(FULL, NOW);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("limits", () => {
  it("builds nothing rather than a URL too long to be served", () => {
    // 300 four-byte characters: a centre of 3 600 characters once percent-encoded.
    const huge: PublicLocation = { ...FULL, directionsDestination: "🌸".repeat(300) };
    expect(mapSnapshotUrl(huge, NOW)).toBeUndefined();
    expect((mapSnapshotUrl(FULL, NOW) ?? "").length).toBeLessThan(600);
  });
});

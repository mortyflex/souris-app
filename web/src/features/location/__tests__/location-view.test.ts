import { describe, expect, it, vi } from "vitest";

import { buildLocationView } from "../location-view";
import type { PublicLocation } from "../public-location";

const FULL: PublicLocation = {
  visibility: "FULL_ADDRESS",
  street: "12 avenue Jean Jaurès",
  postalCode: "69007",
  city: "Lyon",
  directionsDestination: "12 avenue Jean Jaurès, 69007 Lyon",
};
const CITY: PublicLocation = { visibility: "CITY_ONLY", city: "Lyon" };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile/15E148 Safari/604.1";
const MAP = "https://snapshot.apple-mapkit.com/api/v1/snapshot?center=x&signature=y";

describe("buildLocationView", () => {
  it("no published location: NO view — nothing to render, nothing to sign, nothing to open", () => {
    const mapUrl = vi.fn(() => MAP);
    expect(buildLocationView(undefined, { userAgent: IPHONE, mapUrl })).toBeUndefined();
    expect(mapUrl).not.toHaveBeenCalled();
  });

  it("a complete address: its two lines, both directions links, the map", () => {
    const view = buildLocationView(FULL, { userAgent: IPHONE, mapUrl: () => MAP });
    expect(view).toEqual({
      kind: "address",
      lines: ["12 avenue Jean Jaurès", "69007 Lyon"],
      spoken: "12 avenue Jean Jaurès, 69007 Lyon",
      directions: {
        primary: expect.objectContaining({ provider: "apple" }),
        alternative: expect.objectContaining({ provider: "google" }),
      },
      mapUrl: MAP,
    });
  });

  it("a city: the name and a map — never a destination, a link, a street or a postal code", () => {
    const view = buildLocationView(CITY, { userAgent: IPHONE, mapUrl: () => MAP });
    expect(view).toEqual({ kind: "city", city: "Lyon", mapUrl: MAP });
    expect(JSON.stringify(view)).not.toMatch(/directions|maps\.apple|google|destination|lines|spoken/);
  });

  it("without a map (no credentials, or a signature that failed): the same view, minus the image — directions included", () => {
    expect(buildLocationView(FULL, { userAgent: IPHONE, mapUrl: () => undefined })).toMatchObject({
      kind: "address",
      directions: { primary: { provider: "apple" } },
    });
    expect(buildLocationView(FULL, { userAgent: IPHONE })).not.toHaveProperty("mapUrl");
    expect(buildLocationView(CITY)).toEqual({ kind: "city", city: "Lyon" });
  });

  it("asks for the map of exactly the public location it was given", () => {
    const mapUrl = vi.fn(() => MAP);
    buildLocationView(CITY, { mapUrl });
    expect(mapUrl).toHaveBeenCalledWith(CITY);
  });

  it("is plain data: it crosses from the server to the browser unchanged", () => {
    const view = buildLocationView(FULL, { userAgent: IPHONE, mapUrl: () => MAP });
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });

  it("an address whose directions cannot be built keeps its lines, without any link", () => {
    const view = buildLocationView({ ...FULL, directionsDestination: "🌸".repeat(300) });
    expect(view).toMatchObject({ kind: "address", lines: ["12 avenue Jean Jaurès", "69007 Lyon"] });
    expect(view).not.toHaveProperty("directions");
  });
});

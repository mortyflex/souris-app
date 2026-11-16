import { describe, expect, it } from "vitest";

import { STORE_LISTINGS } from "../store-listings";
import { ANDROID_PACKAGE, pendingSentence, publicStoreUrl, storeAvailability, type StoreListing } from "../stores";

const APPLE = "https://apps.apple.com/fr/app/beautizzy/id6700000000";
const GOOGLE = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const pub = (url: string): StoreListing => ({ status: "public", url });
const pending: StoreListing = { status: "pending" };

describe("store availability", () => {
  it("today: neither store is public — no link, the honest « Bientôt »", () => {
    expect(STORE_LISTINGS).toEqual({ appStore: { status: "pending" }, googlePlay: { status: "pending" } });
    const availability = storeAvailability();
    expect(availability.available).toEqual([]);
    expect(availability.pending.map((store) => store.id)).toEqual(["appStore", "googlePlay"]);
    expect(pendingSentence(availability.pending)).toBe("Bientôt sur l’App Store et Google Play.");
  });

  it("only Apple public", () => {
    const availability = storeAvailability({ appStore: pub(APPLE), googlePlay: pending });
    expect(availability.available.map((store) => [store.id, store.url])).toEqual([["appStore", APPLE]]);
    expect(pendingSentence(availability.pending)).toBe("Bientôt sur Google Play.");
  });

  it("only Google Play public", () => {
    const availability = storeAvailability({ appStore: pending, googlePlay: pub(GOOGLE) });
    expect(availability.available.map((store) => [store.id, store.url])).toEqual([["googlePlay", GOOGLE]]);
    expect(pendingSentence(availability.pending)).toBe("Bientôt sur l’App Store.");
  });

  it("both public: two links, nothing pending", () => {
    const availability = storeAvailability({ appStore: pub(APPLE), googlePlay: pub(GOOGLE) });
    expect(availability.available.map((store) => store.id)).toEqual(["appStore", "googlePlay"]);
    expect(pendingSentence(availability.pending)).toBeUndefined();
  });

  it.each([
    ["empty", ""],
    ["not a URL", "beautizzy"],
    ["http", "http://apps.apple.com/fr/app/beautizzy/id6700000000"],
    ["javascript:", "javascript:alert(1)"],
    ["TestFlight", "https://testflight.apple.com/join/AbCdEf12"],
    ["an App Store search", "https://apps.apple.com/fr/search?term=beautizzy"],
    ["a developer page", "https://apps.apple.com/fr/developer/mortyflex/id1234567890"],
    ["a look-alike host", "https://apps.apple.com.evil.example/fr/app/beautizzy/id6700000000"],
    ["credentials in the URL", "https://user:pass@apps.apple.com/fr/app/beautizzy/id6700000000"],
  ])("App Store: %s is never a public link", (_case, url) => {
    expect(publicStoreUrl("appStore", pub(url))).toBeUndefined();
  });

  it.each([
    ["Play internal testing", "https://play.google.com/apps/internaltest/4700000000000000000"],
    ["Play closed testing", `https://play.google.com/apps/testing/${ANDROID_PACKAGE}`],
    ["another application", "https://play.google.com/store/apps/details?id=com.example.other"],
    ["no application id", "https://play.google.com/store/apps/details"],
    ["the development build", `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}.dev`],
    ["an App Store URL", APPLE],
  ])("Google Play: %s is never a public link", (_case, url) => {
    expect(publicStoreUrl("googlePlay", pub(url))).toBeUndefined();
  });

  it("accepts the listing URLs as the stores show them (with or without country, query)", () => {
    expect(publicStoreUrl("appStore", pub("https://apps.apple.com/app/id6700000000"))).toBeDefined();
    expect(publicStoreUrl("appStore", pub("https://apps.apple.com/fr/app/beautizzy/id6700000000?platform=iphone"))).toBeDefined();
    expect(publicStoreUrl("googlePlay", pub(`${GOOGLE}&hl=fr`))).toBeDefined();
  });

  it("a malformed public URL degrades to « Bientôt », never to a dead link", () => {
    const availability = storeAvailability({ appStore: pub("https://testflight.apple.com/join/x"), googlePlay: pub("") });
    expect(availability.available).toEqual([]);
    expect(availability.pending).toHaveLength(2);
  });
});

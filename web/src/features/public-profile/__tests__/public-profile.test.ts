import { describe, expect, it } from "vitest";

import { parsePublicProfile, publicMediaUrl } from "../public-profile";

const MEDIA = "22222222-2222-4222-8222-222222222222";
const LOGO = `${MEDIA}/logo/33333333-3333-4333-8333-333333333333.jpg`;
const COVER = `${MEDIA}/cover/44444444-4444-4444-8444-444444444444.jpg`;

const LOCATION = {
  visibility: "FULL_ADDRESS",
  street: "1 rue de la Paix",
  postal_code: "75002",
  city: "Paris",
  directions_destination: "1 rue de la Paix, 75002 Paris",
};

const answer = {
  slug: "chez-amelie",
  name: "Chez Amélie",
  description: "Coiffure sur rendez-vous.",
  phone: "06 00 00 00 00",
  email: "salon@example.test",
  // The compatibility alias of the location contract: never read by this website.
  address: "1 rue de la Paix\n75002 Paris",
  location: LOCATION,
  logo_path: LOGO,
  cover_path: COVER,
  time_zone: "Europe/Paris",
  booking_enabled: true,
};

describe("parsePublicProfile", () => {
  it("reads a complete profile", () => {
    expect(parsePublicProfile(answer)).toEqual({
      slug: "chez-amelie",
      name: "Chez Amélie",
      description: "Coiffure sur rendez-vous.",
      phone: "06 00 00 00 00",
      email: "salon@example.test",
      location: {
        visibility: "FULL_ADDRESS",
        street: "1 rue de la Paix",
        postalCode: "75002",
        city: "Paris",
        directionsDestination: "1 rue de la Paix, 75002 Paris",
      },
      logoPath: LOGO,
      coverPath: COVER,
      timeZone: "Europe/Paris",
      bookingEnabled: true,
    });
  });

  it("reads a minimal profile: optional fields absent, bookings paused", () => {
    expect(
      parsePublicProfile({
        slug: "abc",
        name: "Abc",
        description: null,
        phone: null,
        email: null,
        address: null,
        location: null,
        logo_path: null,
        cover_path: null,
      }),
    ).toEqual({ slug: "abc", name: "Abc", timeZone: "Europe/Paris", bookingEnabled: false });
  });

  describe("the location — the `location` key alone, at the level the server applied", () => {
    it("a city-only page: the city, and nothing of an address", () => {
      const profile = parsePublicProfile({ ...answer, address: null, location: { visibility: "CITY_ONLY", city: "Paris" } });
      expect(profile?.location).toEqual({ visibility: "CITY_ONLY", city: "Paris" });
      expect(JSON.stringify(profile)).not.toMatch(/rue de la Paix|75002/);
    });

    it("a hidden location, or one never chosen: no location", () => {
      expect(parsePublicProfile({ ...answer, address: null, location: null })).not.toHaveProperty("location");
    });

    it("NEVER falls back to `address`: a database that predates the contract still returns the raw legacy text there", () => {
      // Before 20261020120000 the answer has no `location` key, and `address` is the professional's
      // free text — published the old way, which she never explicitly chose to publish under the new one.
      const legacy = Object.fromEntries(Object.entries({ ...answer, address: "8 rue des Lilas\n69001 Lyon" }).filter(([key]) => key !== "location"));
      expect(legacy).not.toHaveProperty("location");
      const profile = parsePublicProfile(legacy);
      expect(profile).not.toBeNull();
      expect(profile).not.toHaveProperty("location");
      expect(profile).not.toHaveProperty("address");
      expect(JSON.stringify(profile)).not.toMatch(/Lilas|69001|Lyon/);
    });

    it("never reads `address` even beside a location that says less", () => {
      const profile = parsePublicProfile({ ...answer, address: "8 rue Secrète\n75001 Paris", location: { visibility: "CITY_ONLY", city: "Paris" } });
      expect(JSON.stringify(profile)).not.toMatch(/Secrète|75001/);
      expect(profile?.location).toEqual({ visibility: "CITY_ONLY", city: "Paris" });
    });

    it("a location it cannot read is no location — the page stays online, without a place", () => {
      for (const location of [
        "1 rue de la Paix, 75002 Paris",
        { visibility: "HIDDEN" },
        { visibility: "CITY_ONLY", city: "Paris", street: "1 rue de la Paix" },
        { ...LOCATION, postal_code: undefined },
        { ...LOCATION, latitude: 48.869, longitude: 2.331 },
      ]) {
        const profile = parsePublicProfile({ ...answer, location });
        expect(profile?.slug).toBe("chez-amelie");
        expect(profile).not.toHaveProperty("location");
      }
    });
  });

  it("reads no profile from null or a malformed answer", () => {
    for (const data of [null, undefined, "x", 42, [], [answer], {}, { slug: "abc" }, { name: "Abc" }, { slug: "", name: "Abc" }]) {
      expect(parsePublicProfile(data)).toBeNull();
    }
  });

  it("copies only the approved fields, whatever else the answer carries", () => {
    const profile = parsePublicProfile({
      ...answer,
      business_id: "11111111-1111-4111-8111-111111111111",
      owner_user_id: "55555555-5555-4555-8555-555555555555",
      plus_access: true,
      published: true,
      total_spent_cents: 123456,
    });
    expect(Object.keys(profile ?? {}).sort()).toEqual(
      ["bookingEnabled", "coverPath", "description", "email", "location", "logoPath", "name", "phone", "slug", "timeZone"].sort(),
    );
    expect(JSON.stringify(profile)).not.toMatch(/11111111|55555555|plus|123456/);
  });

  it("drops an image path that is not a public branding path", () => {
    const profile = parsePublicProfile({
      ...answer,
      logo_path: "11111111-1111-4111-8111-111111111111/clients/client-lea/photo.jpg",
      cover_path: LOGO,
    });
    expect(profile?.logoPath).toBeUndefined();
    expect(profile?.coverPath).toBeUndefined();
  });
});

describe("publicMediaUrl", () => {
  it("builds the public object URL of the branding bucket", () => {
    expect(publicMediaUrl("https://ref.supabase.co/", LOGO)).toBe(
      `https://ref.supabase.co/storage/v1/object/public/business-public-media/${LOGO}`,
    );
  });

  it("builds nothing without a project URL or for a foreign path", () => {
    expect(publicMediaUrl(undefined, LOGO)).toBeUndefined();
    expect(publicMediaUrl("https://ref.supabase.co", "../business-media/x.jpg")).toBeUndefined();
  });
});

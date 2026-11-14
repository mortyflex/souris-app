import { describe, expect, it } from "vitest";

import { parsePublicProfile, publicMediaUrl } from "../public-profile";

const MEDIA = "22222222-2222-4222-8222-222222222222";
const LOGO = `${MEDIA}/logo/33333333-3333-4333-8333-333333333333.jpg`;
const COVER = `${MEDIA}/cover/44444444-4444-4444-8444-444444444444.jpg`;

const answer = {
  slug: "chez-amelie",
  name: "Chez Amélie",
  description: "Coiffure sur rendez-vous.",
  phone: "06 00 00 00 00",
  email: "salon@example.test",
  address: "1 rue de la Paix, Paris",
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
      address: "1 rue de la Paix, Paris",
      logoPath: LOGO,
      coverPath: COVER,
      timeZone: "Europe/Paris",
      bookingEnabled: true,
    });
  });

  it("reads a minimal profile: optional fields absent, bookings paused", () => {
    expect(
      parsePublicProfile({ slug: "abc", name: "Abc", description: null, phone: null, email: null, address: null, logo_path: null, cover_path: null }),
    ).toEqual({ slug: "abc", name: "Abc", timeZone: "Europe/Paris", bookingEnabled: false });
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
      ["address", "bookingEnabled", "coverPath", "description", "email", "logoPath", "name", "phone", "slug", "timeZone"].sort(),
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

import { describe, expect, it } from "vitest";

import { bookingPath, isValidProfileSlug, profilePath } from "../slug";

describe("profile slug", () => {
  it.each(["abc", "chez-amelie", "salon-75011", "a".repeat(60)])("accepts %s", (slug) => {
    expect(isValidProfileSlug(slug)).toBe(true);
  });

  it.each(["", "ab", "a".repeat(61), "Bad_Slug", "Chez-Amelie", "a--b", "-abc", "abc-", "a b c", "é-salon", "a/b", "abc%20"])(
    "refuses %j",
    (slug) => {
      expect(isValidProfileSlug(slug)).toBe(false);
    },
  );

  it("builds the public paths", () => {
    expect(profilePath("chez-amelie")).toBe("/r/chez-amelie");
    expect(bookingPath("chez-amelie")).toBe("/r/chez-amelie/reserver");
  });
});

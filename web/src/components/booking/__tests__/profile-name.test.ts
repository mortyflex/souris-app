import { describe, expect, it } from "vitest";

import { profileNameRole } from "../profile-name";

describe("profileNameRole", () => {
  it("gives a short name the full display size", () => {
    expect(profileNameRole("Atelier Éléonore")).toBe("type-name");
    expect(profileNameRole("a".repeat(24))).toBe("type-name");
  });

  it("steps a longer name down, then down again", () => {
    expect(profileNameRole("a".repeat(25))).toBe("type-name-medium");
    expect(profileNameRole("Institut de beauté Cœur d’Ébène")).toBe("type-name-medium");
    expect(profileNameRole("a".repeat(48))).toBe("type-name-medium");
    expect(profileNameRole("a".repeat(49))).toBe("type-name-long");
    expect(profileNameRole("a".repeat(120))).toBe("type-name-long");
  });

  it("counts an accented letter once, whatever its encoding, and ignores surrounding spaces", () => {
    const decomposed = "É".repeat(24); // « É » as E + combining accent: 48 code points
    expect(profileNameRole("É".repeat(24))).toBe("type-name");
    expect(profileNameRole(decomposed)).toBe("type-name");
    expect(profileNameRole(`  ${"é".repeat(24)}  `)).toBe("type-name");
  });
});

import { describe, expect, it } from "vitest";

import { addressLines, isPlainLine, parsePublicLocation } from "../public-location";

const FULL = {
  visibility: "FULL_ADDRESS",
  street: "12 avenue Jean Jaurès",
  postal_code: "69007",
  city: "Lyon",
  directions_destination: "12 avenue Jean Jaurès, 69007 Lyon",
};
const CITY = { visibility: "CITY_ONLY", city: "Lyon" };

const RLO = String.fromCharCode(0x202e);
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const NBSP = String.fromCharCode(0xa0);

describe("parsePublicLocation — the two public shapes, and nothing else", () => {
  it("reads a complete address", () => {
    expect(parsePublicLocation(FULL)).toEqual({
      visibility: "FULL_ADDRESS",
      street: "12 avenue Jean Jaurès",
      postalCode: "69007",
      city: "Lyon",
      directionsDestination: "12 avenue Jean Jaurès, 69007 Lyon",
    });
  });

  it("reads a city — the city name and nothing else", () => {
    expect(parsePublicLocation(CITY)).toEqual({ visibility: "CITY_ONLY", city: "Lyon" });
  });

  it("reads no location from a hidden one, one never chosen, or a database that predates the contract", () => {
    for (const value of [null, undefined]) expect(parsePublicLocation(value)).toBeUndefined();
  });

  it("reads no location from a level it does not know — HIDDEN is never a shape", () => {
    for (const visibility of ["HIDDEN", "PUBLIC", "full_address", "", null, undefined, 1]) {
      expect(parsePublicLocation({ ...FULL, visibility })).toBeUndefined();
      expect(parsePublicLocation({ visibility, city: "Lyon" })).toBeUndefined();
    }
  });

  it("reads no location from anything that is not an object of the contract", () => {
    for (const value of ["12 avenue Jean Jaurès, 69007 Lyon", 42, true, [], [FULL], {}, { city: "Lyon" }]) {
      expect(parsePublicLocation(value)).toBeUndefined();
    }
  });

  it("a city-only answer that carries ANYTHING else is refused whole — never shown in part", () => {
    for (const extra of [
      { street: "12 avenue Jean Jaurès" },
      { postal_code: "69007" },
      { directions_destination: "12 avenue Jean Jaurès, 69007 Lyon" },
      { latitude: 45.74, longitude: 4.84 },
      { address: "12 avenue Jean Jaurès" },
    ]) {
      expect(parsePublicLocation({ ...CITY, ...extra })).toBeUndefined();
    }
  });

  it("a complete address with a missing or an extra key is refused whole — never degraded to a city", () => {
    for (const key of ["street", "postal_code", "city", "directions_destination"] as const) {
      const partial = Object.fromEntries(Object.entries(FULL).filter(([name]) => name !== key));
      expect(parsePublicLocation(partial)).toBeUndefined();
    }
    expect(parsePublicLocation({ ...FULL, latitude: 45.74 })).toBeUndefined();
    expect(parsePublicLocation({ ...FULL, url: "https://maps.example/evil" })).toBeUndefined();
  });

  it.each([
    ["a street on two lines", { street: "12 avenue\nJean Jaurès" }],
    ["a street with a line separator", { street: `12 avenue${LINE_SEPARATOR}Jean Jaurès` }],
    ["a street with a bidirectional override", { street: `12 rue ${RLO}evil` }],
    ["a street that is not trimmed", { street: " 12 avenue Jean Jaurès" }],
    ["an empty street", { street: "" }],
    ["a blank street", { street: NBSP }],
    ["a street beyond 200 characters", { street: "x".repeat(201) }],
    ["a street that is not a text", { street: 12 }],
    ["a postal code that is too short", { postal_code: "69" }],
    ["a postal code that is too long", { postal_code: "12345678901" }],
    ["a postal code with markup", { postal_code: "<b>69</b>" }],
    ["a postal code on two lines", { postal_code: "69\n007" }],
    ["a city on two lines", { city: "Lyon\n69007" }],
    ["a city beyond 100 characters", { city: "L".repeat(101) }],
    ["a destination on two lines", { directions_destination: "12 avenue Jean Jaurès\n69007 Lyon" }],
    ["a destination that is a control sequence", { directions_destination: `Lyon${String.fromCharCode(0)}` }],
    ["a destination beyond what the server can build", { directions_destination: "x".repeat(400) }],
    ["a destination that is not a text", { directions_destination: { lat: 45.74, lng: 4.84 } }],
  ])("fails closed on %s", (_label, change) => {
    expect(parsePublicLocation({ ...FULL, ...change })).toBeUndefined();
  });

  it("accepts the postal codes the server accepts", () => {
    for (const postal_code of ["75011", "1000", "SW1A 1AA", "12345-678"]) {
      expect(parsePublicLocation({ ...FULL, postal_code })).toMatchObject({ postalCode: postal_code });
    }
  });

  it("copies only the approved values: the object it returns holds nothing of the answer itself", () => {
    const parsed = parsePublicLocation(FULL);
    expect(Object.keys(parsed ?? {}).sort()).toEqual(["city", "directionsDestination", "postalCode", "street", "visibility"]);
    expect(Object.keys(parsePublicLocation(CITY) ?? {}).sort()).toEqual(["city", "visibility"]);
  });
});

describe("the address on two lines", () => {
  it("writes the street, then the postal code and the city", () => {
    const parsed = parsePublicLocation(FULL);
    if (parsed?.visibility !== "FULL_ADDRESS") throw new Error("expected a complete address");
    expect(addressLines(parsed)).toEqual(["12 avenue Jean Jaurès", "69007 Lyon"]);
  });
});

describe("isPlainLine", () => {
  it("counts characters, not UTF-16 units", () => {
    expect(isPlainLine("🌸".repeat(100), 100)).toBe(true);
    expect(isPlainLine("🌸".repeat(101), 100)).toBe(false);
  });
});

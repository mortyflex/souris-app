import { describe, expect, it } from "vitest";

import {
  availabilityToWire,
  datesOfWindow,
  describeTimeZone,
  formatDuration,
  formatLongDate,
  formatShortDate,
  isCivilDate,
  parseAvailability,
  parseAvailabilityQuery,
} from "../availability";

const base = {
  time_zone: "Europe/Paris",
  slot_minutes: 15,
  first_date: "2026-11-16",
  last_date: "2026-12-15",
  services: [
    { id: "tech-couleur", name: "Couleur", duration_minutes: 90 },
    { id: "0b9d5a7e-3c1f-4f7a-9d2e-1a2b3c4d5e6f", name: "Coupe", duration_minutes: 45 },
  ],
};
const slotsAnswer = {
  ...base,
  status: "SLOTS",
  service: { id: "tech-couleur", name: "Couleur", duration_minutes: 90 },
  date: "2026-11-20",
  slots: [
    { starts_at: "2026-11-20T08:00:00Z", ends_at: "2026-11-20T09:30:00Z", local_time: "09:00" },
    { starts_at: "2026-11-20T08:15:00Z", ends_at: "2026-11-20T09:45:00Z", local_time: "09:15" },
  ],
};

describe("parseAvailability", () => {
  it("copies the approved fields of a SLOTS answer", () => {
    expect(parseAvailability(slotsAnswer)).toEqual({
      timeZone: "Europe/Paris",
      slotMinutes: 15,
      firstDate: "2026-11-16",
      lastDate: "2026-12-15",
      services: [
        { id: "tech-couleur", name: "Couleur", durationMinutes: 90 },
        { id: "0b9d5a7e-3c1f-4f7a-9d2e-1a2b3c4d5e6f", name: "Coupe", durationMinutes: 45 },
      ],
      status: "SLOTS",
      service: { id: "tech-couleur", name: "Couleur", durationMinutes: 90 },
      date: "2026-11-20",
      slots: [
        { startsAt: "2026-11-20T08:00:00Z", endsAt: "2026-11-20T09:30:00Z", localTime: "09:00" },
        { startsAt: "2026-11-20T08:15:00Z", endsAt: "2026-11-20T09:45:00Z", localTime: "09:15" },
      ],
    });
  });

  it("accepts an empty day, and every status without slots", () => {
    expect(parseAvailability({ ...slotsAnswer, slots: [] })?.slots).toEqual([]);
    for (const status of ["CHOOSE_SERVICE", "UNKNOWN_SERVICE", "CHOOSE_DATE", "OUT_OF_WINDOW"]) {
      expect(parseAvailability({ ...base, status })).toMatchObject({ status, slots: [] });
    }
  });

  it("never copies an unexpected field — only the approved service metadata", () => {
    const parsed = parseAvailability({
      ...slotsAnswer,
      business_id: "10000000-0000-4000-8000-00000000000a",
      services: [
        { ...base.services[0], price_cents: 4500, client: "Léa", type: "TECHNIQUE", active: true, phases: [{ id: "p" }], owner: "u" },
      ],
      slots: [{ ...slotsAnswer.slots[0], appointment_id: "apt-1" }],
    });
    const json = JSON.stringify(parsed);
    expect(json).not.toMatch(/business|client|appointment|TECHNIQUE|active|phases|owner/);
    // The price IS public since 20261021120000 — the only new key copied from this service.
    expect(parsed?.services[0]).toEqual({ id: "tech-couleur", name: "Couleur", durationMinutes: 90, priceCents: 4500 });
  });

  it("reads the answer of a server WITHOUT the service metadata exactly as before (the deployed Staging backend)", () => {
    // A server where 20261021120000 is not applied sends three keys per service.
    const parsed = parseAvailability(slotsAnswer);
    expect(parsed).toBeDefined();
    for (const service of [...parsed!.services, parsed!.service!]) {
      expect(Object.keys(service).sort()).toEqual(["durationMinutes", "id", "name"]);
    }
    // The browser receives the very answer it received before: no key appears.
    expect(availabilityToWire(parsed!)).toEqual(slotsAnswer);
    for (const status of ["CHOOSE_SERVICE", "UNKNOWN_SERVICE", "CHOOSE_DATE", "OUT_OF_WINDOW"]) {
      const answer = { ...base, status };
      expect(availabilityToWire(parseAvailability(answer)!)).toEqual(answer);
    }
  });

  it.each([
    ["no status", { ...base }],
    ["an unknown status", { ...base, status: "BOOKED" }],
    ["a malformed window", { ...base, status: "CHOOSE_SERVICE", first_date: "16/11/2026" }],
    ["a reversed window", { ...base, status: "CHOOSE_SERVICE", first_date: "2026-12-16" }],
    ["an invalid service id", { ...base, status: "CHOOSE_SERVICE", services: [{ id: "<script>", name: "X", duration_minutes: 30 }] }],
    ["a zero-minute service", { ...base, status: "CHOOSE_SERVICE", services: [{ id: "svc", name: "X", duration_minutes: 0 }] }],
    ["SLOTS without a date", { ...slotsAnswer, date: undefined }],
    ["SLOTS without a service", { ...slotsAnswer, service: undefined }],
    ["a local instant", { ...slotsAnswer, slots: [{ ...slotsAnswer.slots[0], starts_at: "2026-11-20T09:00:00+01:00" }] }],
    ["an end before its start", { ...slotsAnswer, slots: [{ ...slotsAnswer.slots[0], ends_at: "2026-11-20T07:00:00Z" }] }],
    ["an impossible local time", { ...slotsAnswer, slots: [{ ...slotsAnswer.slots[0], local_time: "24:00" }] }],
    ["not an object", "SLOTS"],
  ])("rejects %s", (_label, answer) => {
    expect(parseAvailability(answer)).toBeUndefined();
  });
});

describe("service metadata (supabase/migrations/20261021120000)", () => {
  const C = (code: number) => String.fromCharCode(code);
  const answerWith = (service: Record<string, unknown>) => ({ ...base, status: "CHOOSE_SERVICE", services: [service] });
  const parsedService = (extra: Record<string, unknown>) => parseAvailability(answerWith({ ...base.services[0], ...extra }))?.services[0];

  it("copies the description, the price and the category the server gave", () => {
    const service = parsedService({
      description: "Application, pose, rinçage.\nSéchage non compris.",
      price_cents: 8900,
      category: { id: "cat-couleurs", name: "Couleurs", position: 2 },
    });
    expect(service).toEqual({
      id: "tech-couleur",
      name: "Couleur",
      durationMinutes: 90,
      description: "Application, pose, rinçage.\nSéchage non compris.",
      priceCents: 8900,
      category: { id: "cat-couleurs", name: "Couleurs", position: 2 },
    });
  });

  it("reads null metadata as none — the server's way of saying there is none", () => {
    expect(parsedService({ description: null, price_cents: null, category: null })).toEqual({
      id: "tech-couleur",
      name: "Couleur",
      durationMinutes: 90,
    });
  });

  it("keeps a zero price as 0 (« Tarif à confirmer »), never drops it", () => {
    expect(parsedService({ price_cents: 0 })?.priceCents).toBe(0);
  });

  it.each([
    ["negative", -100],
    ["decimal", 45.5],
    ["text", "4500"],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["absurdly large", 1_000_000_001],
    ["an object", { cents: 4500 }],
  ])("drops a %s price — and keeps the service bookable", (_label, price) => {
    const service = parsedService({ price_cents: price });
    expect(service).toEqual({ id: "tech-couleur", name: "Couleur", durationMinutes: 90 });
  });

  it.each([
    ["without a position", { id: "cat", name: "Couleurs" }],
    ["with a negative position", { id: "cat", name: "Couleurs", position: -1 }],
    ["with an empty name", { id: "cat", name: "  ", position: 0 }],
    ["with an invisible name", { id: "cat", name: C(0x200b), position: 0 }],
    ["without an id", { name: "Couleurs", position: 0 }],
    ["that is a string", "Couleurs"],
  ])("drops a category %s — and keeps the service", (_label, category) => {
    expect(parsedService({ category })).toEqual({ id: "tech-couleur", name: "Couleur", durationMinutes: 90 });
  });

  it("keeps a description as plain text: line breaks kept and normalized, nothing interpreted", () => {
    expect(parsedService({ description: `Ligne 1${C(13)}${C(10)}Ligne 2${C(13)}Ligne 3${C(0x2028)}Ligne 4` })?.description).toBe(
      "Ligne 1\nLigne 2\nLigne 3\nLigne 4",
    );
    expect(parsedService({ description: "A\n\n\n\n\nB" })?.description).toBe("A\n\nB");
    expect(parsedService({ description: `Durée${C(9)}45 min` })?.description).toBe("Durée 45 min");
    expect(parsedService({ description: `Prix ${C(0x202e)}05${C(0x202c)}${C(7)} €` })?.description).toBe("Prix 05 €");
    // Markup stays text: React escapes it, nothing here ever renders it.
    expect(parsedService({ description: '<img src=x onerror="alert(1)"> & <b>gras</b>' })?.description).toBe(
      '<img src=x onerror="alert(1)"> & <b>gras</b>',
    );
  });

  it("reads an empty, blank or invisible description as none, and bounds a long one", () => {
    for (const description of ["", "   ", "\n\n", `${C(0xa0)}${C(0x200b)}`, 42, { text: "x" }]) {
      expect(parsedService({ description })?.description).toBeUndefined();
    }
    expect(Array.from(parsedService({ description: "é".repeat(1500) })?.description ?? "")).toHaveLength(1000);
    expect(parsedService({ description: `${"a".repeat(998)}  \n\n suite` })?.description).toBe("a".repeat(998));
  });

  it("sends the metadata on to the browser, which reads the same service again", () => {
    const answer = {
      ...slotsAnswer,
      services: [
        { ...base.services[0], description: "Texte.\nSuite.", price_cents: 8900, category: { id: "cat-1", name: "Couleurs", position: 0 } },
        { ...base.services[1], price_cents: 0 },
      ],
      service: { ...slotsAnswer.service, description: "Texte.\nSuite.", price_cents: 8900, category: { id: "cat-1", name: "Couleurs", position: 0 } },
    };
    const parsed = parseAvailability(answer)!;
    expect(parseAvailability(availabilityToWire(parsed))).toEqual(parsed);
    expect(availabilityToWire(parsed)).toEqual(answer);
  });
});

describe("parseAvailabilityQuery", () => {
  it("keeps a well-formed service and a real date", () => {
    expect(parseAvailabilityQuery({ service: "tech-couleur", date: "2026-11-20" })).toEqual({
      serviceId: "tech-couleur",
      date: "2026-11-20",
    });
  });

  it.each([
    [{ service: "../../etc", date: "2026-02-30" }],
    [{ service: "x".repeat(201), date: "20261120" }],
    [{ service: ["a", "b"], date: ["2026-11-20"] }],
    [{ service: "", date: "" }],
    [{ service: "svc' or '1'='1", date: "2026-13-01" }],
  ])("drops anything malformed: %j", (params) => {
    expect(parseAvailabilityQuery(params)).toEqual({});
  });
});

describe("civil dates and labels", () => {
  it("validates real calendar dates", () => {
    expect(isCivilDate("2028-02-29")).toBe(true);
    expect(isCivilDate("2026-02-29")).toBe(false);
    expect(isCivilDate("2026-11-31")).toBe(false);
  });

  it("lists every date of the window, across a month and a year, bounded", () => {
    expect(datesOfWindow("2026-12-30", "2027-01-02")).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(datesOfWindow("2026-11-16", "2026-12-16")).toHaveLength(31);
    expect(datesOfWindow("2026-01-01", "2030-01-01")).toHaveLength(62);
  });

  it("keeps the civil date whatever the time zone, DST days included", () => {
    expect(formatShortDate("2026-03-29")).toBe("dim. 29 mars");
    expect(formatLongDate("2026-10-25")).toBe("dimanche 25 octobre");
    expect(formatLongDate("2027-01-01")).toBe("vendredi 1 janvier");
  });

  it("formats durations and the clock", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(90)).toBe("1 h 30");
    expect(formatDuration(125)).toBe("2 h 05");
    expect(describeTimeZone("Europe/Paris")).toBe("à l’heure de Paris");
    expect(describeTimeZone("America/Martinique")).toBe("à l’heure locale (America/Martinique)");
  });
});

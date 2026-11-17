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

  it("never copies an unexpected field", () => {
    const parsed = parseAvailability({
      ...slotsAnswer,
      business_id: "10000000-0000-4000-8000-00000000000a",
      services: [{ ...base.services[0], price_cents: 4500, client: "Léa" }],
      slots: [{ ...slotsAnswer.slots[0], appointment_id: "apt-1" }],
    });
    expect(JSON.stringify(parsed)).not.toMatch(/business|price|client|appointment|4500/);
  });

  it("reads the answer of a database that publishes price, description and category exactly as before", () => {
    // supabase/migrations/20261021120000_add_online_booking_service_publication.sql: every service
    // GAINS three keys; this website keeps reading the three it knows until it shows the others.
    const metadata = [
      { price_cents: 8900, description: "Application, pose, rinçage.\nSéchage non compris.", category: { id: "cat-1", name: "Couleurs", position: 0 } },
      { price_cents: 0, description: null, category: null },
    ];
    const enriched = {
      ...slotsAnswer,
      services: base.services.map((service, index) => ({ ...service, ...metadata[index] })),
      service: { ...slotsAnswer.service, ...metadata[0] },
    };
    const parsed = parseAvailability(enriched);
    expect(parsed).toEqual(parseAvailability(slotsAnswer));
    expect(parsed).toBeDefined();
    // What the availability endpoint sends to the browser is unchanged too.
    expect(availabilityToWire(parsed!)).toEqual(slotsAnswer);
    for (const status of ["CHOOSE_SERVICE", "UNKNOWN_SERVICE", "CHOOSE_DATE", "OUT_OF_WINDOW"]) {
      expect(parseAvailability({ ...enriched, status, slots: undefined })).toEqual(parseAvailability({ ...slotsAnswer, status, slots: undefined }));
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

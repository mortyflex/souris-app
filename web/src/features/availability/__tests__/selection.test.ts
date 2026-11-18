import { describe, expect, it } from "vitest";

import type { BookableService } from "../availability";
import {
  changedPriceLabel,
  formatSelectionTotal,
  MAX_SELECTED_SERVICES,
  parseSelectionAvailability,
  selectionAvailabilityToWire,
  selectionChanges,
  selectionIssue,
  summarizeSelection,
  TOTAL_TO_CONFIRM,
} from "../selection";

/** The no-break spaces Intl writes in prices, built from code points. */
const SPACES = new RegExp("[" + String.fromCharCode(0xa0, 0x202f) + "]", "g");
const plain = (value: string) => value.replace(SPACES, " ");

const coupe: BookableService = { id: "svc-coupe", name: "Coupe", durationMinutes: 45, priceCents: 4500 };
const couleur: BookableService = { id: "tech-couleur", name: "Couleur", durationMinutes: 90, priceCents: 8950 };
const offert: BookableService = { id: "svc-zero", name: "Diagnostic", durationMinutes: 15, priceCents: 0 };
const legacy: BookableService = { id: "svc-legacy", name: "Brushing", durationMinutes: 30 };
const FINGERPRINT = "a".repeat(64);

const envelope = {
  time_zone: "Europe/Paris",
  slot_minutes: 15,
  first_date: "2026-11-16",
  last_date: "2026-12-15",
  services: [
    { id: "svc-coupe", name: "Coupe", duration_minutes: 45, price_cents: 4500, description: null, category: null },
    { id: "tech-couleur", name: "Couleur", duration_minutes: 90, price_cents: 8950, description: "Avec temps de pose.", category: null },
  ],
};
const quote = {
  services: [
    { id: "tech-couleur", name: "Couleur", duration_minutes: 90, price_cents: 8950, description: "Avec temps de pose.", category: null },
    { id: "svc-coupe", name: "Coupe", duration_minutes: 45, price_cents: 4500, description: null, category: null },
  ],
  duration_minutes: 135,
  fingerprint: FINGERPRINT,
};

describe("selectionIssue — the database's shape rule, in its order", () => {
  it("accepts 1 to 8 distinct well-formed ids", () => {
    expect(selectionIssue(["svc-coupe"])).toBeUndefined();
    expect(selectionIssue(["a", "b"])).toBeUndefined();
    expect(selectionIssue(Array.from({ length: MAX_SELECTED_SERVICES }, (_, index) => `svc-${index}`))).toBeUndefined();
  });

  it("refuses an empty list, a ninth service, a duplicate and a malformed id", () => {
    expect(selectionIssue([])).toBe("EMPTY");
    expect(selectionIssue(null)).toBe("EMPTY");
    expect(selectionIssue("svc-coupe")).toBe("EMPTY");
    expect(selectionIssue(Array.from({ length: 9 }, (_, index) => `svc-${index}`))).toBe("TOO_MANY");
    expect(selectionIssue(["svc-coupe", "svc-coupe"])).toBe("DUPLICATE");
    expect(selectionIssue(["svc-coupe", " svc-coupe"])).toBe("MALFORMED");
    expect(selectionIssue(["svc-coupe", ""])).toBe("MALFORMED");
    expect(selectionIssue(["svc-coupe", 42])).toBe("MALFORMED");
    expect(selectionIssue(["x".repeat(201)])).toBe("MALFORMED");
  });
});

describe("summarizeSelection — count, combined length, indicative total", () => {
  it("adds the lengths and, when every price is positive, the prices", () => {
    const summary = summarizeSelection([coupe, couleur]);
    expect(summary).toEqual({ count: 2, durationMinutes: 135, price: { kind: "total", cents: 13_450 } });
    expect(plain(formatSelectionTotal(summary.price))).toBe("134,50 €");
    expect(plain(formatSelectionTotal(summarizeSelection([coupe]).price))).toBe("45 €");
  });

  it("never invents an amount: a 0 price or an unknown one makes the total « à confirmer »", () => {
    expect(summarizeSelection([coupe, offert]).price).toEqual({ kind: "to_confirm" });
    expect(summarizeSelection([coupe, legacy]).price).toEqual({ kind: "to_confirm" });
    expect(formatSelectionTotal({ kind: "to_confirm" })).toBe(TOTAL_TO_CONFIRM);
    expect(summarizeSelection([]).price).toEqual({ kind: "to_confirm" });
  });

  it("keeps eight services' totals exact", () => {
    const eight = Array.from({ length: 8 }, (_, index) => ({ ...coupe, id: `svc-${index}`, priceCents: 1999 }));
    expect(summarizeSelection(eight)).toEqual({ count: 8, durationMinutes: 360, price: { kind: "total", cents: 15_992 } });
  });
});

describe("selectionChanges — what changed in a selected service", () => {
  it("lists a new price, length or name, in the new order; unchanged and absent services are not changes", () => {
    const after = [{ ...couleur, durationMinutes: 105 }, { ...coupe, priceCents: 5000, name: "Coupe femme" }, offert];
    expect(selectionChanges([coupe, couleur, legacy], after)).toEqual([
      { id: "tech-couleur", name: "Couleur", duration: { from: 90, to: 105 } },
      { id: "svc-coupe", name: "Coupe femme", previousName: "Coupe", price: { from: 4500, to: 5000 } },
    ]);
    expect(selectionChanges([coupe], [coupe])).toEqual([]);
  });

  it("words a price as the amount, « Tarif à confirmer », or « non indiqué » — never « gratuit »", () => {
    expect(plain(changedPriceLabel(4500))).toBe("45 €");
    expect(changedPriceLabel(0)).toBe("Tarif à confirmer");
    expect(changedPriceLabel(undefined)).toBe("non indiqué");
  });
});

describe("parseSelectionAvailability — every answer of online_booking_public_selection_availability", () => {
  it("reads SLOTS: the catalogue, the server's selection IN HER ORDER, its length and fingerprint, the times", () => {
    const answer = parseSelectionAvailability({
      ...envelope,
      status: "SLOTS",
      selection: quote,
      date: "2026-11-16",
      slots: [{ starts_at: "2026-11-16T13:00:00Z", ends_at: "2026-11-16T15:15:00Z", local_time: "14:00" }],
    });
    expect(answer?.status).toBe("SLOTS");
    expect(answer?.selection?.services.map((service) => service.id)).toEqual(["tech-couleur", "svc-coupe"]);
    expect(answer?.selection?.durationMinutes).toBe(135);
    expect(answer?.selection?.fingerprint).toBe(FINGERPRINT);
    expect(answer?.slots).toEqual([{ startsAt: "2026-11-16T13:00:00Z", endsAt: "2026-11-16T15:15:00Z", localTime: "14:00" }]);
  });

  it("reads every other status with its own fields", () => {
    expect(parseSelectionAvailability({ ...envelope, status: "INVALID_SELECTION", reason: "EMPTY" })).toMatchObject({ reason: "EMPTY" });
    expect(parseSelectionAvailability({ ...envelope, status: "UNKNOWN_SERVICE", service_id: "svc-gone" })).toMatchObject({ serviceId: "svc-gone" });
    expect(parseSelectionAvailability({ ...envelope, status: "SELECTION_TOO_LONG", selection: { ...quote, duration_minutes: 800 }, max_minutes: 720 })).toMatchObject({
      maxMinutes: 720,
      selection: { durationMinutes: 800 },
    });
    expect(parseSelectionAvailability({ ...envelope, status: "DOES_NOT_FIT", selection: quote, longest_interval_minutes: 120 })).toMatchObject({
      longestIntervalMinutes: 120,
    });
    expect(parseSelectionAvailability({ ...envelope, status: "CHOOSE_DATE", selection: quote })?.status).toBe("CHOOSE_DATE");
    expect(parseSelectionAvailability({ ...envelope, status: "OUT_OF_WINDOW", selection: quote, date: "2027-01-30" })).toMatchObject({ date: "2027-01-30" });
  });

  it("refuses anything incomplete or unexpected — a failure, never « no time »", () => {
    const slots = { ...envelope, status: "SLOTS", selection: quote, date: "2026-11-16", slots: [] };
    expect(parseSelectionAvailability(slots)?.slots).toEqual([]);
    expect(parseSelectionAvailability({ ...slots, selection: undefined })).toBeUndefined();
    expect(parseSelectionAvailability({ ...slots, selection: { ...quote, fingerprint: "nope" } })).toBeUndefined();
    expect(parseSelectionAvailability({ ...slots, selection: { ...quote, services: [quote.services[0], quote.services[0]] } })).toBeUndefined();
    expect(parseSelectionAvailability({ ...slots, selection: { ...quote, services: [] } })).toBeUndefined();
    expect(parseSelectionAvailability({ ...slots, slots: undefined })).toBeUndefined();
    expect(parseSelectionAvailability({ ...slots, status: "MAYBE" })).toBeUndefined();
    expect(parseSelectionAvailability({ ...envelope, status: "INVALID_SELECTION", reason: "WHATEVER" })).toBeUndefined();
    expect(parseSelectionAvailability({ ...envelope, status: "UNKNOWN_SERVICE" })).toBeUndefined();
    expect(parseSelectionAvailability({ ...envelope, status: "DOES_NOT_FIT", selection: quote })).toBeUndefined();
    expect(parseSelectionAvailability(null)).toBeUndefined();
  });

  it("travels to the browser in the server's form, approved fields only, and reads back the same", () => {
    const answer = parseSelectionAvailability({
      ...envelope,
      status: "SLOTS",
      selection: quote,
      date: "2026-11-16",
      slots: [{ starts_at: "2026-11-16T13:00:00Z", ends_at: "2026-11-16T15:15:00Z", local_time: "14:00" }],
      internal: "never forwarded",
    })!;
    const wire = selectionAvailabilityToWire(answer);
    expect(JSON.stringify(wire)).not.toContain("internal");
    expect(parseSelectionAvailability(JSON.parse(JSON.stringify(wire)))).toEqual(answer);
  });
});

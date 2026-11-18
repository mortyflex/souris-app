import { describe, expect, it } from "vitest";

import { parseEngineAnswer, parseResponseWire, toResponseWire } from "../booking-answer";
import { isSelectionRequest, parseSelectionRequestWire, toSelectionRequestWire, type SelectionBookingRequest } from "../selection-request";

const KEY = "0123456789abcdef0123456789abcdef";
const FINGERPRINT = "f".repeat(64);
const wire = {
  service_ids: ["tech-couleur", "svc-coupe"],
  starts_at: "2026-11-16T13:00:00Z",
  selection_fingerprint: FINGERPRINT,
  first_name: "  Marie ",
  last_name: "Dupont",
  email: "marie.dupont@example.test",
  phone: "06 12 34 56 78",
  idempotency_key: KEY,
};

describe("the selection request body — exactly eight keys, the engine's field rules in its order", () => {
  it("reads a valid request, keeping her order and cleaning the details as they are stored", () => {
    const parsed = parseSelectionRequestWire(wire);
    expect(parsed).toEqual({
      ok: true,
      idempotencyKey: KEY,
      request: {
        serviceIds: ["tech-couleur", "svc-coupe"],
        startsAt: "2026-11-16T13:00:00Z",
        fingerprint: FINGERPRINT,
        firstName: "Marie",
        lastName: "Dupont",
        email: "marie.dupont@example.test",
        phone: "06 12 34 56 78",
      },
    });
    if (parsed.ok) expect(isSelectionRequest(parsed.request)).toBe(true);
  });

  it("round-trips: what the browser sends is what the server reads", () => {
    const request: SelectionBookingRequest = {
      serviceIds: ["b", "a", "c"],
      startsAt: "2026-11-16T13:00:00Z",
      fingerprint: FINGERPRINT,
      firstName: "Marie",
      lastName: "Dupont",
      email: "marie.dupont@example.test",
      phone: "06 12 34 56 78",
    };
    const sent = JSON.parse(JSON.stringify(toSelectionRequestWire(request, KEY)));
    expect(Object.keys(sent).sort()).toEqual(Object.keys(wire).sort());
    expect(parseSelectionRequestWire(sent)).toEqual({ ok: true, idempotencyKey: KEY, request });
  });

  it("is not a selection request at all without exactly the eight keys and their types", () => {
    expect(parseSelectionRequestWire({ ...wire, price_cents: 100 })).toEqual({ ok: false, malformed: true });
    expect(parseSelectionRequestWire({ ...wire, total: "134 €" })).toEqual({ ok: false, malformed: true });
    const missing: Record<string, unknown> = { ...wire };
    delete missing.selection_fingerprint;
    expect(parseSelectionRequestWire(missing)).toEqual({ ok: false, malformed: true });
    expect(parseSelectionRequestWire({ ...wire, service_ids: "svc-coupe" })).toEqual({ ok: false, malformed: true });
    expect(parseSelectionRequestWire({ ...wire, service_ids: ["svc-coupe", 7] })).toEqual({ ok: false, malformed: true });
    expect(parseSelectionRequestWire({ ...wire, starts_at: 42 })).toEqual({ ok: false, malformed: true });
    expect(parseSelectionRequestWire([wire])).toEqual({ ok: false, malformed: true });
  });

  it("names the first unacceptable field, in the engine's order", () => {
    const field = (patch: Record<string, unknown>) => {
      const parsed = parseSelectionRequestWire({ ...wire, ...patch });
      return parsed.ok ? "ok" : parsed.malformed ? "malformed" : parsed.field;
    };
    expect(field({ idempotency_key: "short", service_ids: [] })).toBe("idempotency_key");
    expect(field({ service_ids: [] })).toBe("service_ids");
    expect(field({ service_ids: Array.from({ length: 9 }, (_, index) => `svc-${index}`) })).toBe("service_ids");
    expect(field({ service_ids: ["svc-coupe", "svc-coupe"] })).toBe("service_ids");
    expect(field({ selection_fingerprint: "F".repeat(64) })).toBe("selection_fingerprint");
    expect(field({ starts_at: "2026-11-16 13:00" })).toBe("starts_at");
    expect(field({ first_name: " " })).toBe("first_name");
    expect(field({ email: "marie" })).toBe("email");
    expect(field({ phone: "abc" })).toBe("phone");
  });
});

describe("the multi-service engine's answers", () => {
  const bookedWire = {
    status: "BOOKED",
    booking: {
      reference: "4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21",
      services: [
        { id: "tech-couleur", name: "Couleur", duration_minutes: 90 },
        { id: "svc-coupe", name: "Coupe", duration_minutes: 45 },
      ],
      duration_minutes: 135,
      starts_at: "2026-11-16T13:00:00Z",
      ends_at: "2026-11-16T15:15:00Z",
      local_date: "2026-11-16",
      local_time: "14:00",
      time_zone: "Europe/Paris",
    },
  };

  it("reads ONE booking holding every service in order, with the combined length — never an amount", () => {
    const answer = parseEngineAnswer(bookedWire);
    expect(answer).toMatchObject({
      status: "BOOKED",
      booking: { kind: "selection", durationMinutes: 135, services: [{ id: "tech-couleur" }, { id: "svc-coupe" }] },
    });
    // The website forwards it in the engine's own form, and the browser reads the same booking.
    const forwarded = toResponseWire(answer!);
    expect(forwarded).toEqual(bookedWire);
    expect(parseResponseWire(JSON.parse(JSON.stringify(forwarded)))).toEqual(answer);
  });

  it("keeps the single-service answer exactly as the deployed endpoint sends it", () => {
    const single = {
      status: "BOOKED",
      booking: { ...bookedWire.booking, services: undefined, duration_minutes: undefined, service: { id: "svc-coupe", name: "Coupe", duration_minutes: 45 } },
    };
    const clean = JSON.parse(JSON.stringify(single));
    const answer = parseEngineAnswer(clean);
    expect(answer).toMatchObject({ booking: { kind: "single", services: [{ id: "svc-coupe" }], durationMinutes: 45 } });
    expect(toResponseWire(answer!)).toEqual(clean);
  });

  it("refuses a booking carrying both shapes, or none — an unknown outcome, never a success", () => {
    const both = { ...bookedWire, booking: { ...bookedWire.booking, service: { id: "svc-coupe", name: "Coupe", duration_minutes: 45 } } };
    expect(parseEngineAnswer(both)).toBeUndefined();
    const none = { ...bookedWire, booking: { ...bookedWire.booking, services: undefined } };
    expect(parseEngineAnswer(JSON.parse(JSON.stringify(none)))).toBeUndefined();
    const nine = { ...bookedWire, booking: { ...bookedWire.booking, services: Array(9).fill(bookedWire.booking.services[0]) } };
    expect(parseEngineAnswer(nine)).toBeUndefined();
  });

  it("reads the refusals: SELECTION_CHANGED, SELECTION_TOO_LONG, UNKNOWN_SERVICE naming the service, the new fields", () => {
    expect(parseEngineAnswer({ status: "SELECTION_CHANGED" })).toEqual({ status: "SELECTION_CHANGED" });
    expect(parseEngineAnswer({ status: "SELECTION_TOO_LONG" })).toEqual({ status: "SELECTION_TOO_LONG" });
    expect(parseEngineAnswer({ status: "UNKNOWN_SERVICE", service_id: "svc-gone" })).toEqual({ status: "UNKNOWN_SERVICE", serviceId: "svc-gone" });
    expect(parseEngineAnswer({ status: "UNKNOWN_SERVICE", service_id: null })).toEqual({ status: "UNKNOWN_SERVICE" });
    expect(parseEngineAnswer({ status: "UNKNOWN_SERVICE" })).toEqual({ status: "UNKNOWN_SERVICE" });
    expect(parseEngineAnswer({ status: "INVALID_REQUEST", field: "service_ids", reason: "DUPLICATE" })).toEqual({
      status: "INVALID_REQUEST",
      field: "service_ids",
    });
    expect(parseEngineAnswer({ status: "INVALID_REQUEST", field: "selection_fingerprint" })).toEqual({
      status: "INVALID_REQUEST",
      field: "selection_fingerprint",
    });
    expect(toResponseWire({ status: "UNKNOWN_SERVICE", serviceId: "svc-gone" })).toEqual({ status: "UNKNOWN_SERVICE", service_id: "svc-gone" });
    // The single-service endpoint keeps answering UNKNOWN_SERVICE without a service id.
    expect(toResponseWire({ status: "UNKNOWN_SERVICE" })).toEqual({ status: "UNKNOWN_SERVICE" });
  });
});

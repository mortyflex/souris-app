import { describe, expect, it } from "vitest";

import { customerIssues, parseRequestWire, phoneE164, type CustomerDetails } from "../booking-request";

const ok: CustomerDetails = { firstName: "Marie", lastName: "Dupont", email: "marie@example.test", phone: "06 12 34 56 78" };
const char = (code: number) => String.fromCodePoint(code);

describe("customer details — the engine's rules, before anything is sent", () => {
  it("accepts a normal French customer", () => {
    expect(customerIssues(ok)).toEqual({});
    expect(customerIssues({ ...ok, firstName: "Éléonore", lastName: "N’Guessan-Le Bihan" })).toEqual({});
  });

  it.each([
    ["blank", "   "],
    ["a no-break space", char(0xa0)],
    ["a zero-width space", char(0x200b)],
    ["an ideographic space", char(0x3000)],
  ])("refuses a first name that is only %s (the device refuses it on pull)", (_label, value) => {
    expect(customerIssues({ ...ok, firstName: value }).firstName).toBe("required");
  });

  it.each([
    ["a control character", `Ma${char(0x07)}rie`],
    ["a line separator", `Ma${char(0x2028)}rie`],
    ["a bidirectional override", `${char(0x202e)}eiraM`],
    ["a NUL", `Ma${char(0x00)}rie`],
    ["a lone surrogate", `Ma${String.fromCharCode(0xd800)}rie`],
  ])("refuses a name with %s", (_label, value) => {
    expect(customerIssues({ ...ok, firstName: value }).firstName).toBe("invalid");
  });

  it("counts characters, not UTF-16 units: 80 emoji pass, 81 do not", () => {
    expect(customerIssues({ ...ok, lastName: char(0x1f338).repeat(80) }).lastName).toBeUndefined();
    expect(customerIssues({ ...ok, lastName: char(0x1f338).repeat(81) }).lastName).toBe("too_long");
  });

  it.each(["marie@example", "marie example@test.fr", `marie${char(0xa0)}@example.test`, "@example.test", "marie@@example.test"])(
    "refuses the email %j",
    (email) => {
      expect(customerIssues({ ...ok, email }).email).toBe("invalid");
    },
  );

  it.each([
    ["06 12 34 56 78", "+33612345678"],
    ["06.12.34.56.78", "+33612345678"],
    ["+33 6 12 34 56 78", "+33612345678"],
    ["0033 6 12 34 56 78", "+33612345678"],
    ["(+44) 20-7946-0018", "+442079460018"],
    ["+44 20 7946 0018", "+442079460018"],
    ["06 12 34 56", undefined],
    ["06 12 AB 56 78", undefined],
  ])("reads the phone %j as the server does", (phone, e164) => {
    expect(phoneE164(phone)).toBe(e164);
    expect(customerIssues({ ...ok, phone }).phone).toBe(e164 === undefined ? "invalid" : undefined);
  });
});

describe("parseRequestWire — the server boundary", () => {
  const wire = {
    service_id: " svc-coupe ",
    starts_at: "2026-11-16T13:00:00Z",
    first_name: "  Marie",
    last_name: "Dupont  ",
    email: " marie@example.test ",
    phone: " 06 12 34 56 78 ",
    idempotency_key: "0123456789abcdef0123456789abcdef",
  };

  it("cleans the values the way they will be stored", () => {
    expect(parseRequestWire(wire)).toEqual({
      ok: true,
      idempotencyKey: wire.idempotency_key,
      request: {
        serviceId: "svc-coupe",
        startsAt: "2026-11-16T13:00:00Z",
        firstName: "Marie",
        lastName: "Dupont",
        email: "marie@example.test",
        phone: "06 12 34 56 78",
      },
    });
  });

  it("accepts exactly seven string keys — no Business, staff, duration or price can ride along", () => {
    for (const extra of ["business_id", "staff_member_id", "duration_minutes", "price_cents"]) {
      expect(parseRequestWire({ ...wire, [extra]: "x" })).toEqual({ ok: false, malformed: true });
    }
    expect(parseRequestWire({ ...wire, phone: null })).toEqual({ ok: false, malformed: true });
    expect(parseRequestWire(null)).toEqual({ ok: false, malformed: true });
    expect(parseRequestWire("text")).toEqual({ ok: false, malformed: true });
  });

  it.each([
    [{ idempotency_key: "a".repeat(15) }, "idempotency_key"],
    [{ idempotency_key: "a".repeat(129) }, "idempotency_key"],
    [{ idempotency_key: "has spaces in it ok" }, "idempotency_key"],
    [{ starts_at: "2026-11-16T13:00:00.000Z" }, "starts_at"],
    [{ starts_at: "2026-02-30T13:00:00Z" }, "starts_at"],
    [{ service_id: "" }, "service_id"],
    [{ last_name: "" }, "last_name"],
  ])("names the first unacceptable field of %j", (change, field) => {
    expect(parseRequestWire({ ...wire, ...change })).toEqual({ ok: false, malformed: false, field });
  });
});

// BeautIzzy — communication phone rules (Lot C1)
//
// Table-driven, and deliberately the SAME representative cases as the SQL
// harness of `communications_client_phone_e164` /
// `communications_is_sms_eligible_phone`: the two sides must keep answering
// identically (the server stays authoritative; this mirror only drives the
// missing/invalid/usable presentation).

import {
  isUsableCommunicationSmsPhone,
  normalizeCommunicationPhoneE164,
} from "../phone";

type Case = readonly [
  input: string | undefined,
  e164: string | undefined,
  smsEligible: boolean,
];

const CASES: readonly Case[] = [
  // French national mobile formats, as typed in the app
  ["06 12 34 56 78", "+33612345678", true],
  ["0612345678", "+33612345678", true],
  ["06.12.34.56.78", "+33612345678", true],
  ["06-12-34-56-78", "+33612345678", true],
  ["06 (12) 34 56 78", "+33612345678", true],
  ["07 12 34 56 78", "+33712345678", true],
  // already-canonical values (the legacy import shape)
  ["+33612345678", "+33612345678", true],
  ["+33 6 12 34 56 78", "+33612345678", true],
  ["+447700900123", "+447700900123", true],
  // international 00 prefix
  ["0033612345678", "+33612345678", true],
  ["00 33 6 12 34 56 78", "+33612345678", true],
  // canonical but NOT SMS-eligible: French landlines
  ["01 42 00 00 00", "+33142000000", false],
  ["04.91.00.00.00", "+33491000000", false],
  ["+33912345678", "+33912345678", false],
  // wrong length behind a French prefix
  ["+336123456", "+336123456", false],
  // unusable inputs
  ["", undefined, false],
  ["   ", undefined, false],
  [undefined, undefined, false],
  ["garbage", undefined, false],
  ["06 12 34 56 7a", undefined, false],
  ["0612", undefined, false],
  ["061234567890123456", undefined, false],
  ["++33612345678", undefined, false],
  ["06+12 34 56 78", undefined, false],
  ["+0612345678", undefined, false],
  ["0912345678 poste 4", undefined, false],
];

describe("normalizeCommunicationPhoneE164", () => {
  it.each(CASES)("%j → %j", (input, e164) => {
    expect(normalizeCommunicationPhoneE164(input)).toBe(e164);
  });
});

describe("isUsableCommunicationSmsPhone", () => {
  it.each(CASES)("%j → eligible %j", (input, _e164, smsEligible) => {
    expect(isUsableCommunicationSmsPhone(input)).toBe(smsEligible);
  });

  it("never treats a normalizable landline as an SMS destination", () => {
    expect(normalizeCommunicationPhoneE164("01 42 00 00 00")).toBe("+33142000000");
    expect(isUsableCommunicationSmsPhone("01 42 00 00 00")).toBe(false);
  });
});

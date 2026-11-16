import { describe, expect, it } from "vitest";

import { annualMonthlyEquivalentCents, annualSavingPercent, formatPrice, PLUS_PLANS, PLUS_TRIAL_DAYS } from "../pricing";

const plain = (text: string) => text.replace(/\s/g, " ");

describe("BeautIzzy Plus prices, as the website states them", () => {
  it("are the intended French-market products: 12,99 € a month, 129 € a year, a 14-day trial", () => {
    expect(PLUS_PLANS.monthly.amountCents).toBe(1299);
    expect(PLUS_PLANS.annual.amountCents).toBe(12900);
    expect(PLUS_TRIAL_DAYS).toBe(14);
  });

  it("are written the French way, cents only when there are some", () => {
    expect(plain(formatPrice(1299))).toBe("12,99 €");
    expect(plain(formatPrice(12900))).toBe("129 €");
    expect(plain(formatPrice(1075))).toBe("10,75 €");
  });

  it("show the annual plan's monthly equivalent only because it is exact to the cent", () => {
    expect(annualMonthlyEquivalentCents()).toBe(1075);
  });

  it("never overstate the annual saving (17,2 % → 17 %)", () => {
    expect(annualSavingPercent()).toBe(17);
  });
});

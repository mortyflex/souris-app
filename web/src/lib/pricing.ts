/**
 * BeautIzzy Plus — the subscription as the website presents it.
 *
 * These are the INTENDED French-market products of the App Store (the
 * application's paywall fixtures, src/features/access/paywall/testing/:
 * monthly 12,99 €, annual 129 €, a 14-day free trial). The price the App Store
 * shows at purchase is the authority; the page says so. There is no checkout
 * on the website and no store link until the application is published.
 */
export const PLUS_PLANS = {
  monthly: { amountCents: 1299, period: "mois" },
  annual: { amountCents: 12900, period: "an" },
} as const;

export const PLUS_TRIAL_DAYS = 14;


const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** « 12,99 € », « 129 € » */
export function formatPrice(amountCents: number): string {
  const euros = amountCents / 100;
  return Number.isInteger(euros) ? EUROS.format(euros) : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(euros);
}

/**
 * The monthly equivalent of the annual plan — shown ONLY when it is exact to
 * the cent (129 € / 12 = 10,75 €), never a rounded approximation.
 */
export function annualMonthlyEquivalentCents(): number | undefined {
  const cents = PLUS_PLANS.annual.amountCents / 12;
  return Number.isInteger(cents) ? cents : undefined;
}

/** The saving of the annual plan over twelve months, rounded DOWN to the percent (never overstated). */
export function annualSavingPercent(): number {
  const twelveMonths = PLUS_PLANS.monthly.amountCents * 12;
  return Math.floor(((twelveMonths - PLUS_PLANS.annual.amountCents) / twelveMonths) * 100);
}

/** What twelve months on the monthly plan cost more than one annual plan (exact, in cents). */
export function annualSavingCents(): number {
  return PLUS_PLANS.monthly.amountCents * 12 - PLUS_PLANS.annual.amountCents;
}

/** French figures for the landing page's demonstrations: « 1 280 », « 129 € », « 12,99 € ». */
const INTEGER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const EUROS_CENTS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

export function formatValue(value: number, format: "integer" | "euros" | "euros-cents"): string {
  if (format === "euros") return EUROS.format(Math.round(value));
  if (format === "euros-cents") return EUROS_CENTS.format(Math.round(value * 100) / 100);
  return INTEGER.format(Math.round(value));
}

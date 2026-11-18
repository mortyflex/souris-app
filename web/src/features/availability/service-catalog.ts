/**
 * How the bookable services read on the public page — pure, no React.
 *
 * The server alone decides WHICH services are bookable and gives each one's
 * price, description and category (or nothing, for a server that predates
 * them). This module only words and orders what it received:
 *
 *   * a price is the server's integer cents: a positive one in euros
 *     (« 45 € », « 45,50 € »), 0 as « Tarif à confirmer » — never « gratuit »:
 *     the catalogue cannot tell a free service from a price never set —, and
 *     no price at all when the server sent none;
 *   * services are grouped by the professional's categories, in HER order,
 *     the uncategorized ones last; a catalogue without categories — or with
 *     only one group — keeps the plain list, without a redundant heading.
 *
 * Nothing here suggests a payment: the page never takes one.
 */

import type { BookableService, ServiceCategory } from "./availability";

export const PRICE_TO_CONFIRM = "Tarif à confirmer";
/** The heading of the uncategorized services, when other groups have one. */
export const OTHER_SERVICES_TITLE = "Autres prestations";
/** Said once under the list when at least one price is shown. */
export const PRICES_NOTE = "Les tarifs affichés sont indicatifs.";

const wholeEuros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const exactEuros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * « 45 € », « 45,50 € », « Tarif à confirmer » for 0 — or undefined when the
 * server gave no price (nothing is shown then, never a made-up one).
 */
export function formatServicePrice(priceCents: number | undefined): string | undefined {
  if (priceCents === undefined || !Number.isInteger(priceCents) || priceCents < 0) return undefined;
  if (priceCents === 0) return PRICE_TO_CONFIRM;
  return (priceCents % 100 === 0 ? wholeEuros : exactEuros).format(priceCents / 100);
}

/** Whether the list shows at least one price (and so says that prices are indicative). */
export function showsAnyPrice(services: readonly BookableService[]): boolean {
  return services.some((service) => formatServicePrice(service.priceCents) !== undefined);
}

export interface ServiceGroup {
  readonly key: string;
  /** Absent for a plain list (no categories, or a single group). */
  readonly title?: string;
  readonly services: readonly BookableService[];
}

const byPosition = (left: ServiceCategory, right: ServiceCategory) =>
  left.position - right.position || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

/**
 * The services in reading order. With categories: hers in her order (position,
 * then id), the server's order inside each, then « Autres prestations ».
 * Without any — a server that predates them, or a catalogue without
 * categories — ONE untitled group in the server's order, exactly as before.
 */
export function groupBookableServices(services: readonly BookableService[]): readonly ServiceGroup[] {
  const categories = new Map<string, ServiceCategory>();
  for (const service of services) {
    if (service.category !== undefined && !categories.has(service.category.id)) {
      categories.set(service.category.id, service.category);
    }
  }
  if (categories.size === 0) return services.length === 0 ? [] : [{ key: "all", services }];

  const groups: ServiceGroup[] = [...categories.values()].sort(byPosition).map((category) => ({
    key: `category:${category.id}`,
    title: category.name,
    services: services.filter((service) => service.category?.id === category.id),
  }));
  const uncategorized = services.filter((service) => service.category === undefined);
  if (uncategorized.length > 0) {
    groups.push({ key: "uncategorized", title: OTHER_SERVICES_TITLE, services: uncategorized });
  }
  // A single group needs no heading: the step's own title already says what the list is.
  return groups.length === 1 ? [{ key: groups[0]!.key, services: groups[0]!.services }] : groups;
}

/** Whether a clamped text actually hides some of its content (measured in the browser). */
export function isClamped(element: { readonly scrollHeight: number; readonly clientHeight: number }): boolean {
  return element.scrollHeight - element.clientHeight > 1;
}

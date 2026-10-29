// BeautIzzy — Playground demo scenarios: the builder (development ONLY) — pure
//
// A scenario is ONE fictional Business of a profession with its clients, its
// catalogue, its products, its appointments and its product sales, expressed
// as a compact definition (hairdressing.ts, nails.ts, esthetics.ts) and
// turned here into the real domain records the application persists and
// displays: `Client`, `Service` (built from the profession's onboarding
// starters, priced for the demo), `Product`, `Appointment` with genuine item
// snapshots (`createAppointmentItemSnapshot`) and `Sale` with genuine line
// snapshots (`createSaleItemSnapshot`), so the Agenda, the profile, the
// details, the Cash Register and Tops & tendances read exactly what a real
// Business would produce.
//
// Money and stock agree the way the application makes them agree (Step B2):
//   - a product's stored stock is its `initialStock` minus every seeded sale
//     line (the seed inserts sales without decrementing, like a restore);
//   - a product sold during an appointment (« Revente ») is a Sale linked to
//     it, without payment, completed at the appointment's end — and a PAID
//     appointment settles its EXPECTED total (services net of the discount +
//     those products, `getAppointmentExpectedTotal`), as a checkout does;
//   - a standalone sale records what was received, by card or cash.
//
// Deterministic: the same definition and the same `now` give the same
// records, with stable readable identifiers (`playground-demo-<profession>-…`)
// that no real record can carry. Dates are RELATIVE to `now` (day offsets),
// so the Agenda is meaningful whenever the Playground is opened: history
// behind, today busy, the next two weeks planned. Some history is instead
// ANCHORED in an earlier calendar month (`monthsAgo` + `dayOfMonth`), so the
// Caisse month comparisons tell the same story on every day of the month:
// hairdressing a rise and a year-over-year line, esthetics a fall, nails
// (nothing older than four weeks) no comparison. A definition error (an
// unknown client or prestation key, a missing price) throws at build time —
// the tests catch it, a developer never sees a half-built demo.
//
// Nothing here knows persistence, React or navigation.

import {
  createAppointmentItemSnapshot,
  getAppointmentExpectedTotal,
  getSaleTotalCents,
  type Appointment,
  type AppointmentDiscount,
  type AppointmentItem,
  type PaymentMethod,
  type Service,
} from '@/domain/appointments';
import type { BusinessProfile, ProfessionId } from '@/domain/business';
import type { Client, ClientBirthday } from '@/domain/clients';
import type { Product } from '@/domain/products';
import { createSaleItemSnapshot, type Sale } from '@/domain/sales';
import { createServiceCategory, normalizeServiceDescription, type ServiceCategory } from '@/domain/services';
import { addLocalDays, startOfLocalDay } from '@/features/agenda/calendar/week';
import { currentStaffMemberId } from '@/features/appointments/current-staff-member';
import { getStarterServices, type StarterService } from '@/features/business/setup/starter-services';
import type { FirstRunSeed } from '@/persistence/seed';

/** The in-memory owner of every demo Business: obviously not an account. */
export const DEMO_OWNER_USER_ID = 'playground-demo-owner';

export interface PlaygroundDemoScenario {
  readonly activityType: ProfessionId;
  readonly business: BusinessProfile;
  /** What the demo database is seeded with; every record belongs to `business`. */
  readonly seed: FirstRunSeed;
}

/**
 * What became of the appointment, as the demo wants it shown:
 *
 *   SCHEDULED / CONFIRMED     planned (today or ahead)
 *   COMPLETED                 done, never checked out (what the previous-day
 *                             finalization produces)
 *   PAID                      done and checked out: services net of the
 *                             discount, received by one method
 *   CANCELLED_BY_CLIENT /     a historical cancellation, with its reason
 *   CANCELLED_BY_BUSINESS
 *   NO_SHOW                   recorded half an hour after the start
 */
export type DemoAppointmentOutcome =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'PAID'
  | 'CANCELLED_BY_CLIENT'
  | 'CANCELLED_BY_BUSINESS'
  | 'NO_SHOW';

export interface DemoClientDefinition {
  readonly key: string;
  readonly firstName: string;
  readonly lastName?: string;
  readonly phone?: string;
  readonly email?: string;
  /** A fixed day, or `'today'`: the birthday is the day the demo is opened. */
  readonly birthday?: ClientBirthday | 'today';
  readonly notes?: string;
  /** Archived ten days ago: shown under the archived section, never selectable. */
  readonly archived?: boolean;
}

export interface DemoAppointmentDefinition {
  readonly key: string;
  /** A client key of the definition. */
  readonly client: string;
  /** Starter keys of the profession, in booking order (one item each). */
  readonly services: readonly string[];
  /**
   * Local days from today: negative is history, 0 today, positive ahead.
   * Either this, or `monthsAgo` + `dayOfMonth`.
   */
  readonly dayOffset?: number;
  /**
   * Anchored in an EARLIER CALENDAR MONTH (1 = the month before today's), on
   * `dayOfMonth` (1–28, so the day exists in every month), whatever today's
   * date. This is how a demo keeps the Caisse month comparisons stable: the
   * compared span of the previous month always holds the same payments,
   * while day-relative history drifts with the day the demo is opened.
   */
  readonly monthsAgo?: number;
  readonly dayOfMonth?: number;
  readonly hour: number;
  readonly minute: number;
  readonly outcome: DemoAppointmentOutcome;
  readonly notes?: string;
  readonly discount?: AppointmentDiscount;
  /** PAID only; CARD when omitted. */
  readonly paidBy?: PaymentMethod;
  /** Cancellations only. */
  readonly reason?: string;
  /** Products sold during the appointment (« Revente »): PAID or COMPLETED only. */
  readonly products?: readonly DemoSaleLineDefinition[];
}

export interface DemoProductDefinition {
  readonly key: string;
  readonly name: string;
  readonly brand?: string;
  readonly category?: string;
  readonly barcode?: string;
  /** Euros. */
  readonly price: number;
  /** Units before the seeded sales; the stored stock is what remains after them. */
  readonly initialStock: number;
  /** Inactive products stay in the catalogue, unsellable. */
  readonly inactive?: boolean;
}

export interface DemoSaleLineDefinition {
  /** A product key of the definition. */
  readonly product: string;
  readonly quantity: number;
}

/**
 * A standalone product sale (« Nouvelle vente »), paid by card or cash. Either
 * a day and time, or `minutesAgo` — a sale made earlier TODAY, never in the
 * future whatever the hour the demo is opened (at the latest one minute after
 * midnight).
 */
export interface DemoSaleDefinition {
  readonly key: string;
  /** A client key; a walk-in sale when omitted. */
  readonly client?: string;
  readonly dayOffset?: number;
  readonly hour?: number;
  readonly minute?: number;
  readonly minutesAgo?: number;
  readonly lines: readonly DemoSaleLineDefinition[];
  /** CARD when omitted. */
  readonly paidBy?: PaymentMethod;
}

export interface DemoCategoryDefinition {
  readonly key: string;
  readonly name: string;
  readonly description?: string;
}

export interface DemoScenarioDefinition {
  readonly activityType: ProfessionId;
  readonly businessName: string;
  readonly ownerFirstName: string;
  readonly ownerLastName: string;
  readonly phone?: string;
  /** The demo price (euros) of EVERY starter prestation of the profession. */
  readonly prices: Readonly<Record<string, number>>;
  /** Professional categories, in their order (multi-profession Step 3). Optional: none by default. */
  readonly categories?: readonly DemoCategoryDefinition[];
  /** Starter key → category key; a starter not listed stays « Sans catégorie ». */
  readonly serviceCategories?: Readonly<Record<string, string>>;
  /** Starter key → the professional's description of the prestation. */
  readonly descriptions?: Readonly<Record<string, string>>;
  readonly clients: readonly DemoClientDefinition[];
  readonly appointments: readonly DemoAppointmentDefinition[];
  /** The retail catalogue (Step B2). */
  readonly products?: readonly DemoProductDefinition[];
  /** Standalone product sales (Step B2). */
  readonly sales?: readonly DemoSaleDefinition[];
}

const SLUGS: Readonly<Record<ProfessionId, string>> = {
  HAIRDRESSING: 'hairdressing',
  NAILS: 'nails',
  ESTHETICS: 'esthetics',
};

export function getDemoBusinessId(activityType: ProfessionId): string {
  return `playground-demo-${SLUGS[activityType]}`;
}

function localTime(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

function totalDurationMinutes(items: readonly AppointmentItem[]): number {
  return items.reduce(
    (total, item) => total + item.phases.reduce((sum, phase) => sum + phase.durationMinutes, 0),
    0,
  );
}

function assertUniqueKeys(kind: string, keys: readonly string[]): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new Error(`Playground demo: duplicate ${kind} key "${key}"`);
    seen.add(key);
  }
}

function buildBusiness(definition: DemoScenarioDefinition, today: Date): BusinessProfile {
  const createdAt = addLocalDays(today, -90);
  return {
    id: getDemoBusinessId(definition.activityType),
    ownerUserId: DEMO_OWNER_USER_ID,
    ownerFirstName: definition.ownerFirstName,
    ownerLastName: definition.ownerLastName,
    name: definition.businessName,
    activityType: definition.activityType,
    ...(definition.phone !== undefined && { phone: definition.phone }),
    createdAt,
    updatedAt: createdAt,
  };
}

function buildCategories(business: BusinessProfile, definition: DemoScenarioDefinition): readonly ServiceCategory[] {
  return (definition.categories ?? []).map((category, position) =>
    createServiceCategory({
      id: `${business.id}-category-${category.key}`,
      businessId: business.id,
      name: category.name,
      description: category.description,
      position,
    }),
  );
}

function buildService(
  business: BusinessProfile,
  starter: StarterService,
  definition: DemoScenarioDefinition,
): Service {
  const price = definition.prices[starter.key];
  if (price === undefined) {
    throw new Error(`Playground demo: no price for the starter "${starter.key}" of ${business.activityType}`);
  }
  const categoryKey = definition.serviceCategories?.[starter.key];
  if (categoryKey !== undefined && !(definition.categories ?? []).some((category) => category.key === categoryKey)) {
    throw new Error(`Playground demo: the starter "${starter.key}" names an unknown category "${categoryKey}"`);
  }
  const description = normalizeServiceDescription(definition.descriptions?.[starter.key]);
  const id = `${business.id}-service-${starter.key}`;
  return {
    id,
    businessId: business.id,
    name: starter.name,
    type: starter.type,
    price,
    phases: starter.phases.map((phase, index) => ({
      id: `${id}-phase-${index + 1}`,
      name: phase.name,
      durationMinutes: phase.durationMinutes,
      requiresStaff: phase.requiresStaff,
    })),
    active: true,
    ...(categoryKey !== undefined && { categoryId: `${business.id}-category-${categoryKey}` }),
    ...(description !== undefined && { description }),
  };
}

function buildClient(business: BusinessProfile, definition: DemoClientDefinition, today: Date): Client {
  const birthday =
    definition.birthday === 'today'
      ? { month: today.getMonth() + 1, day: today.getDate() }
      : definition.birthday;
  return {
    id: `${business.id}-client-${definition.key}`,
    firstName: definition.firstName,
    ...(definition.lastName !== undefined && { lastName: definition.lastName }),
    ...(definition.phone !== undefined && { phone: definition.phone }),
    ...(definition.email !== undefined && { email: definition.email }),
    ...(birthday !== undefined && { birthday }),
    ...(definition.notes !== undefined && { notes: definition.notes }),
    ...(definition.archived && { archivedAt: localTime(addLocalDays(today, -10), 18, 0) }),
  };
}

function buildProduct(business: BusinessProfile, definition: DemoProductDefinition): Product {
  return {
    id: `${business.id}-product-${definition.key}`,
    businessId: business.id,
    name: definition.name,
    ...(definition.brand !== undefined && { brand: definition.brand }),
    ...(definition.category !== undefined && { category: definition.category }),
    ...(definition.barcode !== undefined && { barcode: definition.barcode }),
    price: definition.price,
    // The stock BEFORE the seeded sales; `withStockAfterSales` takes them out.
    stockQuantity: definition.initialStock,
    active: !definition.inactive,
  };
}

function buildSaleItems(
  saleId: string,
  owner: string,
  lines: readonly DemoSaleLineDefinition[],
  productsByKey: ReadonlyMap<string, Product>,
) {
  if (lines.length === 0) throw new Error(`Playground demo: the sale of "${owner}" has no line`);
  return lines.map((line, index) => {
    const product = productsByKey.get(line.product);
    if (!product) throw new Error(`Playground demo: "${owner}" sells an unknown product "${line.product}"`);
    if (!product.active) throw new Error(`Playground demo: "${owner}" sells the inactive product "${line.product}"`);
    return createSaleItemSnapshot({ id: `${saleId}-item-${index + 1}`, product, quantity: line.quantity });
  });
}

/** The local day of an appointment definition: relative to today, or anchored in an earlier month. */
function appointmentDay(definition: DemoAppointmentDefinition, today: Date): Date {
  const { key, dayOffset, monthsAgo, dayOfMonth } = definition;
  if (monthsAgo === undefined && dayOfMonth === undefined) {
    if (dayOffset === undefined) {
      throw new Error(`Playground demo: appointment "${key}" needs a dayOffset, or monthsAgo and dayOfMonth`);
    }
    return addLocalDays(today, dayOffset);
  }
  if (dayOffset !== undefined || monthsAgo === undefined || dayOfMonth === undefined) {
    throw new Error(`Playground demo: appointment "${key}" mixes dayOffset with monthsAgo / dayOfMonth`);
  }
  if (!Number.isInteger(monthsAgo) || monthsAgo < 1) {
    throw new Error(`Playground demo: appointment "${key}" must be anchored in an earlier month (monthsAgo >= 1)`);
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
    throw new Error(`Playground demo: appointment "${key}" needs a dayOfMonth between 1 and 28`);
  }
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
  return new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), dayOfMonth);
}

function buildAppointment(
  business: BusinessProfile,
  definition: DemoAppointmentDefinition,
  clientsByKey: ReadonlyMap<string, Client>,
  servicesByKey: ReadonlyMap<string, Service>,
  productsByKey: ReadonlyMap<string, Product>,
  today: Date,
): { readonly appointment: Appointment; readonly linkedSale?: Sale } {
  const client = clientsByKey.get(definition.client);
  if (!client) {
    throw new Error(`Playground demo: appointment "${definition.key}" names an unknown client "${definition.client}"`);
  }
  if (definition.services.length === 0) {
    throw new Error(`Playground demo: appointment "${definition.key}" has no prestation`);
  }
  const id = `${business.id}-appointment-${definition.key}`;
  const items = definition.services.map((serviceKey, index) => {
    const service = servicesByKey.get(serviceKey);
    if (!service) {
      throw new Error(`Playground demo: appointment "${definition.key}" names an unknown prestation "${serviceKey}"`);
    }
    return createAppointmentItemSnapshot({ id: `${id}-item-${index + 1}`, service, order: index });
  });
  const startAt = localTime(appointmentDay(definition, today), definition.hour, definition.minute);
  const endAt = new Date(startAt.getTime() + totalDurationMinutes(items) * 60_000);
  const base: Appointment = {
    id,
    businessId: business.id,
    clientId: client.id,
    staffMemberId: currentStaffMemberId,
    startAt,
    status: 'SCHEDULED',
    items,
    ...(definition.notes !== undefined && { notes: definition.notes }),
    ...(definition.discount !== undefined && { discount: definition.discount }),
  };

  let linkedSale: Sale | undefined;
  if (definition.products !== undefined) {
    if (definition.outcome !== 'PAID' && definition.outcome !== 'COMPLETED') {
      throw new Error(`Playground demo: appointment "${definition.key}" sells products without being done`);
    }
    const saleId = `${id}-sale`;
    // « Revente »: linked to the appointment, sold at its end, never paid on its own.
    linkedSale = {
      id: saleId,
      businessId: business.id,
      clientId: client.id,
      appointmentId: id,
      completedAt: endAt,
      items: buildSaleItems(saleId, `appointment ${definition.key}`, definition.products, productsByKey),
    };
  }
  const done = (appointment: Appointment) => ({ appointment, ...(linkedSale && { linkedSale }) });

  switch (definition.outcome) {
    case 'SCHEDULED':
      return done(base);
    case 'CONFIRMED':
      return done({ ...base, status: 'CONFIRMED' });
    case 'COMPLETED':
      return done({ ...base, status: 'COMPLETED' });
    case 'PAID': {
      // The checkout settles the expected total: services net of the discount + linked products.
      const { expectedTotalCents } = getAppointmentExpectedTotal(base, linkedSale ? [linkedSale] : []);
      const byCash = definition.paidBy === 'CASH';
      return done({
        ...base,
        status: 'COMPLETED',
        payment: {
          paidAt: endAt,
          cardAmountCents: byCash ? 0 : expectedTotalCents,
          cashAmountCents: byCash ? expectedTotalCents : 0,
        },
      });
    }
    case 'CANCELLED_BY_CLIENT':
    case 'CANCELLED_BY_BUSINESS':
      return done({
        ...base,
        status: 'CANCELLED',
        cancellation: {
          // The eve of the appointment, end of day: before the start, whatever the hour.
          cancelledAt: localTime(addLocalDays(startOfLocalDay(startAt), -1), 18, 30),
          cancelledBy: definition.outcome === 'CANCELLED_BY_CLIENT' ? 'CLIENT' : 'BUSINESS',
          ...(definition.reason !== undefined && { reason: definition.reason }),
        },
      });
    case 'NO_SHOW':
      return done({
        ...base,
        status: 'NO_SHOW',
        noShow: { recordedAt: new Date(startAt.getTime() + 30 * 60_000) },
      });
  }
}

function saleInstant(definition: DemoSaleDefinition, today: Date, now: Date): Date {
  if (definition.minutesAgo !== undefined) {
    // Earlier today, never in the future and never yesterday.
    const earliest = new Date(today.getTime() + 60_000);
    const instant = new Date(now.getTime() - definition.minutesAgo * 60_000);
    return instant < earliest ? earliest : instant;
  }
  if (definition.dayOffset === undefined || definition.hour === undefined || definition.minute === undefined) {
    throw new Error(`Playground demo: sale "${definition.key}" needs a day and time, or minutesAgo`);
  }
  if (definition.dayOffset >= 0) {
    throw new Error(`Playground demo: sale "${definition.key}" must be in the past (use minutesAgo for today)`);
  }
  return localTime(addLocalDays(today, definition.dayOffset), definition.hour, definition.minute);
}

function buildSale(
  business: BusinessProfile,
  definition: DemoSaleDefinition,
  clientsByKey: ReadonlyMap<string, Client>,
  productsByKey: ReadonlyMap<string, Product>,
  today: Date,
  now: Date,
): Sale {
  const client = definition.client === undefined ? undefined : clientsByKey.get(definition.client);
  if (definition.client !== undefined && !client) {
    throw new Error(`Playground demo: sale "${definition.key}" names an unknown client "${definition.client}"`);
  }
  const id = `${business.id}-sale-${definition.key}`;
  const items = buildSaleItems(id, `sale ${definition.key}`, definition.lines, productsByKey);
  const completedAt = saleInstant(definition, today, now);
  const totalCents = getSaleTotalCents({ items });
  const byCash = definition.paidBy === 'CASH';
  return {
    id,
    businessId: business.id,
    ...(client && { clientId: client.id }),
    completedAt,
    items,
    payment: {
      paidAt: completedAt,
      cardAmountCents: byCash ? 0 : totalCents,
      cashAmountCents: byCash ? totalCents : 0,
    },
  };
}

/** The stored stock: the initial stock minus every seeded sale line. */
function withStockAfterSales(products: readonly Product[], sales: readonly Sale[]): readonly Product[] {
  return products.map((product) => {
    const sold = sales
      .flatMap((sale) => sale.items)
      .filter((item) => item.productId === product.id)
      .reduce((total, item) => total + item.quantity, 0);
    const stockQuantity = product.stockQuantity - sold;
    if (stockQuantity < 0) {
      throw new Error(`Playground demo: the seeded sales sell more "${product.name}" than its initial stock`);
    }
    return { ...product, stockQuantity };
  });
}

/** Builds the scenario of a definition, relative to `now`. Pure and deterministic. */
export function buildDemoScenario(definition: DemoScenarioDefinition, now: Date): PlaygroundDemoScenario {
  assertUniqueKeys('client', definition.clients.map((client) => client.key));
  assertUniqueKeys('appointment', definition.appointments.map((appointment) => appointment.key));
  assertUniqueKeys('category', (definition.categories ?? []).map((category) => category.key));
  assertUniqueKeys('product', (definition.products ?? []).map((product) => product.key));
  assertUniqueKeys('sale', (definition.sales ?? []).map((sale) => sale.key));

  const today = startOfLocalDay(now);
  const business = buildBusiness(definition, today);
  const serviceCategories = buildCategories(business, definition);
  const services = getStarterServices(definition.activityType).map((starter) =>
    buildService(business, starter, definition),
  );
  const servicesByKey = new Map(
    getStarterServices(definition.activityType).map((starter, index) => [starter.key, services[index]!]),
  );
  const clients = definition.clients.map((client) => buildClient(business, client, today));
  const clientsByKey = new Map(definition.clients.map((client, index) => [client.key, clients[index]!]));
  const initialProducts = (definition.products ?? []).map((product) => buildProduct(business, product));
  const productsByKey = new Map((definition.products ?? []).map((product, index) => [product.key, initialProducts[index]!]));
  const built = definition.appointments.map((appointment) =>
    buildAppointment(business, appointment, clientsByKey, servicesByKey, productsByKey, today),
  );
  const appointments = built.map((entry) => entry.appointment);
  const standaloneSales = (definition.sales ?? []).map((sale) =>
    buildSale(business, sale, clientsByKey, productsByKey, today, now),
  );
  const sales = [...built.flatMap((entry) => (entry.linkedSale ? [entry.linkedSale] : [])), ...standaloneSales].sort(
    (a, b) => a.completedAt.getTime() - b.completedAt.getTime(),
  );
  const products = withStockAfterSales(initialProducts, sales);

  return {
    activityType: definition.activityType,
    business,
    seed: { clients, services, serviceCategories, products, appointments, sales },
  };
}

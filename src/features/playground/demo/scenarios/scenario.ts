// BeautIzzy — Playground demo scenarios: the builder (development ONLY) — pure
//
// A scenario is ONE fictional Business of a profession with its clients, its
// catalogue and its appointments, expressed as a compact definition
// (hairdressing.ts, nails.ts, esthetics.ts) and turned here into the real
// domain records the application persists and displays: `Client`, `Service`
// (built from the profession's onboarding starters, priced for the demo) and
// `Appointment` with genuine item snapshots (`createAppointmentItemSnapshot`),
// so the Agenda, the profile and the details read exactly what a real
// Business would produce.
//
// Deterministic: the same definition and the same `now` give the same
// records, with stable readable identifiers (`playground-demo-<profession>-…`)
// that no real record can carry. Dates are RELATIVE to `now` (day offsets),
// so the Agenda is meaningful whenever the Playground is opened: history
// behind, today busy, the next two weeks planned. A definition error (an
// unknown client or prestation key, a missing price) throws at build time —
// the tests catch it, a developer never sees a half-built demo.
//
// Nothing here knows persistence, React or navigation.

import {
  createAppointmentItemSnapshot,
  getAppointmentServicesTotal,
  type Appointment,
  type AppointmentDiscount,
  type AppointmentItem,
  type PaymentMethod,
  type Service,
} from '@/domain/appointments';
import type { BusinessProfile, ProfessionId } from '@/domain/business';
import type { Client, ClientBirthday } from '@/domain/clients';
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
  /** Local days from today: negative is history, 0 today, positive ahead. */
  readonly dayOffset: number;
  readonly hour: number;
  readonly minute: number;
  readonly outcome: DemoAppointmentOutcome;
  readonly notes?: string;
  readonly discount?: AppointmentDiscount;
  /** PAID only; CARD when omitted. */
  readonly paidBy?: PaymentMethod;
  /** Cancellations only. */
  readonly reason?: string;
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

function buildAppointment(
  business: BusinessProfile,
  definition: DemoAppointmentDefinition,
  clientsByKey: ReadonlyMap<string, Client>,
  servicesByKey: ReadonlyMap<string, Service>,
  today: Date,
): Appointment {
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
  const startAt = localTime(addLocalDays(today, definition.dayOffset), definition.hour, definition.minute);
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

  switch (definition.outcome) {
    case 'SCHEDULED':
      return base;
    case 'CONFIRMED':
      return { ...base, status: 'CONFIRMED' };
    case 'COMPLETED':
      return { ...base, status: 'COMPLETED' };
    case 'PAID': {
      const { netCents } = getAppointmentServicesTotal(base);
      const paidAt = new Date(startAt.getTime() + totalDurationMinutes(items) * 60_000);
      const byCash = definition.paidBy === 'CASH';
      return {
        ...base,
        status: 'COMPLETED',
        payment: {
          paidAt,
          cardAmountCents: byCash ? 0 : netCents,
          cashAmountCents: byCash ? netCents : 0,
        },
      };
    }
    case 'CANCELLED_BY_CLIENT':
    case 'CANCELLED_BY_BUSINESS':
      return {
        ...base,
        status: 'CANCELLED',
        cancellation: {
          // The eve of the appointment, end of day: before the start, whatever the hour.
          cancelledAt: localTime(addLocalDays(startOfLocalDay(startAt), -1), 18, 30),
          cancelledBy: definition.outcome === 'CANCELLED_BY_CLIENT' ? 'CLIENT' : 'BUSINESS',
          ...(definition.reason !== undefined && { reason: definition.reason }),
        },
      };
    case 'NO_SHOW':
      return {
        ...base,
        status: 'NO_SHOW',
        noShow: { recordedAt: new Date(startAt.getTime() + 30 * 60_000) },
      };
  }
}

/** Builds the scenario of a definition, relative to `now`. Pure and deterministic. */
export function buildDemoScenario(definition: DemoScenarioDefinition, now: Date): PlaygroundDemoScenario {
  assertUniqueKeys('client', definition.clients.map((client) => client.key));
  assertUniqueKeys('appointment', definition.appointments.map((appointment) => appointment.key));
  assertUniqueKeys('category', (definition.categories ?? []).map((category) => category.key));

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
  const appointments = definition.appointments.map((appointment) =>
    buildAppointment(business, appointment, clientsByKey, servicesByKey, today),
  );

  return {
    activityType: definition.activityType,
    business,
    seed: { clients, services, serviceCategories, products: [], appointments, sales: [] },
  };
}

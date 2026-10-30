// BeautIzzy — Playground « première utilisation » scenarios (development ONLY) — pure
//
// The demo of a Business that has JUST finished its onboarding, at one of a
// few realistic moments of its first days, so the « Premiers pas avec
// BeautIzzy » card of Accueil can be judged in every state it derives:
//
//   just-onboarded         the kept starter prestations at 0 € — nothing else
//   clients-imported       + the address book (the starters still unpriced)
//   first-appointment      + one appointment tomorrow (the starters still unpriced)
//   priced-with-products   priced prestations, the address book, the retail
//                          catalogue — only the first appointment is missing
//
// Built from the SAME profession definitions as the established demos — their
// starters, prices, clients and products — so every record is a genuine
// domain record with a `playground-demo-…` identifier no real record carries.
// The Business is created today; when the onboarding preview hands over, it
// carries the name and first name typed there and only the starters kept there.
//
// Nothing here knows persistence, React or navigation.

import { createAppointmentItemSnapshot, type Appointment, type Service } from '@/domain/appointments';
import type { BusinessProfile } from '@/domain/business';
import { addLocalDays, startOfLocalDay } from '@/features/agenda/calendar/week';
import { currentStaffMemberId } from '@/features/appointments/current-staff-member';
import { getStarterServices } from '@/features/business/setup/starter-services';

import {
  buildBusiness,
  buildClient,
  buildProduct,
  buildService,
  type DemoScenarioDefinition,
  type PlaygroundDemoScenario,
} from './scenario';

export type FirstUseStage = 'just-onboarded' | 'clients-imported' | 'first-appointment' | 'priced-with-products';

export interface FirstUseStageOption {
  readonly stage: FirstUseStage;
  readonly title: string;
  readonly description: string;
}

/** In the order a professional usually lives them. */
export const FIRST_USE_STAGES: readonly FirstUseStageOption[] = [
  { stage: 'just-onboarded', title: 'Juste après l’onboarding', description: 'Prestations de départ à 0 €, rien d’autre' },
  { stage: 'clients-imported', title: 'Clientèle importée', description: 'Des clients, les tarifs encore à renseigner' },
  { stage: 'first-appointment', title: 'Premier rendez-vous créé', description: 'Clients et un rendez-vous, tarifs à renseigner' },
  {
    stage: 'priced-with-products',
    title: 'Tarifs et produits renseignés',
    description: 'Il ne manque que le premier rendez-vous',
  },
];

/** What the onboarding preview hands over: the identity typed and the starters kept. */
export interface FirstUseOrigin {
  readonly businessName: string;
  readonly ownerFirstName: string;
  readonly ownerLastName?: string;
  /** Undefined: every starter of the profession. */
  readonly keptStarterKeys?: readonly string[];
}

export interface FirstUseRequest {
  readonly stage: FirstUseStage;
  readonly origin?: FirstUseOrigin;
}

/** How many clients an « imported » address book holds: enough to feel real. */
const IMPORTED_CLIENT_COUNT = 6;

export function buildFirstUseScenario(
  definition: DemoScenarioDefinition,
  { stage, origin }: FirstUseRequest,
  now: Date,
): PlaygroundDemoScenario {
  const today = startOfLocalDay(now);
  const established = buildBusiness(definition, today);
  const business: BusinessProfile = {
    ...established,
    ...(origin && {
      name: origin.businessName,
      ownerFirstName: origin.ownerFirstName,
      ownerLastName: origin.ownerLastName,
    }),
    createdAt: now,
    updatedAt: now,
  };

  const kept = new Set(origin?.keptStarterKeys ?? getStarterServices(definition.activityType).map((starter) => starter.key));
  const priced = stage === 'priced-with-products';
  const services: Service[] = getStarterServices(definition.activityType)
    .filter((starter) => kept.has(starter.key))
    // Onboarding writes its starters at 0 € (« à renseigner »); only a later stage priced them.
    // No category and no description: onboarding writes neither.
    .map((starter) => {
      const { id, businessId, name, type, price, phases, active } = buildService(business, starter, definition);
      return { id, businessId, name, type, price: priced ? price : 0, phases, active };
    });

  const withClients = stage !== 'just-onboarded';
  const clients = withClients
    ? definition.clients
        .filter((client) => !client.archived)
        .slice(0, IMPORTED_CLIENT_COUNT)
        .map((client) => buildClient(business, client, today))
    : [];

  const appointments: Appointment[] = [];
  const firstService = services[0];
  const firstClient = clients[0];
  if (stage === 'first-appointment' && firstService && firstClient) {
    const id = `${business.id}-appointment-first`;
    const tomorrow = addLocalDays(today, 1);
    appointments.push({
      id,
      businessId: business.id,
      clientId: firstClient.id,
      staffMemberId: currentStaffMemberId,
      startAt: new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 10, 0),
      status: 'SCHEDULED',
      items: [createAppointmentItemSnapshot({ id: `${id}-item-1`, service: firstService, order: 0 })],
    });
  }

  const products = priced
    ? (definition.products ?? []).filter((product) => !product.inactive).map((product) => buildProduct(business, product))
    : [];

  return {
    activityType: definition.activityType,
    business,
    seed: { clients, services, serviceCategories: [], products, appointments, sales: [] },
  };
}

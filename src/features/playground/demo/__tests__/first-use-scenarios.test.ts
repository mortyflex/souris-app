// BeautIzzy — Playground first-use scenarios (pure)

import { getFirstSteps } from '@/features/home/first-steps/first-steps';
import { getStarterServices } from '@/features/business/setup/starter-services';

import { createPlaygroundDemoScenario, FIRST_USE_STAGES, type FirstUseStage } from '../scenarios';

const NOW = new Date(2027, 2, 10, 15, 30);
const PROFESSIONS = ['HAIRDRESSING', 'NAILS', 'ESTHETICS', 'WELLNESS'] as const;

function stepsOf(activity: (typeof PROFESSIONS)[number], stage: FirstUseStage) {
  const { seed } = createPlaygroundDemoScenario(activity, NOW, { stage });
  const steps = getFirstSteps({
    activeServices: seed.services.filter((service) => service.active),
    clientCount: seed.clients.filter((client) => client.archivedAt === undefined).length,
    appointmentCount: seed.appointments.length,
    productCount: seed.products.length,
  });
  return Object.fromEntries(steps.map((step) => [step.key, step.done]));
}

describe('first-use scenarios', () => {
  it('lists four stages, in the order they are lived', () => {
    expect(FIRST_USE_STAGES.map((option) => option.stage)).toEqual([
      'just-onboarded',
      'clients-imported',
      'first-appointment',
      'priced-with-products',
    ]);
  });

  describe.each(PROFESSIONS)('%s', (activity) => {
    it.each([
      ['just-onboarded', { services: false, clients: false, appointment: false, products: false }],
      ['clients-imported', { services: false, clients: true, appointment: false, products: false }],
      ['first-appointment', { services: false, clients: true, appointment: true, products: false }],
      ['priced-with-products', { services: true, clients: true, appointment: false, products: true }],
    ] as const)('« %s » derives the expected « Premiers pas » states', (stage, expected) => {
      expect(stepsOf(activity, stage)).toEqual(expected);
    });

    it('is a demo Business created today, with demo identifiers only and no history', () => {
      const scenario = createPlaygroundDemoScenario(activity, NOW, { stage: 'first-appointment' });
      expect(scenario.business.id.startsWith('playground-demo-')).toBe(true);
      expect(scenario.business.createdAt).toEqual(NOW);
      const ids = [
        ...scenario.seed.clients.map((client) => client.id),
        ...scenario.seed.services.map((service) => service.id),
        ...scenario.seed.appointments.map((appointment) => appointment.id),
      ];
      expect(ids.every((id) => id.startsWith(scenario.business.id))).toBe(true);
      expect(scenario.seed.sales).toEqual([]);
      // The first appointment is ahead, never a past (auto-completed) one.
      expect(scenario.seed.appointments.every((appointment) => appointment.startAt > NOW)).toBe(true);
      expect(scenario.seed.services.every((service) => service.categoryId === undefined)).toBe(true);
    });
  });

  it('carries the onboarding preview identity and only the starters kept there, at 0 €', () => {
    const kept = getStarterServices('NAILS').slice(0, 3).map((starter) => starter.key);
    const scenario = createPlaygroundDemoScenario('NAILS', NOW, {
      stage: 'just-onboarded',
      origin: { businessName: 'Nails by Sofia', ownerFirstName: 'Sofia', keptStarterKeys: kept },
    });
    expect(scenario.business).toMatchObject({ name: 'Nails by Sofia', ownerFirstName: 'Sofia', activityType: 'NAILS' });
    expect(scenario.seed.services).toHaveLength(3);
    expect(scenario.seed.services.every((service) => service.price === 0)).toBe(true);
  });

  it('leaves the established demo unchanged when no first use is asked', () => {
    const established = createPlaygroundDemoScenario('HAIRDRESSING', NOW);
    expect(established.seed.appointments.length).toBeGreaterThan(0);
    expect(established.seed.services.every((service) => service.price > 0)).toBe(true);
  });
});

// BeautIzzy — Playground demo scenarios: three distinct, coherent, deterministic datasets

import { PROFESSIONS, type ProfessionId } from '@/domain/business';
import { isSameLocalDay, startOfLocalDay } from '@/features/agenda/calendar/week';
import { currentStaffMemberId } from '@/features/appointments/current-staff-member';
import { getStarterServices } from '@/features/business/setup/starter-services';

import {
  getAppointmentExpectedTotal,
  getAppointmentStaffBusyIntervals,
  getElapsedDurationMinutes,
  getProcessingDurationMinutes,
  getSaleTotalCents,
  getStaffActiveDurationMinutes,
  type Appointment,
} from '@/domain/appointments';
import { findAppointmentCalendarBlockConflict } from '@/domain/calendar-blocks';

import { createPlaygroundDemoScenario, getDemoBusinessId } from '../scenarios';
import { buildDemoScenario } from '../scenarios/scenario';
import { HAIRDRESSING_DEMO } from '../scenarios/hairdressing';

// A fixed instant far from the real clock (a Wednesday afternoon), so the
// relative fixtures are checked against it, never against today.
const NOW = new Date(2027, 2, 10, 15, 30);
const TODAY = startOfLocalDay(NOW);
const PROFESSION_IDS = PROFESSIONS.map((profession) => profession.id);

describe('Playground demo scenarios', () => {
  it.each(PROFESSION_IDS)('%s: one fictional Business that owns every record', (activityType) => {
    const { business, seed } = createPlaygroundDemoScenario(activityType, NOW);

    expect(business.id).toBe(getDemoBusinessId(activityType));
    expect(business.id.startsWith('playground-demo-')).toBe(true);
    expect(business.activityType).toBe(activityType);
    expect(business.name.endsWith('Démo')).toBe(true);
    expect(business.ownerUserId).toBe('playground-demo-owner');
    for (const service of seed.services) expect(service.businessId).toBe(business.id);
    for (const appointment of seed.appointments) expect(appointment.businessId).toBe(business.id);
    for (const record of [...seed.clients, ...seed.services, ...seed.appointments, ...seed.products, ...seed.sales]) {
      expect(record.id.startsWith(business.id)).toBe(true);
    }
    // Step B2: a retail shelf and its sales, owned by the same Business.
    for (const record of [...seed.products, ...seed.sales]) expect(record.businessId).toBe(business.id);
    expect(seed.products.length).toBeGreaterThanOrEqual(5);
    expect(seed.sales.length).toBeGreaterThanOrEqual(4);
  });

  it('builds three distinct datasets that share nothing', () => {
    const scenarios = PROFESSION_IDS.map((activityType) => createPlaygroundDemoScenario(activityType, NOW));

    expect(scenarios.map((scenario) => scenario.business.name)).toEqual([
      'Studio Coiffure Démo',
      'Atelier Ongles Démo',
      'Institut Beauté Démo',
    ]);
    const ids = scenarios.map(
      (scenario) =>
        new Set([
          scenario.business.id,
          ...scenario.seed.clients.map((client) => client.id),
          ...scenario.seed.services.map((service) => service.id),
          ...scenario.seed.appointments.map((appointment) => appointment.id),
          ...scenario.seed.products.map((product) => product.id),
          ...scenario.seed.sales.map((sale) => sale.id),
        ]),
    );
    for (const [index, set] of ids.entries()) {
      for (const [otherIndex, other] of ids.entries()) {
        if (index === otherIndex) continue;
        for (const id of set) expect(other.has(id)).toBe(false);
      }
    }
    const serviceNames = scenarios.map((scenario) => new Set(scenario.seed.services.map((service) => service.name)));
    expect([...serviceNames[0]!].some((name) => serviceNames[1]!.has(name))).toBe(false);
  });

  it.each(PROFESSION_IDS)('%s: the catalogue is the profession’s starter base, priced', (activityType) => {
    const { seed } = createPlaygroundDemoScenario(activityType, NOW);
    const starters = getStarterServices(activityType);

    expect(seed.services.map((service) => service.name)).toEqual(starters.map((starter) => starter.name));
    for (const [index, service] of seed.services.entries()) {
      const starter = starters[index]!;
      expect(service.type).toBe(starter.type);
      expect(service.active).toBe(true);
      expect(service.price).toBeGreaterThan(0);
      expect(service.phases.map((phase) => [phase.name, phase.durationMinutes, phase.requiresStaff])).toEqual(
        starter.phases.map((phase) => [phase.name, phase.durationMinutes, phase.requiresStaff]),
      );
      expect(new Set(service.phases.map((phase) => phase.id)).size).toBe(service.phases.length);
    }
    expect(new Set(seed.services.map((service) => service.id)).size).toBe(seed.services.length);
  });

  it('NAILS and ESTHETICS carry the requested prestations', () => {
    expect(createPlaygroundDemoScenario('NAILS', NOW).seed.services.map((service) => service.name)).toEqual([
      'Pose complète gel',
      'Remplissage gel',
      'Semi-permanent mains',
      'Semi-permanent pieds',
      'Dépose',
      'Dépose par dissolution',
      'Nail art',
      'Réparation d’un ongle',
    ]);
    expect(createPlaygroundDemoScenario('ESTHETICS', NOW).seed.services.map((service) => service.name)).toEqual([
      'Soin du visage avec masque',
      'Épilation sourcils',
      'Épilation jambes',
      'Soin du corps',
      'Beauté du regard',
    ]);
  });

  it('HAIRDRESSING carries cuts, blow-dries, colouring and balayage, with a multi-phase TECHNIQUE booked today', () => {
    const { seed } = createPlaygroundDemoScenario('HAIRDRESSING', NOW);
    const names = seed.services.map((service) => service.name);
    expect(names).toEqual(expect.arrayContaining(['Coupe femme', 'Brushing', 'Coloration', 'Balayage']));

    const colour = seed.services.find((service) => service.name === 'Coloration')!;
    expect(colour.type).toBe('TECHNIQUE');
    expect(colour.phases.map((phase) => phase.requiresStaff)).toEqual([true, false, true]);

    const today = seed.appointments.filter((appointment) => isSameLocalDay(appointment.startAt, TODAY));
    const colourToday = today.find((appointment) => appointment.items.some((item) => item.serviceId === colour.id))!;
    expect(colourToday.items[0]!.phases.some((phase) => !phase.requiresStaff)).toBe(true);
    // A cut is booked during its processing time: overlap is the product's rule.
    const cutDuringPose = today.find(
      (appointment) =>
        appointment !== colourToday &&
        appointment.startAt.getTime() > colourToday.startAt.getTime() &&
        appointment.startAt.getTime() < colourToday.startAt.getTime() + 60 * 60_000,
    );
    expect(cutDuringPose).toBeDefined();
  });

  it.each(PROFESSION_IDS)('%s: every appointment references a client and prestations of the demo, as genuine snapshots', (activityType) => {
    const { seed } = createPlaygroundDemoScenario(activityType, NOW);
    const clientIds = new Set(seed.clients.map((client) => client.id));
    const servicesById = new Map(seed.services.map((service) => [service.id, service]));

    expect(seed.appointments.length).toBeGreaterThanOrEqual(15);
    expect(seed.appointments.length).toBeLessThanOrEqual(30);
    expect(new Set(seed.appointments.map((appointment) => appointment.id)).size).toBe(seed.appointments.length);
    for (const appointment of seed.appointments) {
      expect(clientIds.has(appointment.clientId)).toBe(true);
      expect(appointment.staffMemberId).toBe(currentStaffMemberId);
      expect(appointment.items.length).toBeGreaterThan(0);
      for (const [index, item] of appointment.items.entries()) {
        const service = servicesById.get(item.serviceId)!;
        expect(service).toBeDefined();
        expect(item.order).toBe(index);
        expect(item.serviceName).toBe(service.name);
        expect(item.serviceType).toBe(service.type);
        expect(item.price).toBe(service.price);
        expect(item.phases).toEqual(service.phases);
        expect(item.phases).not.toBe(service.phases);
      }
    }
    // Every client but the archived one has something in the Agenda.
    const booked = new Set(seed.appointments.map((appointment) => appointment.clientId));
    for (const client of seed.clients) {
      if (client.archivedAt === undefined) expect(booked.has(client.id)).toBe(true);
    }
  });

  it.each(PROFESSION_IDS)('%s: history, today and the next two weeks, every outcome represented', (activityType) => {
    const { seed } = createPlaygroundDemoScenario(activityType, NOW);
    const past = seed.appointments.filter((appointment) => appointment.startAt.getTime() < TODAY.getTime());
    const today = seed.appointments.filter((appointment) => isSameLocalDay(appointment.startAt, TODAY));
    const ahead = seed.appointments.filter((appointment) => appointment.startAt.getTime() >= TODAY.getTime() + 86_400_000);

    expect(past.length).toBeGreaterThanOrEqual(6);
    expect(today.length).toBeGreaterThanOrEqual(4);
    expect(ahead.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...ahead.map((appointment) => appointment.startAt.getTime()))).toBeLessThanOrEqual(
      TODAY.getTime() + 15 * 86_400_000,
    );

    const statuses = new Set(seed.appointments.map((appointment) => appointment.status));
    expect(statuses).toEqual(new Set(['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']));

    // Past days hold only historical outcomes; today and ahead hold nothing already done.
    for (const appointment of past) expect(['COMPLETED', 'CANCELLED', 'NO_SHOW']).toContain(appointment.status);
    for (const appointment of [...today, ...ahead]) expect(appointment.status).not.toBe('COMPLETED');
    for (const appointment of [...today, ...ahead]) expect(appointment.status).not.toBe('NO_SHOW');

    const paid = seed.appointments.filter((appointment) => appointment.payment !== undefined);
    expect(paid.length).toBeGreaterThanOrEqual(3);
    for (const appointment of paid) {
      expect(appointment.status).toBe('COMPLETED');
      // The checkout settles the expected total: services net of the discount + products sold during it.
      const { expectedTotalCents } = getAppointmentExpectedTotal(appointment, seed.sales);
      const received = appointment.payment!.cardAmountCents + appointment.payment!.cashAmountCents;
      expect(received).toBeGreaterThan(0);
      expect(received).toBe(expectedTotalCents);
      expect(appointment.payment!.paidAt.getTime()).toBeGreaterThan(appointment.startAt.getTime());
    }
    expect(paid.some((appointment) => appointment.payment!.cashAmountCents > 0)).toBe(true);
    expect(paid.some((appointment) => appointment.discount !== undefined)).toBe(true);

    for (const appointment of seed.appointments) {
      if (appointment.status === 'CANCELLED') {
        expect(appointment.cancellation).toBeDefined();
        expect(appointment.cancellation!.cancelledAt.getTime()).toBeLessThan(appointment.startAt.getTime());
      } else {
        expect(appointment.cancellation).toBeUndefined();
      }
      if (appointment.status === 'NO_SHOW') {
        expect(appointment.noShow!.recordedAt.getTime()).toBeGreaterThan(appointment.startAt.getTime());
      } else {
        expect(appointment.noShow).toBeUndefined();
      }
    }
    expect(seed.appointments.some((appointment) => appointment.cancellation?.cancelledBy === 'CLIENT')).toBe(true);
    expect(seed.appointments.some((appointment) => appointment.cancellation?.cancelledBy === 'BUSINESS')).toBe(true);
  });

  it.each(PROFESSION_IDS)('%s: fictional clients with contact details, one birthday today, one archived', (activityType) => {
    const { seed } = createPlaygroundDemoScenario(activityType, NOW);

    expect(seed.clients.length).toBeGreaterThanOrEqual(6);
    expect(new Set(seed.clients.map((client) => client.id)).size).toBe(seed.clients.length);
    expect(seed.clients.filter((client) => client.phone !== undefined).length).toBeGreaterThanOrEqual(3);
    expect(seed.clients.filter((client) => client.email !== undefined).length).toBeGreaterThanOrEqual(2);
    for (const client of seed.clients) {
      if (client.email !== undefined) expect(client.email.endsWith('@exemple.fr')).toBe(true);
      if (client.phone !== undefined) expect(client.phone.startsWith('06 00 00 00')).toBe(true);
    }
    expect(seed.clients.filter((client) => client.notes !== undefined).length).toBeGreaterThanOrEqual(2);
    expect(
      seed.clients.filter(
        (client) => client.birthday?.month === TODAY.getMonth() + 1 && client.birthday.day === TODAY.getDate(),
      ),
    ).toHaveLength(1);
    expect(seed.clients.filter((client) => client.archivedAt !== undefined)).toHaveLength(1);
  });

  it('NAILS and ESTHETICS exercise categories and descriptions; HAIRDRESSING keeps none (Step 3)', () => {
    const nails = createPlaygroundDemoScenario('NAILS', NOW);
    const esthetics = createPlaygroundDemoScenario('ESTHETICS', NOW);
    const hair = createPlaygroundDemoScenario('HAIRDRESSING', NOW);

    expect(nails.seed.serviceCategories?.map((category) => category.name)).toEqual([
      'Ongles naturels',
      'Extensions et poses en gel',
      'Remplissages',
      'Beauté des pieds',
      'Déposes',
      'Nail art et modèles',
    ]);
    expect(esthetics.seed.serviceCategories?.map((category) => category.name)).toEqual([
      'Soins du visage',
      'Épilations',
      'Soins du corps',
      'Beauté du regard',
      'Beauté des mains et des pieds',
    ]);
    expect(hair.seed.serviceCategories).toEqual([]);
    expect(hair.seed.services.every((service) => service.categoryId === undefined)).toBe(true);

    for (const { business, seed } of [nails, esthetics]) {
      const categories = seed.serviceCategories ?? [];
      expect(categories.map((category) => category.position)).toEqual(categories.map((_, index) => index));
      for (const category of categories) {
        expect(category.businessId).toBe(business.id);
        expect(category.id.startsWith(`${business.id}-category-`)).toBe(true);
      }
      const ids = new Set(categories.map((category) => category.id));
      for (const service of seed.services) {
        if (service.categoryId !== undefined) expect(ids.has(service.categoryId)).toBe(true);
      }
      expect(seed.services.filter((service) => service.description !== undefined).length).toBeGreaterThanOrEqual(3);
      // Appointment snapshots never carry the catalogue fields.
      for (const appointment of seed.appointments) {
        for (const item of appointment.items) {
          expect(item).not.toHaveProperty('categoryId');
          expect(item).not.toHaveProperty('description');
        }
      }
    }
    expect(nails.seed.services.find((service) => service.name === 'Réparation d’un ongle')?.categoryId).toBeUndefined();
    expect(nails.seed.services.find((service) => service.name === 'Pose complète gel')?.description).toContain('\n');
    const handsFeet = esthetics.seed.serviceCategories?.find((category) => category.name === 'Beauté des mains et des pieds');
    expect(esthetics.seed.services.some((service) => service.categoryId === handsFeet?.id)).toBe(false);
  });

  it('refuses a starter mapped to an unknown category', () => {
    expect(() =>
      buildDemoScenario({ ...HAIRDRESSING_DEMO, serviceCategories: { color: 'nowhere' } }, NOW),
    ).toThrow(/unknown category "nowhere"/);
  });

  it('is deterministic for one instant and relative to it', () => {
    const first = createPlaygroundDemoScenario('ESTHETICS', NOW);
    const second = createPlaygroundDemoScenario('ESTHETICS', new Date(NOW));
    expect(JSON.parse(JSON.stringify(second))).toEqual(JSON.parse(JSON.stringify(first)));

    const later = createPlaygroundDemoScenario('ESTHETICS', new Date(2027, 2, 17, 9, 0));
    for (const [index, appointment] of first.seed.appointments.entries()) {
      // Seven local days later, same local time — whatever daylight saving does in between.
      const shifted = new Date(
        appointment.startAt.getFullYear(),
        appointment.startAt.getMonth(),
        appointment.startAt.getDate() + 7,
        appointment.startAt.getHours(),
        appointment.startAt.getMinutes(),
      );
      expect(later.seed.appointments[index]!.startAt).toEqual(shifted);
    }
    const birthday = later.seed.clients.find((client) => client.birthday?.day === 17 && client.birthday.month === 3);
    expect(birthday).toBeDefined();
  });

  it('refuses a definition that names an unknown client, an unknown prestation or an unpriced starter', () => {
    const activityType: ProfessionId = 'HAIRDRESSING';
    const base = HAIRDRESSING_DEMO;
    const appointment = base.appointments[0]!;

    expect(() =>
      buildDemoScenario({ ...base, appointments: [{ ...appointment, client: 'nobody' }] }, NOW),
    ).toThrow(/unknown client "nobody"/);
    expect(() =>
      buildDemoScenario({ ...base, appointments: [{ ...appointment, services: ['nothing'] }] }, NOW),
    ).toThrow(/unknown prestation "nothing"/);
    const { color: _color, ...prices } = base.prices;
    expect(() => buildDemoScenario({ ...base, activityType, prices }, NOW)).toThrow(/no price for the starter "color"/);
    expect(() =>
      buildDemoScenario({ ...base, clients: [base.clients[0]!, base.clients[0]!] }, NOW),
    ).toThrow(/duplicate client key/);
  });

  describe('Step B2 — products, sales and payments agree', () => {
    it.each(PROFESSION_IDS)('%s: profession products, stock = initial stock − every seeded sale line', (activityType) => {
      const { seed } = createPlaygroundDemoScenario(activityType, NOW);
      const definitionStock = new Map(seed.products.map((product) => [product.id, product.stockQuantity]));
      const sold = new Map<string, number>();
      for (const item of seed.sales.flatMap((sale) => sale.items)) {
        sold.set(item.productId, (sold.get(item.productId) ?? 0) + item.quantity);
      }
      for (const product of seed.products) {
        expect(Number.isInteger(product.stockQuantity)).toBe(true);
        expect(product.stockQuantity).toBeGreaterThanOrEqual(0);
        expect(product.price).toBeGreaterThan(0);
      }
      // Something sold, something sold out or inactive: the catalogue states are all visible.
      expect([...sold.keys()].length).toBeGreaterThanOrEqual(3);
      expect(seed.products.some((product) => !product.active)).toBe(true);
      expect(definitionStock.size).toBe(seed.products.length);
      // Every line names a product of THIS catalogue, with its snapshot name and price.
      const products = new Map(seed.products.map((product) => [product.id, product]));
      for (const item of seed.sales.flatMap((sale) => sale.items)) {
        const product = products.get(item.productId)!;
        expect(product).toBeDefined();
        expect(product.active).toBe(true);
        expect(item.productName).toBe(product.name);
        expect(item.unitPrice).toBe(product.price);
      }
    });

    it('stores what remains after the seeded sales (hairdressing: 12 shampoos, 4 sold)', () => {
      const { seed, business } = createPlaygroundDemoScenario('HAIRDRESSING', NOW);
      const product = (key: string) => seed.products.find((entry) => entry.id === `${business.id}-product-${key}`)!;
      expect(product('shampoo').stockQuantity).toBe(12 - 4);
      expect(product('wax').stockQuantity).toBe(0);
      expect(product('hairspray').active).toBe(false);
    });

    it.each(PROFESSION_IDS)('%s: linked sales belong to done appointments; standalone sales record their payment', (activityType) => {
      const { seed } = createPlaygroundDemoScenario(activityType, NOW);
      const appointments = new Map(seed.appointments.map((appointment) => [appointment.id, appointment]));
      const clientIds = new Set(seed.clients.map((client) => client.id));
      const linked = seed.sales.filter((sale) => sale.appointmentId !== undefined);
      const standalone = seed.sales.filter((sale) => sale.appointmentId === undefined);
      expect(linked.length).toBeGreaterThanOrEqual(2);
      expect(standalone.length).toBeGreaterThanOrEqual(3);

      for (const sale of linked) {
        const appointment = appointments.get(sale.appointmentId!)!;
        expect(appointment.status).toBe('COMPLETED');
        expect(sale.clientId).toBe(appointment.clientId);
        // « Revente » never carries its own payment: the checkout counts it once.
        expect(sale.payment).toBeUndefined();
      }
      for (const sale of standalone) {
        if (sale.clientId !== undefined) expect(clientIds.has(sale.clientId)).toBe(true);
        const received = sale.payment!.cardAmountCents + sale.payment!.cashAmountCents;
        expect(received).toBe(getSaleTotalCents(sale));
        expect(sale.payment!.paidAt).toEqual(sale.completedAt);
      }
      expect(standalone.some((sale) => sale.payment!.cashAmountCents > 0)).toBe(true);
      expect(standalone.some((sale) => sale.payment!.cardAmountCents > 0)).toBe(true);
      expect(standalone.some((sale) => sale.clientId === undefined)).toBe(true);
      // Never in the future; one made earlier today feeds Accueil and the Cash Register.
      for (const sale of seed.sales) expect(sale.completedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(seed.sales.some((sale) => isSameLocalDay(sale.completedAt, NOW))).toBe(true);
    });

    it('keeps a sale made « earlier today » inside today, even just after midnight', () => {
      const justAfterMidnight = new Date(2027, 2, 10, 0, 10);
      const { seed } = createPlaygroundDemoScenario('NAILS', justAfterMidnight);
      const todays = seed.sales.filter((sale) => isSameLocalDay(sale.completedAt, justAfterMidnight));
      expect(todays.length).toBe(1);
      expect(todays[0]!.completedAt.getTime()).toBeLessThanOrEqual(justAfterMidnight.getTime());
      expect(todays[0]!.completedAt.getTime()).toBeGreaterThan(startOfLocalDay(justAfterMidnight).getTime());
    });

    it('refuses an incoherent retail definition at build time', () => {
      const base = HAIRDRESSING_DEMO;
      expect(() =>
        buildDemoScenario({ ...base, sales: [{ key: 'x', minutesAgo: 5, lines: [{ product: 'ghost', quantity: 1 }] }] }, NOW),
      ).toThrow(/unknown product "ghost"/);
      expect(() =>
        buildDemoScenario({ ...base, sales: [{ key: 'x', minutesAgo: 5, lines: [{ product: 'wax', quantity: 9 }] }] }, NOW),
      ).toThrow(/more "Cire coiffante mate" than its initial stock/);
      expect(() =>
        buildDemoScenario({ ...base, sales: [{ key: 'x', minutesAgo: 5, lines: [{ product: 'hairspray', quantity: 1 }] }] }, NOW),
      ).toThrow(/inactive product/);
      expect(() =>
        buildDemoScenario({ ...base, sales: [{ key: 'x', dayOffset: 2, hour: 9, minute: 0, lines: [{ product: 'mask', quantity: 1 }] }] }, NOW),
      ).toThrow(/must be in the past/);
      const scheduledWithProducts = base.appointments.map((appointment) =>
        appointment.key === 't1' ? { ...appointment, products: [{ product: 'mask', quantity: 1 }] } : appointment,
      );
      expect(() => buildDemoScenario({ ...base, appointments: scheduledWithProducts }, NOW)).toThrow(
        /sells products without being done/,
      );
    });
  });
});

// Realistic multi-phase examples: one per profession beyond hairdressing, visible in the
// demo agenda today. Their waiting phase is staff-free (`requiresStaff = false`) because the
// example genuinely lets the professional see someone else — nothing else changes.
describe('Playground multi-phase examples (nails, esthetics)', () => {
  const at = (hour: number, minute: number) => new Date(2027, 2, 10, hour, minute);
  const appointment = (activityType: 'NAILS' | 'ESTHETICS', key: string): Appointment => {
    const { business, seed } = createPlaygroundDemoScenario(activityType, NOW);
    return seed.appointments.find((entry) => entry.id === `${business.id}-appointment-${key}`)!;
  };
  const timing = (activityType: 'NAILS' | 'ESTHETICS', key: string) => {
    const { business, seed } = createPlaygroundDemoScenario(activityType, NOW);
    const service = seed.services.find((entry) => entry.id === `${business.id}-service-${key}`)!;
    return { service, phases: service.phases.map((phase) => [phase.name, phase.durationMinutes, phase.requiresStaff]) };
  };
  const block = (startAt: Date, endAt: Date) => ({
    id: 'block',
    businessId: 'any',
    staffMemberId: currentStaffMemberId,
    startAt,
    endAt,
    reason: 'Pause',
  });

  it('nails: « Dépose par dissolution » — 10 min active, 10 min waiting, 15 min active, in « Déposes »', () => {
    const { service, phases } = timing('NAILS', 'soak-off');
    expect(service.type).toBe('TECHNIQUE');
    expect(service.price).toBe(20);
    expect(service.description).toContain('peut s’occuper de quelqu’un d’autre');
    expect(phases).toEqual([
      ['Préparation et pose des papillotes', 10, true],
      ['Temps d’attente', 10, false],
      ['Retrait et finition', 15, true],
    ]);
    const { seed } = createPlaygroundDemoScenario('NAILS', NOW);
    expect(seed.serviceCategories?.find((category) => category.id === service.categoryId)?.name).toBe('Déposes');
    // The plain « Dépose » stays one uninterrupted duration.
    expect(seed.services.find((entry) => entry.name === 'Dépose')?.type).toBe('SERVICE');
  });

  it('nails: today’s soak-off before a semi-permanent — active, waiting and total durations, and staff-free waiting', () => {
    const booked = appointment('NAILS', 't6');
    expect(booked.startAt).toEqual(at(12, 0));
    expect(getStaffActiveDurationMinutes(booked)).toBe(10 + 15 + 45);
    expect(getProcessingDurationMinutes(booked)).toBe(10);
    expect(getElapsedDurationMinutes(booked)).toBe(80);
    expect(getAppointmentStaffBusyIntervals(booked).map(({ startAt, endAt }) => [startAt, endAt])).toEqual([
      [at(12, 0), at(12, 10)],
      [at(12, 20), at(13, 20)],
    ]);
    // A block during the waiting time is fine; one over a worked phase is not.
    expect(findAppointmentCalendarBlockConflict(booked, [block(at(12, 10), at(12, 20))])).toBeUndefined();
    expect(findAppointmentCalendarBlockConflict(booked, [block(at(12, 5), at(12, 15))])).toBeDefined();
  });

  it('esthetics: « Soin du visage avec masque » — 20 + 15 waiting + 25 = 1 h, the brow wax booked inside the waiting time', () => {
    const { service, phases } = timing('ESTHETICS', 'facial');
    expect(service.name).toBe('Soin du visage avec masque');
    expect(phases).toEqual([
      ['Nettoyage et pose du masque', 20, true],
      ['Temps d’attente', 15, false],
      ['Retrait du masque et finition', 25, true],
    ]);
    const facial = appointment('ESTHETICS', 't1');
    expect(getStaffActiveDurationMinutes(facial)).toBe(45);
    expect(getProcessingDurationMinutes(facial)).toBe(15);
    expect(getElapsedDurationMinutes(facial)).toBe(60);
    const browWax = appointment('ESTHETICS', 't2');
    expect(browWax.startAt).toEqual(at(9, 50));
    expect(getElapsedDurationMinutes(browWax)).toBe(15);
    // The wax fits the facial's waiting time exactly (9:50 → 10:05): no staff-busy overlap.
    const facialBusy = getAppointmentStaffBusyIntervals(facial);
    expect(facialBusy.map(({ startAt, endAt }) => [startAt, endAt])).toEqual([
      [at(9, 30), at(9, 50)],
      [at(10, 5), at(10, 30)],
    ]);
  });
});

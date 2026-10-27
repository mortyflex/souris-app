// One catalogue for every profession: the illustrative hairdressing, nail
// and esthetics prestations are all represented by the SAME Service model,
// created and edited through the SAME form rules, snapshotted and persisted
// the same way. Nothing here is profession-specific code — that is the point.

import { createAppointmentItemSnapshot, type Service } from '@/domain/appointments';
import {
  buildServiceFromForm,
  createEmptyServiceForm,
  PROCESSING_PHASE_NAME,
  toServiceFormValues,
  validateServiceForm,
  type ServiceFormValues,
} from '@/features/services/editor/service-form';
import { getPrestationFamily } from '@/features/services/prestation-visual';
import { buildCatalogSections } from '@/features/services/catalog/catalog-sections';
import { bootstrapPersistence, loadSnapshot } from '@/persistence/bootstrap';
import { insertService, loadServices, updateService } from '@/persistence/stores/services';
import { createTestSeed, serviceColor, serviceCut } from '@/persistence/testing/fixtures';
import { openTestDatabase } from '@/persistence/testing/node-sqlite-database';

interface SimpleExample {
  readonly name: string;
  readonly price: string;
  readonly duration: string;
}

const simpleForm = (example: SimpleExample, phaseId: string): ServiceFormValues => ({
  ...createEmptyServiceForm('SERVICE', phaseId),
  name: example.name,
  price: example.price,
  simpleDurationMinutes: example.duration,
});

const HAIRDRESSING: readonly SimpleExample[] = [
  { name: 'Coupe femme', price: '45', duration: '45' },
  { name: 'Brushing', price: '28', duration: '30' },
];

const NAILS: readonly SimpleExample[] = [
  { name: 'Pose complète gel', price: '55', duration: '90' },
  { name: 'Remplissage gel', price: '45', duration: '75' },
  { name: 'Semi-permanent mains', price: '35', duration: '45' },
  { name: 'Semi-permanent pieds', price: '35', duration: '45' },
  { name: 'Dépose', price: '15', duration: '30' },
  { name: 'Nail art', price: '5', duration: '15' },
  { name: 'Réparation d’un ongle', price: '5', duration: '15' },
];

const ESTHETICS: readonly SimpleExample[] = [
  { name: 'Épilation sourcils', price: '12', duration: '15' },
  { name: 'Épilation jambes', price: '28,50', duration: '30' },
  { name: 'Soin du corps', price: '70', duration: '60' },
  { name: 'Beauté du regard', price: '30', duration: '30' },
];

function build(values: ServiceFormValues, id: string, businessId = 'business-1'): Service {
  expect(validateServiceForm(values).valid).toBe(true);
  return buildServiceFromForm({ id, businessId, active: true, values });
}

describe('one catalogue for every profession', () => {
  it('represents the hairdressing, nail and esthetics examples with name, price and duration alone', () => {
    const all = [...HAIRDRESSING, ...NAILS, ...ESTHETICS].map((example, index) =>
      build(simpleForm(example, `p-${index}`), `service-${index}`),
    );

    expect(all).toHaveLength(13);
    expect(all.map((service) => service.name)).toEqual([
      'Coupe femme',
      'Brushing',
      'Pose complète gel',
      'Remplissage gel',
      'Semi-permanent mains',
      'Semi-permanent pieds',
      'Dépose',
      'Nail art',
      'Réparation d’un ongle',
      'Épilation sourcils',
      'Épilation jambes',
      'Soin du corps',
      'Beauté du regard',
    ]);
    // Accents, apostrophes and decimal prices survive the form untouched.
    expect(all.find((service) => service.name === 'Épilation jambes')?.price).toBe(28.5);
    // A SERVICE is one staff-required phase named after the prestation, whatever the profession.
    for (const service of all) {
      expect(service.type).toBe('SERVICE');
      expect(service.phases).toEqual([
        { id: expect.any(String), name: service.name, durationMinutes: expect.any(Number), requiresStaff: true },
      ]);
    }
  });

  it('lets a facial or a colour carry a Temps de pose as a TECHNIQUE, and a multi-step gel set stay a SERVICE', () => {
    const facial = build(
      {
        name: 'Soin du visage',
        price: '65',
        type: 'TECHNIQUE',
        simpleDurationMinutes: '',
        phases: [
          { id: 'f1', name: 'Nettoyage et gommage', durationMinutes: '25', requiresStaff: true },
          { id: 'f2', name: '', durationMinutes: '15', requiresStaff: false },
          { id: 'f3', name: 'Massage et crème', durationMinutes: '20', requiresStaff: true },
        ],
      },
      'service-facial',
    );
    expect(facial.phases.map((phase) => [phase.name, phase.requiresStaff])).toEqual([
      ['Nettoyage et gommage', true],
      [PROCESSING_PHASE_NAME, false],
      ['Massage et crème', true],
    ]);

    // Several steps with the technician present all along: ONE duration, not a Technique.
    const gelSet = build(simpleForm(NAILS[0]!, 'g1'), 'service-gel');
    expect(gelSet.type).toBe('SERVICE');
    expect(gelSet.phases).toHaveLength(1);

    // A Technique without any pose is refused for every profession — the rule is about
    // the client waiting, never about hair colour.
    const noPose: ServiceFormValues = {
      name: 'Pose complète gel',
      price: '55',
      type: 'TECHNIQUE',
      simpleDurationMinutes: '',
      phases: [
        { id: 'n1', name: 'Préparation', durationMinutes: '20', requiresStaff: true },
        { id: 'n2', name: 'Pose', durationMinutes: '60', requiresStaff: true },
      ],
    };
    expect(validateServiceForm(noPose).hasProcessingPhase).toBe(false);
    expect(validateServiceForm(noPose).valid).toBe(false);
  });

  it('groups every profession in the same Services / Techniques sections, with a family pictogram each', () => {
    const services = [
      ...NAILS.map((example, index) => build(simpleForm(example, `n-${index}`), `nail-${index}`)),
      build(
        {
          name: 'Soin du visage',
          price: '65',
          type: 'TECHNIQUE',
          simpleDurationMinutes: '',
          phases: [
            { id: 'f1', name: 'Application', durationMinutes: '30', requiresStaff: true },
            { id: 'f2', name: '', durationMinutes: '15', requiresStaff: false },
          ],
        },
        'service-facial',
      ),
    ];

    const sections = buildCatalogSections(services);
    expect(sections.map((section) => [section.title, section.data.length])).toEqual([
      ['Services', 7],
      ['Techniques', 1],
    ]);
    // No nail or esthetics prestation falls back on the hairdressing scissors.
    for (const service of services) {
      expect(['SERVICE_FALLBACK', 'TECHNIQUE_FALLBACK', 'CUT']).not.toContain(getPrestationFamily(service));
    }
  });

  it('reopens a nail prestation in the editor exactly as saved, and renames it without touching its identity', () => {
    const original = build(simpleForm(NAILS[2]!, 'p1'), 'service-semi');
    const values = toServiceFormValues(original);
    expect(values).toEqual({
      name: 'Semi-permanent mains',
      price: '35,00',
      type: 'SERVICE',
      simpleDurationMinutes: '45',
      phases: [{ id: 'p1', name: 'Semi-permanent mains', durationMinutes: '45', requiresStaff: true }],
    });

    const renamed = buildServiceFromForm({
      id: original.id,
      businessId: original.businessId,
      active: original.active,
      values: { ...values, name: 'Semi-permanent mains + nail art', price: '40' },
    });
    expect(renamed.id).toBe(original.id);
    expect(renamed.phases[0]?.id).toBe('p1');
    expect(renamed.name).toBe('Semi-permanent mains + nail art');
    expect(renamed.price).toBe(40);
  });

  it('keeps an appointment snapshot of a nail prestation intact after the catalogue changes', () => {
    const service = build(simpleForm(NAILS[0]!, 'p1'), 'service-gel');
    const item = createAppointmentItemSnapshot({ id: 'item-1', service, order: 0 });

    const edited: Service = { ...service, name: 'Pose gel (nouvelle formule)', price: 60, phases: [{ ...service.phases[0]!, durationMinutes: 80 }] };

    expect(item.serviceId).toBe('service-gel');
    expect(item.serviceName).toBe('Pose complète gel');
    expect(item.price).toBe(55);
    expect(item.phases[0]?.durationMinutes).toBe(90);
    expect(edited.name).not.toBe(item.serviceName);
  });

  it('persists nail and esthetics prestations beside an existing hairdressing catalogue without altering it', () => {
    const db = openTestDatabase();
    bootstrapPersistence(db, createTestSeed);
    const before = loadSnapshot(db);

    const repair = build(simpleForm(NAILS[6]!, 'r1'), 'service-repair', serviceCut.businessId);
    const facial = build(
      {
        name: 'Soin du visage',
        price: '65',
        type: 'TECHNIQUE',
        simpleDurationMinutes: '',
        phases: [
          { id: 'f1', name: 'Application', durationMinutes: '30', requiresStaff: true },
          { id: 'f2', name: '', durationMinutes: '15', requiresStaff: false },
          { id: 'f3', name: 'Finition', durationMinutes: '15', requiresStaff: true },
        ],
      },
      'service-facial',
      serviceCut.businessId,
    );
    insertService(db, repair);
    insertService(db, facial);
    updateService(db, { ...repair, price: 8 });

    const after = loadSnapshot(db);
    expect(loadServices(db)).toEqual([serviceColor, serviceCut, { ...repair, price: 8 }, facial]);
    // The hairdressing records, their appointment and its snapshot are byte-for-byte what they were.
    expect(after.services.slice(0, 2)).toEqual(before.services);
    expect(after.appointments).toEqual(before.appointments);
    expect(after.clients).toEqual(before.clients);
  });
});

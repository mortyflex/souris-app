import { BUSINESS_ACTIVITY_TYPES } from '@/domain/business';
import {
  getCataloguePresentation,
  getWaitingPhaseName,
} from '@/features/services/catalogue-presentation';
import { createServiceId, createServicePhaseId } from '@/features/services/editor/runtime-ids';
import {
  buildServiceFromForm,
  PROCESSING_PHASE_NAME,
  toServiceFormValues,
  validateServiceForm,
} from '@/features/services/editor/service-form';
import { isUuidV4 } from '@/shared/lib/uuid';

import {
  buildStarterCatalog,
  getStarterDurationMinutes,
  getStarterServices,
  STARTER_SERVICE_PRICE,
} from '../starter-services';

describe('starter services', () => {
  it('proposes a designed base for every profession, and nothing for « Autre »', () => {
    const names = (activity: (typeof BUSINESS_ACTIVITY_TYPES)[number]) =>
      getStarterServices(activity).map((starter) => starter.name);
    expect(names('HAIRDRESSING')).toEqual([
      'Coupe femme',
      'Brushing',
      'Coupe + brushing',
      'Coloration',
      'Balayage',
      'Patine',
      'Coupe homme',
      'Soin',
    ]);
    expect(names('NAILS')).toEqual([
      'Pose complète gel',
      'Remplissage gel',
      'Semi-permanent mains',
      'Semi-permanent pieds',
      'Dépose',
      'Nail art',
      'Réparation d’un ongle',
    ]);
    expect(names('ESTHETICS')).toEqual([
      'Soin du visage',
      'Épilation sourcils',
      'Épilation jambes',
      'Soin du corps',
      'Beauté du regard',
    ]);
    expect(names('LASHES_BROWS')).toEqual(['Rehaussement de cils', 'Teinture', 'Brow lift', 'Restructuration sourcils']);
    expect(names('MAKEUP')).toEqual(['Maquillage jour', 'Maquillage soirée', 'Maquillage mariée']);
    expect(names('BARBER')).toEqual(['Coupe', 'Taille de barbe', 'Coupe + barbe']);
    expect(names('WELLNESS')).toEqual(['Massage 30 min', 'Massage 60 min', 'Soin relaxant']);
    expect(names('OTHER')).toEqual([]);
  });

  it('respects the catalog rules: one staff phase per SERVICE, the profession’s waiting phase in every TECHNIQUE, positive integer minutes', () => {
    for (const activity of BUSINESS_ACTIVITY_TYPES) {
      const starters = getStarterServices(activity);
      expect(new Set(starters.map((starter) => starter.key)).size).toBe(starters.length);
      for (const starter of starters) {
        expect(starter.name.trim().length).toBeGreaterThan(0);
        for (const phase of starter.phases) {
          expect(Number.isInteger(phase.durationMinutes)).toBe(true);
          expect(phase.durationMinutes).toBeGreaterThan(0);
          expect(phase.name.trim().length).toBeGreaterThan(0);
        }
        if (starter.type === 'SERVICE') {
          expect(starter.phases).toHaveLength(1);
          expect(starter.phases[0]?.requiresStaff).toBe(true);
        } else {
          const processing = starter.phases.filter((phase) => !phase.requiresStaff);
          expect(processing.length).toBeGreaterThanOrEqual(1);
          // « Temps de pose »; « Temps d’attente » in the unified catalogue.
          const waitingPhaseName = getWaitingPhaseName(getCataloguePresentation(activity).organization);
          expect(processing.every((phase) => phase.name === waitingPhaseName)).toBe(true);
          expect(starter.phases.some((phase) => phase.requiresStaff)).toBe(true);
        }
        expect(getStarterDurationMinutes(starter)).toBe(
          starter.phases.reduce((total, phase) => total + phase.durationMinutes, 0),
        );
      }
    }
    // Only chemical / resting work is a Technique — a haircut never is.
    expect(getStarterServices('HAIRDRESSING').find((s) => s.name === 'Coloration')?.type).toBe('TECHNIQUE');
    expect(getStarterServices('HAIRDRESSING').find((s) => s.name === 'Coupe femme')?.type).toBe('SERVICE');
    // Nail work never leaves the client waiting; a facial does (the mask).
    expect(getStarterServices('NAILS').every((s) => s.type === 'SERVICE')).toBe(true);
    expect(getStarterServices('ESTHETICS').find((s) => s.name === 'Soin du visage')?.type).toBe('TECHNIQUE');
    expect(getStarterServices('ESTHETICS').filter((s) => s.type === 'TECHNIQUE')).toHaveLength(1);
  });

  it('keeps every preset short and coherent: no more than eight starters, 15 min to 2 h each', () => {
    for (const activity of BUSINESS_ACTIVITY_TYPES) {
      const starters = getStarterServices(activity);
      expect(starters.length).toBeLessThanOrEqual(8);
      expect(new Set(starters.map((starter) => starter.name)).size).toBe(starters.length);
      for (const starter of starters) {
        const total = getStarterDurationMinutes(starter);
        expect(total).toBeGreaterThanOrEqual(15);
        expect(total).toBeLessThanOrEqual(120);
        expect(total % 5).toBe(0);
      }
    }
  });

  it('builds nail and esthetics starters the Prestation editor can reopen and save unchanged', () => {
    let sequence = 0;
    const identity = {
      createServiceId: () => `service-${++sequence}`,
      createPhaseId: (serviceId: string) => `${serviceId}-phase-${++sequence}`,
    };
    const catalog = buildStarterCatalog('business-nails', [
      ...getStarterServices('NAILS'),
      ...getStarterServices('ESTHETICS'),
    ], identity);

    expect(catalog).toHaveLength(12);
    for (const service of catalog) {
      const values = toServiceFormValues(service);
      expect(validateServiceForm(values).valid).toBe(true);
      expect(
        buildServiceFromForm({ id: service.id, businessId: service.businessId, active: service.active, values }),
      ).toEqual(service);
    }
    const facial = catalog.find((service) => service.name === 'Soin du visage');
    expect(facial?.phases.map((phase) => [phase.name, phase.durationMinutes, phase.requiresStaff])).toEqual([
      ['Application', 30, true],
      ['Temps d’attente', 15, false],
      ['Finition', 15, true],
    ]);
  });

  it('builds active catalog Services at the neutral price with fresh identities', () => {
    let serviceSequence = 0;
    let phaseSequence = 0;
    const identity = {
      createServiceId: () => `service-${++serviceSequence}`,
      createPhaseId: (serviceId: string) => `${serviceId}-phase-${++phaseSequence}`,
    };
    const [color] = getStarterServices('HAIRDRESSING').filter((starter) => starter.key === 'color');
    const catalog = buildStarterCatalog('business-1', [color!], identity);

    expect(STARTER_SERVICE_PRICE).toBe(0);
    expect(catalog).toEqual([
      {
        id: 'service-1',
        businessId: 'business-1',
        name: 'Coloration',
        type: 'TECHNIQUE',
        price: 0,
        active: true,
        phases: [
          { id: 'service-1-phase-1', name: 'Application', durationMinutes: 30, requiresStaff: true },
          { id: 'service-1-phase-2', name: PROCESSING_PHASE_NAME, durationMinutes: 35, requiresStaff: false },
          { id: 'service-1-phase-3', name: 'Finition', durationMinutes: 30, requiresStaff: true },
        ],
      },
    ]);
  });

  it('never reuses an identity across two builds (the runtime ids are UUIDs)', () => {
    const identity = { createServiceId, createPhaseId: createServicePhaseId };
    const starters = getStarterServices('BARBER');
    const first = buildStarterCatalog('business-1', starters, identity);
    const second = buildStarterCatalog('business-1', starters, identity);
    const ids = [...first, ...second].map((service) => service.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isUuidV4)).toBe(true);
  });
});

import { BUSINESS_ACTIVITY_TYPES } from '@/domain/business';
import { createServiceId, createServicePhaseId } from '@/features/services/editor/runtime-ids';
import { PROCESSING_PHASE_NAME } from '@/features/services/editor/service-form';
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
    expect(names('NAILS')).toEqual(['Semi-permanent', 'Pose complète', 'Remplissage', 'Dépose', 'Nail art']);
    expect(names('ESTHETICS')).toEqual(['Soin visage', 'Épilation sourcils', 'Épilation jambes', 'Soin corps']);
    expect(names('LASHES_BROWS')).toEqual(['Rehaussement de cils', 'Teinture', 'Brow lift', 'Restructuration sourcils']);
    expect(names('MAKEUP')).toEqual(['Maquillage jour', 'Maquillage soirée', 'Maquillage mariée']);
    expect(names('BARBER')).toEqual(['Coupe', 'Taille de barbe', 'Coupe + barbe']);
    expect(names('WELLNESS')).toEqual(['Massage 30 min', 'Massage 60 min', 'Soin relaxant']);
    expect(names('OTHER')).toEqual([]);
  });

  it('respects the catalog rules: one staff phase per SERVICE, a « Temps de pose » in every TECHNIQUE, positive integer minutes', () => {
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
          expect(processing.every((phase) => phase.name === PROCESSING_PHASE_NAME)).toBe(true);
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
    expect(getStarterServices('NAILS').every((s) => s.type === 'SERVICE')).toBe(true);
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

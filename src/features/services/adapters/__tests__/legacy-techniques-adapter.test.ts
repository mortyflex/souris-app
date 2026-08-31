import {
  createAppointmentItemSnapshot,
  getElapsedDurationMinutes,
  getProcessingDurationMinutes,
  getStaffActiveDurationMinutes,
  type Appointment,
} from '@/domain/appointments';

import {
  generateTechniqueId,
  normalizeLegacyTechnique,
  normalizeLegacyTechniques,
} from '../legacy-techniques-adapter';

const businessId = 'business-test';
const legacyTechnique = Object.freeze({
  name: 'Balayage 1',
  duration: 90,
  break: 60,
  price: 45,
  color: '#3b82f6',
});

describe('legacy TECHNIQUE adapter', () => {
  it('maps active work and processing in source order with deterministic ids', () => {
    const result = normalizeLegacyTechnique(legacyTechnique, 'Balayage', businessId);

    expect(result).toEqual({
      id: 'technique-balayage-balayage-1',
      businessId,
      name: 'Balayage 1',
      type: 'TECHNIQUE',
      price: 45,
      phases: [
        {
          id: 'technique-balayage-balayage-1-active',
          name: 'Balayage 1',
          durationMinutes: 90,
          requiresStaff: true,
        },
        {
          id: 'technique-balayage-balayage-1-processing',
          name: 'Temps de pose',
          durationMinutes: 60,
          requiresStaff: false,
        },
      ],
      active: true,
    });
  });

  it('keeps a TECHNIQUE without processing valid and does not invent a phase', () => {
    const result = normalizeLegacyTechnique(
      {
        name: 'Coupe Brushing 1',
        duration: 50,
        break: 0,
        price: 40,
        color: '#f59e0b',
      },
      'Coupe',
      businessId,
    );

    expect(result?.type).toBe('TECHNIQUE');
    expect(result?.phases).toHaveLength(1);
    expect(result?.phases[0].requiresStaff).toBe(true);
  });

  it('is deterministic, preserves input, and discards aggregate/color fields', () => {
    const before = JSON.stringify(legacyTechnique);
    const first = normalizeLegacyTechnique(legacyTechnique, 'Balayage', businessId);
    const second = normalizeLegacyTechnique(legacyTechnique, 'Balayage', businessId);

    expect(first).toEqual(second);
    expect(JSON.stringify(legacyTechnique)).toBe(before);
    expect(first).not.toHaveProperty('duration');
    expect(first).not.toHaveProperty('break');
    expect(first).not.toHaveProperty('color');
  });

  it('excludes the real Multiprix shape without inventing a zero price', () => {
    const result = normalizeLegacyTechniques(
      [
        {
          category: 'Coloration',
          techniques: [
            {
              name: 'Gloss',
              duration: 10,
              break: 10,
              price: 'Multiprix',
              color: '#10b981',
            },
          ],
        },
      ],
      businessId,
    );

    expect(result.techniques).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ name: 'Gloss', reason: 'Non-numeric price: Multiprix' }),
    ]);
  });

  it('feeds existing snapshot and timeline helpers without semantic loss', () => {
    const service = normalizeLegacyTechnique(legacyTechnique, 'Balayage', businessId);
    expect(service).not.toBeNull();
    if (!service) return;

    const item = createAppointmentItemSnapshot({
      id: 'item-1',
      order: 0,
      service,
    });
    const appointment: Appointment = {
      id: 'appointment-1',
      businessId,
      clientId: 'client-1',
      staffMemberId: 'staff-1',
      startAt: new Date(2026, 7, 31, 9),
      status: 'SCHEDULED',
      items: [item],
    };

    expect(getStaffActiveDurationMinutes(appointment)).toBe(90);
    expect(getProcessingDurationMinutes(appointment)).toBe(60);
    expect(getElapsedDurationMinutes(appointment)).toBe(150);
  });

  it('derives the same technique identity from the same source values', () => {
    expect(generateTechniqueId('Balayage', 'Balayage 1')).toBe(
      'technique-balayage-balayage-1',
    );
  });
});

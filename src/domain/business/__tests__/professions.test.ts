import {
  BUSINESS_ACTIVITY_TYPES,
  getProfessionAvailability,
  isBusinessActivityType,
  isProfessionAvailable,
  isProfessionId,
  PROFESSIONS,
  toBusinessActivityType,
} from '..';

describe('professions', () => {
  it('reuses the stored activity vocabulary: every profession id is an existing BusinessActivityType', () => {
    for (const profession of PROFESSIONS) {
      expect(isBusinessActivityType(profession.id)).toBe(true);
    }
    expect(PROFESSIONS.map((profession) => profession.id)).toEqual(['HAIRDRESSING', 'NAILS', 'ESTHETICS', 'WELLNESS']);
  });

  it('opens hairdressing and the three pilot professions to a new Business', () => {
    for (const activityType of ['HAIRDRESSING', 'NAILS', 'ESTHETICS', 'WELLNESS'] as const) {
      expect(getProfessionAvailability(activityType)).toBe('AVAILABLE');
      expect(isProfessionAvailable(activityType)).toBe(true);
    }
    expect(PROFESSIONS.filter((profession) => profession.availability === 'AVAILABLE').map((p) => p.id)).toEqual([
      'HAIRDRESSING',
      'NAILS',
      'ESTHETICS',
      'WELLNESS',
    ]);
  });

  it('keeps every historical identifier valid as stored data while offering none of the others to a new Business', () => {
    const others = BUSINESS_ACTIVITY_TYPES.filter((activityType) => !isProfessionId(activityType));
    expect(others).toEqual(['BARBER', 'LASHES_BROWS', 'MAKEUP', 'OTHER']);
    for (const activityType of others) {
      // Still decoded as itself: an existing Business keeps its stored value and label.
      expect(toBusinessActivityType(activityType)).toBe(activityType);
      expect(getProfessionAvailability(activityType)).toBeUndefined();
      expect(isProfessionAvailable(activityType)).toBe(false);
    }
  });

  it('reads an unknown stored value as OTHER, which a new Business can never choose', () => {
    expect(toBusinessActivityType('PHYSIOTHERAPY')).toBe('OTHER');
    expect(isProfessionAvailable(toBusinessActivityType('PHYSIOTHERAPY'))).toBe(false);
  });
});

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
    expect(PROFESSIONS.map((profession) => profession.id)).toEqual(['HAIRDRESSING', 'NAILS', 'ESTHETICS']);
  });

  it('makes hairdressing available and announces nail services and esthetics', () => {
    expect(getProfessionAvailability('HAIRDRESSING')).toBe('AVAILABLE');
    expect(getProfessionAvailability('NAILS')).toBe('COMING_SOON');
    expect(getProfessionAvailability('ESTHETICS')).toBe('COMING_SOON');
    expect(isProfessionAvailable('HAIRDRESSING')).toBe(true);
    expect(isProfessionAvailable('NAILS')).toBe(false);
    expect(isProfessionAvailable('ESTHETICS')).toBe(false);
  });

  it('keeps every historical identifier valid as stored data while offering none of the others to a new Business', () => {
    const others = BUSINESS_ACTIVITY_TYPES.filter((activityType) => !isProfessionId(activityType));
    expect(others).toEqual(['BARBER', 'LASHES_BROWS', 'MAKEUP', 'WELLNESS', 'OTHER']);
    for (const activityType of others) {
      // Still decoded as itself: an existing Business keeps its stored value and label.
      expect(toBusinessActivityType(activityType)).toBe(activityType);
      expect(getProfessionAvailability(activityType)).toBeUndefined();
      expect(isProfessionAvailable(activityType)).toBe(false);
    }
  });

  it('exposes exactly one AVAILABLE profession today', () => {
    expect(PROFESSIONS.filter((profession) => profession.availability === 'AVAILABLE').map((p) => p.id)).toEqual([
      'HAIRDRESSING',
    ]);
  });
});

import { BUSINESS_ACTIVITY_TYPES, isBusinessActivityType, toBusinessActivityType } from '../types';

describe('BusinessActivityType', () => {
  it('exposes the stable vocabulary: the six V1 values plus MAKEUP and WELLNESS', () => {
    expect(BUSINESS_ACTIVITY_TYPES).toEqual([
      'HAIRDRESSING',
      'BARBER',
      'NAILS',
      'ESTHETICS',
      'LASHES_BROWS',
      'MAKEUP',
      'WELLNESS',
      'OTHER',
    ]);
  });

  it('validates stored values without accepting presentation labels', () => {
    expect(isBusinessActivityType('NAILS')).toBe(true);
    expect(isBusinessActivityType('MAKEUP')).toBe(true);
    expect(isBusinessActivityType('WELLNESS')).toBe(true);
    expect(isBusinessActivityType('Coiffure')).toBe(false);
    expect(isBusinessActivityType('hairdressing')).toBe(false);
    expect(isBusinessActivityType(undefined)).toBe(false);
    expect(isBusinessActivityType(3)).toBe(false);
  });

  it('decodes every known value as itself and anything else as OTHER', () => {
    for (const activityType of BUSINESS_ACTIVITY_TYPES) {
      expect(toBusinessActivityType(activityType)).toBe(activityType);
    }
    // A value a future build may store: never a crash, never a guess.
    expect(toBusinessActivityType('TATTOO')).toBe('OTHER');
    expect(toBusinessActivityType('')).toBe('OTHER');
    expect(toBusinessActivityType(null)).toBe('OTHER');
    expect(toBusinessActivityType(undefined)).toBe('OTHER');
  });
});

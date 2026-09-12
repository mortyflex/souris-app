import { BUSINESS_ACTIVITY_TYPES, isBusinessActivityType } from '../types';

describe('BusinessActivityType', () => {
  it('exposes the stable V1 vocabulary', () => {
    expect(BUSINESS_ACTIVITY_TYPES).toEqual([
      'HAIRDRESSING',
      'BARBER',
      'NAILS',
      'ESTHETICS',
      'LASHES_BROWS',
      'OTHER',
    ]);
  });

  it('validates stored values without accepting presentation labels', () => {
    expect(isBusinessActivityType('NAILS')).toBe(true);
    expect(isBusinessActivityType('Coiffure')).toBe(false);
    expect(isBusinessActivityType('hairdressing')).toBe(false);
    expect(isBusinessActivityType(undefined)).toBe(false);
    expect(isBusinessActivityType(3)).toBe(false);
  });
});

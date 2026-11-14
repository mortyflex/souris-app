import { isValidBookingSlug, normalizeBookingSlugInput, suggestBookingSlug } from '../slug';

describe('booking slug', () => {
  it.each(['abc', 'salon-amelie', 'chez-amelie-75011', 'a1b', 'a'.repeat(60)])('accepts %s', (slug) => {
    expect(isValidBookingSlug(slug)).toBe(true);
  });

  it.each([
    '',
    'ab',
    'a'.repeat(61),
    'Salon',
    'salon_amelie',
    'salon--amelie',
    '-salon',
    'salon-',
    'salon amelie',
    'sâlon',
    'salon/amelie',
  ])('refuses %j', (slug) => {
    expect(isValidBookingSlug(slug)).toBe(false);
  });

  it('normalizes what is typed: accents, case, separators', () => {
    expect(normalizeBookingSlugInput('Chez Amélie')).toBe('chez-amelie');
    expect(normalizeBookingSlugInput('  L’Atelier  &  Co ')).toBe('l-atelier-co-');
    expect(normalizeBookingSlugInput('--salon')).toBe('salon');
    expect(normalizeBookingSlugInput('ÉLÉGANCE_coiffure')).toBe('elegance-coiffure');
  });

  it('keeps a trailing hyphen while typing, and never exceeds the maximum', () => {
    expect(normalizeBookingSlugInput('salon-')).toBe('salon-');
    expect(normalizeBookingSlugInput('a'.repeat(80))).toHaveLength(60);
  });

  it('suggests a complete address from a name', () => {
    expect(suggestBookingSlug('Chez Amélie !')).toBe('chez-amelie');
    expect(isValidBookingSlug(suggestBookingSlug('Salon de Léa — Paris 11'))).toBe(true);
    expect(suggestBookingSlug('💇')).toBe('');
  });
});

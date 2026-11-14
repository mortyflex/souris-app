import { findBookingProfileIssue, type BookingProfileFields } from '../profile';

const empty: BookingProfileFields = {
  slug: '',
  publicName: '',
  description: '',
  publicPhone: '',
  publicEmail: '',
  address: '',
};

describe('booking profile draft', () => {
  it('accepts an entirely empty draft: every field is optional', () => {
    expect(findBookingProfileIssue(empty)).toBeUndefined();
  });

  it('accepts a complete draft', () => {
    expect(
      findBookingProfileIssue({
        slug: 'chez-amelie',
        publicName: 'Chez Amélie',
        description: 'Coiffure sur rendez-vous.\nDu mardi au samedi.',
        publicPhone: '06 00 00 00 00',
        publicEmail: 'salon@example.test',
        address: '1 rue de la Paix, 75002 Paris',
      }),
    ).toBeUndefined();
  });

  it.each([
    ['slug', { slug: 'Chez Amélie' }],
    ['slug', { slug: 'ab' }],
    ['publicName', { publicName: 'x'.repeat(121) }],
    ['description', { description: 'x'.repeat(1001) }],
    ['publicPhone', { publicPhone: '1'.repeat(41) }],
    ['publicEmail', { publicEmail: 'salon@' }],
    ['address', { address: 'x'.repeat(201) }],
  ] as const)('names the refused field: %s', (field, change) => {
    expect(findBookingProfileIssue({ ...empty, ...change })).toBe(field);
  });

  it('measures trimmed values, like the server', () => {
    expect(findBookingProfileIssue({ ...empty, publicName: ` ${'x'.repeat(120)} ` })).toBeUndefined();
  });
});

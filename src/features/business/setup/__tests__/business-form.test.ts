import { buildBusinessSetupInput, EMPTY_BUSINESS_FORM, isValidBusinessForm, validateBusinessForm } from '../business-form';

describe('business form', () => {
  it('requires first name, activity name, and activity type', () => {
    expect(validateBusinessForm(EMPTY_BUSINESS_FORM)).toEqual({
      ownerFirstName: 'Votre prénom est requis.',
      name: 'Le nom de votre activité est requis.',
      activityType: 'Choisissez votre activité.',
    });
    expect(isValidBusinessForm({ ...EMPTY_BUSINESS_FORM, ownerFirstName: ' Léa ', name: 'Maison Léa', activityType: 'NAILS' })).toBe(true);
  });

  it('trims values and drops empty optionals', () => {
    expect(
      buildBusinessSetupInput({
        ownerFirstName: ' Léa ',
        ownerLastName: '  ',
        name: ' Maison Léa ',
        activityType: 'HAIRDRESSING',
        phone: ' 06 12 34 56 78 ',
      }),
    ).toEqual({ ownerFirstName: 'Léa', name: 'Maison Léa', activityType: 'HAIRDRESSING', phone: '06 12 34 56 78' });
    expect(() => buildBusinessSetupInput(EMPTY_BUSINESS_FORM)).toThrow();
  });
});

import {
  ACTIVITY_UNAVAILABLE_ERROR,
  buildBusinessSetupInput,
  EMPTY_BUSINESS_FORM,
  isActivityAccepted,
  isValidBusinessForm,
  validateBusinessForm,
} from '../business-form';

describe('business form', () => {
  it('requires first name, activity name, and activity type', () => {
    expect(validateBusinessForm(EMPTY_BUSINESS_FORM)).toEqual({
      ownerFirstName: 'Votre prénom est requis.',
      name: 'Le nom de votre activité est requis.',
      activityType: 'Choisissez votre activité.',
    });
    expect(isValidBusinessForm({ ...EMPTY_BUSINESS_FORM, ownerFirstName: ' Léa ', name: 'Maison Léa', activityType: 'HAIRDRESSING' })).toBe(true);
  });

  it('refuses a « Bientôt disponible » profession and any activity onboarding no longer offers', () => {
    const draft = { ...EMPTY_BUSINESS_FORM, ownerFirstName: 'Sofia', name: 'Nails by Sofia' };
    for (const activityType of ['NAILS', 'ESTHETICS', 'BARBER', 'LASHES_BROWS', 'MAKEUP', 'WELLNESS', 'OTHER'] as const) {
      const values = { ...draft, activityType };
      expect(validateBusinessForm(values)).toEqual({ activityType: ACTIVITY_UNAVAILABLE_ERROR });
      expect(isValidBusinessForm(values)).toBe(false);
      // The gateway input can never carry it, whatever path proposed it.
      expect(() => buildBusinessSetupInput(values)).toThrow(/not available/);
    }
    expect(ACTIVITY_UNAVAILABLE_ERROR).toBe('Cette activité n’est pas encore disponible.');
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

describe('business form — activity acceptance', () => {
  const draft = { ...EMPTY_BUSINESS_FORM, ownerFirstName: 'Sofia', name: 'Nails by Sofia' };

  it('defaults to the product rule: the available professions only', () => {
    expect(isActivityAccepted('HAIRDRESSING')).toBe(true);
    expect(isActivityAccepted('NAILS')).toBe(false);
    expect(isActivityAccepted('HAIRDRESSING', 'available-professions')).toBe(true);
    expect(isValidBusinessForm({ ...draft, activityType: 'NAILS' })).toBe(false);
    expect(() => buildBusinessSetupInput({ ...draft, activityType: 'NAILS' })).toThrow(/not available/);
  });

  it('accepts every profession of PROFESSIONS for a preview, and still nothing onboarding never offers', () => {
    for (const activityType of ['HAIRDRESSING', 'NAILS', 'ESTHETICS'] as const) {
      const values = { ...draft, activityType };
      expect(isActivityAccepted(activityType, 'every-profession')).toBe(true);
      expect(validateBusinessForm(values, 'every-profession')).toEqual({});
      expect(isValidBusinessForm(values, 'every-profession')).toBe(true);
      expect(buildBusinessSetupInput(values, 'every-profession').activityType).toBe(activityType);
      // The product rule is untouched by the preview acceptance.
      if (activityType !== 'HAIRDRESSING') expect(isValidBusinessForm(values)).toBe(false);
    }
    for (const activityType of ['BARBER', 'LASHES_BROWS', 'MAKEUP', 'WELLNESS', 'OTHER'] as const) {
      const values = { ...draft, activityType };
      expect(isActivityAccepted(activityType, 'every-profession')).toBe(false);
      expect(validateBusinessForm(values, 'every-profession')).toEqual({ activityType: ACTIVITY_UNAVAILABLE_ERROR });
      expect(() => buildBusinessSetupInput(values, 'every-profession')).toThrow(/not available/);
    }
  });
});

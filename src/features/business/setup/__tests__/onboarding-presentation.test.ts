import { BUSINESS_ACTIVITY_TYPES, PROFESSIONS } from '@/domain/business';

import { ACTIVITY_OPTIONS, COMING_SOON_LABEL, getActivityIcon } from '../activity-options';
import { resolveIllustrationSide } from '@/shared/ui/OnboardingStepLayout';
import { buildSetupRecapRows } from '../components/SetupRecap';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

describe('activity options', () => {
  it('lists the three professions once, in product order, with their French labels and availability', () => {
    expect(ACTIVITY_OPTIONS.map((option) => [option.type, option.label, option.availability])).toEqual([
      ['HAIRDRESSING', 'Coiffure', 'AVAILABLE'],
      ['NAILS', 'Onglerie', 'COMING_SOON'],
      ['ESTHETICS', 'Esthétique', 'COMING_SOON'],
    ]);
    expect(ACTIVITY_OPTIONS.map((option) => option.type)).toEqual(PROFESSIONS.map((profession) => profession.id));
    expect(COMING_SOON_LABEL).toBe('Bientôt disponible');
  });

  it('gives every profession a short, distinct description', () => {
    const descriptions = ACTIVITY_OPTIONS.map((option) => option.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const description of descriptions) {
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(60);
    }
  });

  it('keeps a pictogram for EVERY stored activity, so an existing Business is always recalled with one', () => {
    for (const activityType of BUSINESS_ACTIVITY_TYPES) {
      expect(getActivityIcon(activityType)).toEqual(
        expect.objectContaining({ ios: expect.any(String), android: expect.any(String) }),
      );
    }
  });
});

describe('setup recap', () => {
  it('reads what was actually chosen', () => {
    expect(
      buildSetupRecapRows({ activityType: 'HAIRDRESSING', remindersEnabled: true, starterServiceCount: 6 }).map(
        (row) => [row.value, row.label],
      ),
    ).toEqual([
      ['Coiffure', 'Votre activité principale'],
      ['Rappels activés', 'Rappels par e-mail'],
      ['6 prestations prêtes', 'Prestations & tarifs'],
    ]);
    const deferred = buildSetupRecapRows({ activityType: 'OTHER', remindersEnabled: false, starterServiceCount: 0 });
    expect(deferred.map((row) => row.value)).toEqual(['Autre', 'À configurer plus tard', 'Prestations à ajouter plus tard']);
    expect(buildSetupRecapRows({ activityType: 'NAILS', remindersEnabled: false, starterServiceCount: 1 })[2]?.value).toBe(
      '1 prestation prête',
    );
  });
});

describe('illustration sizing', () => {
  it('gives the hero about 40 % of a current iPhone, less on an SE, and caps it on a Pro Max', () => {
    expect(resolveIllustrationSide(852, 'hero')).toBe(340); // iPhone 17: 0.4 × 852, capped at 340
    expect(resolveIllustrationSide(667, 'hero')).toBe(200); // iPhone SE: 0.3 × 667
    expect(resolveIllustrationSide(956, 'hero')).toBe(340); // Pro Max: never larger
  });

  it('keeps the step illustration compact everywhere', () => {
    expect(resolveIllustrationSide(852, 'compact')).toBe(187);
    expect(resolveIllustrationSide(667, 'compact')).toBe(113);
    expect(resolveIllustrationSide(956, 'compact')).toBe(200);
  });
});

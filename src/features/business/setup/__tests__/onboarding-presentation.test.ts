import { BUSINESS_ACTIVITY_TYPES } from '@/domain/business';

import { ACTIVITY_OPTIONS } from '../activity-options';
import { resolveIllustrationSide } from '@/shared/ui/OnboardingStepLayout';
import { buildSetupRecapRows } from '../components/SetupRecap';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/features/clients/birthday/testing/mock-reanimated'),
);

describe('activity options', () => {
  it('lists the eight activities once, in the grid order, with their French labels', () => {
    expect(ACTIVITY_OPTIONS.map((option) => option.label)).toEqual([
      'Coiffure',
      'Onglerie',
      'Esthétique',
      'Cils & sourcils',
      'Maquillage',
      'Barbier',
      'Bien-être',
      'Autre',
    ]);
    expect([...ACTIVITY_OPTIONS.map((option) => option.type)].sort()).toEqual([...BUSINESS_ACTIVITY_TYPES].sort());
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

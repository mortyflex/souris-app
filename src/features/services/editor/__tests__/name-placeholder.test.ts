import { BUSINESS_ACTIVITY_TYPES } from '@/domain/business';

import { getServiceNamePlaceholder } from '../name-placeholder';

describe('getServiceNamePlaceholder', () => {
  it('suggests an example of the profession, never « Coupe » to a nail technician', () => {
    expect(getServiceNamePlaceholder('HAIRDRESSING')).toBe('Ex. Coupe');
    expect(getServiceNamePlaceholder('NAILS')).toBe('Ex. Pose complète gel');
    expect(getServiceNamePlaceholder('ESTHETICS')).toBe('Ex. Soin du visage');
  });

  it('has a short example for EVERY stored activity, including the ones onboarding no longer offers', () => {
    for (const activity of BUSINESS_ACTIVITY_TYPES) {
      expect(getServiceNamePlaceholder(activity)).toMatch(/^Ex\. \S.{2,30}$/);
    }
  });
});

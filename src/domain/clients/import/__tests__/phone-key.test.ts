// BeautIzzy — client import phone comparison keys (fictional numbers)

import { normalizeCommunicationPhoneE164 } from '@/domain/communications/phone';

import { clientImportPhoneKey, isRecognizedClientImportPhone } from '../phone-key';

describe('clientImportPhoneKey', () => {
  it.each([
    '06 12 34 56 78',
    '06.12.34.56.78',
    '06-12-34-56-78',
    '0612345678',
    '+33 6 12 34 56 78',
    '+33 (0)6 12 34 56 78',
    '+33 06 12 34 56 78',
    '+33612345678',
    '33612345678',
    '33 6 12 34 56 78',
    '0033 6 12 34 56 78',
  ])('maps %s to the same canonical key', (phone) => {
    expect(clientImportPhoneKey(phone)).toEqual({ canonical: '+33612345678', lastNine: '612345678' });
  });

  it('keeps other international numbers canonical', () => {
    expect(clientImportPhoneKey('+44 20 7946 0958')).toEqual({
      canonical: '+442079460958',
      lastNine: '079460958',
    });
  });

  it('gives only the last nine digits to an unrecognized number', () => {
    expect(clientImportPhoneKey('612 345 678')).toEqual({ lastNine: '612345678' });
    expect(isRecognizedClientImportPhone('612 345 678')).toBe(false);
  });

  it('gives nothing to a blank or very short value', () => {
    expect(clientImportPhoneKey(undefined)).toEqual({});
    expect(clientImportPhoneKey('   ')).toEqual({});
    expect(clientImportPhoneKey('12 34')).toEqual({});
  });

  it('leaves the communications rule untouched (the trunk marker is an import-only cleanup)', () => {
    expect(normalizeCommunicationPhoneE164('+33 (0)6 12 34 56 78')).toBe('+330612345678');
    expect(normalizeCommunicationPhoneE164('33612345678')).toBeUndefined();
  });
});

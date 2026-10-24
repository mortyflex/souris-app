import { MAX_DISCOUNT_PERCENT, getAppointmentServicesTotal } from '@/domain/appointments';

import {
  DISCOUNT_ENTRY_MAX_LENGTH,
  DISCOUNT_ENTRY_MESSAGES,
  deriveDiscountEntryState,
  formatDiscountEntryText,
  isDiscountPreset,
} from '../discount-entry';
import { FIXED_DISCOUNT_PRESETS, PERCENT_DISCOUNT_PRESETS } from '../discount-presets';

const none = { discount: undefined, error: undefined };
const fixed = (amountCents: number) => ({ discount: { type: 'FIXED', amountCents }, error: undefined });
const percent = (value: number) => ({ discount: { type: 'PERCENT', percent: value }, error: undefined });
const refused = (error: string) => ({ discount: undefined, error });

describe('discount entry — € mode', () => {
  it('an empty or blank entry is no entry and no error', () => {
    expect(deriveDiscountEntryState('FIXED', '')).toEqual(none);
    expect(deriveDiscountEntryState('FIXED', '   ')).toEqual(none);
  });

  it.each([
    ['3', 300],
    ['7,50', 750],
    ['7.50', 750],
    ['12,90', 1290],
    ['12.90', 1290],
    ['7,5', 750],
    ['0,99', 99],
    [' 15 ', 1500],
    ['1234,56', 123456],
  ])('reads « %s » as %i exact cents, comma or dot alike', (text, amountCents) => {
    expect(deriveDiscountEntryState('FIXED', text)).toEqual(fixed(amountCents));
  });

  it('keeps a trailing separator readable while typing', () => {
    expect(deriveDiscountEntryState('FIXED', '7,')).toEqual(fixed(700));
    expect(deriveDiscountEntryState('FIXED', '7.')).toEqual(fixed(700));
  });

  it('never goes through floating point: 0,1 + 0,2 style amounts stay exact', () => {
    expect(deriveDiscountEntryState('FIXED', '0,10').discount).toEqual({ type: 'FIXED', amountCents: 10 });
    expect(deriveDiscountEntryState('FIXED', '0,20').discount).toEqual({ type: 'FIXED', amountCents: 20 });
    expect(deriveDiscountEntryState('FIXED', '19,99').discount).toEqual({ type: 'FIXED', amountCents: 1999 });
  });

  it.each(['-5', '5-', 'abc', '5 €', '7,,5', '7,505', '1e3', '.', ','])(
    'refuses « %s » as an unreadable amount',
    (text) => {
      expect(deriveDiscountEntryState('FIXED', text)).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.invalidAmount));
    },
  );

  it('refuses zero: a 0 € discount is not a discount', () => {
    expect(deriveDiscountEntryState('FIXED', '0')).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.zeroAmount));
    expect(deriveDiscountEntryState('FIXED', '0,00')).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.zeroAmount));
  });

  it('refuses an amount beyond the safe integer range instead of storing a corrupt value', () => {
    expect(deriveDiscountEntryState('FIXED', '99999999999999999999')).toEqual(
      refused(DISCOUNT_ENTRY_MESSAGES.invalidAmount),
    );
  });

  it('accepts an amount above the services total: the domain clamps what is applied, the net never goes negative', () => {
    const { discount } = deriveDiscountEntryState('FIXED', '50');
    expect(getAppointmentServicesTotal({ items: [{ price: 30 }], discount })).toEqual({
      grossCents: 3000,
      discountCents: 3000,
      netCents: 0,
    });
  });
});

describe('discount entry — % mode', () => {
  it('an empty or blank entry is no entry and no error', () => {
    expect(deriveDiscountEntryState('PERCENT', '')).toEqual(none);
    expect(deriveDiscountEntryState('PERCENT', ' ')).toEqual(none);
  });

  it.each([
    ['5', 5],
    ['10', 10],
    ['15', 15],
    ['7', 7],
    ['33', 33],
    ['1', 1],
    [`${MAX_DISCOUNT_PERCENT}`, MAX_DISCOUNT_PERCENT],
    [' 12 ', 12],
    ['12,', 12],
    ['12,0', 12],
    ['12.00', 12],
  ])('reads « %s » as a whole %i %%', (text, value) => {
    expect(deriveDiscountEntryState('PERCENT', text)).toEqual(percent(value));
  });

  it('refuses a fractional percentage: the domain stores whole percents only', () => {
    expect(deriveDiscountEntryState('PERCENT', '7,5')).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.fractionalPercent));
    expect(deriveDiscountEntryState('PERCENT', '12.25')).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.fractionalPercent));
  });

  it('refuses 0 %', () => {
    expect(deriveDiscountEntryState('PERCENT', '0')).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.zeroPercent));
    expect(deriveDiscountEntryState('PERCENT', '00')).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.zeroPercent));
  });

  it(`refuses anything above the ONE bound of ${MAX_DISCOUNT_PERCENT} %, 100 % included`, () => {
    expect(deriveDiscountEntryState('PERCENT', `${MAX_DISCOUNT_PERCENT + 1}`)).toEqual(
      refused(DISCOUNT_ENTRY_MESSAGES.percentAboveMaximum),
    );
    expect(deriveDiscountEntryState('PERCENT', '100')).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.percentAboveMaximum));
    expect(deriveDiscountEntryState('PERCENT', '150')).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.percentAboveMaximum));
    expect(DISCOUNT_ENTRY_MESSAGES.percentAboveMaximum).toBe('Le pourcentage ne peut pas dépasser 50 %.');
  });

  it.each(['-5', 'abc', '10 %', '1e1', ',', '.'])('refuses « %s » as an unreadable percentage', (text) => {
    expect(deriveDiscountEntryState('PERCENT', text)).toEqual(refused(DISCOUNT_ENTRY_MESSAGES.invalidPercent));
  });

  it('caps the entry length to what a valid value can need', () => {
    expect(DISCOUNT_ENTRY_MAX_LENGTH).toEqual({ FIXED: 9, PERCENT: 3 });
  });
});

describe('discount entry — presets vs. custom values', () => {
  it('recognises every preset of its own mode and nothing else', () => {
    for (const preset of [...PERCENT_DISCOUNT_PRESETS, ...FIXED_DISCOUNT_PRESETS]) {
      expect(isDiscountPreset(preset)).toBe(true);
    }
    expect(isDiscountPreset({ type: 'PERCENT', percent: 7 })).toBe(false);
    expect(isDiscountPreset({ type: 'FIXED', amountCents: 750 })).toBe(false);
    // 20 € is a preset; 20 % is a preset; 2000 % and 20 c are not.
    expect(isDiscountPreset({ type: 'FIXED', amountCents: 20 })).toBe(false);
  });

  it('gives the free entry the text of a custom value of its mode, in the French input form', () => {
    expect(formatDiscountEntryText({ type: 'FIXED', amountCents: 750 }, 'FIXED')).toBe('7,50');
    expect(formatDiscountEntryText({ type: 'FIXED', amountCents: 1290 }, 'FIXED')).toBe('12,90');
    expect(formatDiscountEntryText({ type: 'FIXED', amountCents: 300 }, 'FIXED')).toBe('3,00');
    expect(formatDiscountEntryText({ type: 'PERCENT', percent: 7 }, 'PERCENT')).toBe('7');
  });

  it('leaves the entry empty for a preset, for no discount and for a value of the other mode', () => {
    expect(formatDiscountEntryText({ type: 'FIXED', amountCents: 1500 }, 'FIXED')).toBe('');
    expect(formatDiscountEntryText({ type: 'PERCENT', percent: 20 }, 'PERCENT')).toBe('');
    expect(formatDiscountEntryText(undefined, 'FIXED')).toBe('');
    expect(formatDiscountEntryText({ type: 'FIXED', amountCents: 750 }, 'PERCENT')).toBe('');
    expect(formatDiscountEntryText({ type: 'PERCENT', percent: 7 }, 'FIXED')).toBe('');
  });

  it('round-trips a custom value: text → discount → text', () => {
    for (const text of ['7,50', '12,90', '3,00']) {
      const { discount } = deriveDiscountEntryState('FIXED', text);
      expect(formatDiscountEntryText(discount, 'FIXED')).toBe(text);
    }
    const { discount } = deriveDiscountEntryState('PERCENT', '7');
    expect(formatDiscountEntryText(discount, 'PERCENT')).toBe('7');
  });
});

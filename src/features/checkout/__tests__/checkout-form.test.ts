import {
  createCheckoutSplit,
  deriveCheckoutFormState,
  editCheckoutSplit,
  fillCheckoutSplitRemainder,
  getRemainingExpectedCents,
  retargetCheckoutSplit,
  type CheckoutSplit,
} from '../checkout-form';

const EXPECTED = 9500;

describe('checkout form derivation', () => {
  it('starts at zero entries, not submittable while something is expected', () => {
    const state = deriveCheckoutFormState(EXPECTED, { cardText: '', cashText: '' });

    expect(state).toMatchObject({
      expectedTotalCents: 9500,
      cardCents: 0,
      cashCents: 0,
      enteredTotalCents: 0,
      differenceCents: -9500,
      canSubmit: false,
      amounts: undefined,
    });
    expect(state.cardError).toBeUndefined();
  });

  it('accepts card only, cash only and mixed entries with exact cents', () => {
    expect(deriveCheckoutFormState(EXPECTED, { cardText: '95', cashText: '' })).toMatchObject({
      enteredTotalCents: 9500,
      differenceCents: 0,
      canSubmit: true,
      amounts: { cardAmountCents: 9500, cashAmountCents: 0 },
    });
    expect(deriveCheckoutFormState(EXPECTED, { cardText: '0', cashText: '95,00' })).toMatchObject({
      canSubmit: true,
      amounts: { cardAmountCents: 0, cashAmountCents: 9500 },
    });
    expect(deriveCheckoutFormState(EXPECTED, { cardText: '75', cashText: '20' })).toMatchObject({
      enteredTotalCents: 9500,
      canSubmit: true,
      amounts: { cardAmountCents: 7500, cashAmountCents: 2000 },
    });
  });

  // The standalone Sale keeps this tolerance; the Appointment checkout passes
  // an allocation instead (below) and settles EXACTLY its due.
  it('without an allocation (standalone Sale), tolerates a different actual total and exposes the signed difference', () => {
    expect(deriveCheckoutFormState(EXPECTED, { cardText: '90', cashText: '' })).toMatchObject({
      differenceCents: -500,
      canSubmit: true,
    });
    expect(deriveCheckoutFormState(EXPECTED, { cardText: '100', cashText: '' })).toMatchObject({
      differenceCents: 500,
      canSubmit: true,
    });
  });

  it('rejects negative or textual entries with a field error and no amounts', () => {
    const negative = deriveCheckoutFormState(EXPECTED, { cardText: '-5', cashText: '20' });
    expect(negative.cardError).toBe('Montant invalide');
    expect(negative.cashError).toBeUndefined();
    expect(negative.enteredTotalCents).toBeUndefined();
    expect(negative.canSubmit).toBe(false);
    expect(negative.amounts).toBeUndefined();

    const textual = deriveCheckoutFormState(EXPECTED, { cardText: '95', cashText: 'abc' });
    expect(textual.cashError).toBe('Montant invalide');
    expect(textual.canSubmit).toBe(false);
  });

  it('allows a zero checkout only when nothing is expected', () => {
    expect(deriveCheckoutFormState(0, { cardText: '', cashText: '' })).toMatchObject({
      canSubmit: true,
      amounts: { cardAmountCents: 0, cashAmountCents: 0 },
    });
  });

  it('proposes the remaining expected amount for the other method', () => {
    expect(getRemainingExpectedCents(EXPECTED, undefined)).toBe(9500);
    expect(getRemainingExpectedCents(EXPECTED, 7500)).toBe(2000);
    expect(getRemainingExpectedCents(EXPECTED, 9500)).toBe(0);
    expect(getRemainingExpectedCents(EXPECTED, 12000)).toBe(0);
  });
});

describe('checkout form — the Appointment allocation (exact due)', () => {
  const exact100 = { minimumCents: 10000, maximumCents: 10000 };

  it('confirms only EXACTLY the due', () => {
    expect(deriveCheckoutFormState(10000, { cardText: '30', cashText: '70' }, exact100)).toMatchObject({
      canSubmit: true,
      unallocatedCents: undefined,
      exceedsAllocation: false,
      amounts: { cardAmountCents: 3000, cashAmountCents: 7000 },
    });
    expect(deriveCheckoutFormState(10000, { cardText: '100', cashText: '' }, exact100).canSubmit).toBe(true);
  });

  it('below the due: what remains to split, and no confirmation', () => {
    expect(deriveCheckoutFormState(10000, { cardText: '30', cashText: '50' }, exact100)).toMatchObject({
      canSubmit: false,
      unallocatedCents: 2000,
      exceedsAllocation: false,
      amounts: undefined,
    });
  });

  it('above the due: an error, and no confirmation — whatever the split', () => {
    for (const [cardText, cashText] of [['110', ''], ['30', '80']] as const) {
      expect(deriveCheckoutFormState(10000, { cardText, cashText }, exact100)).toMatchObject({
        canSubmit: false,
        unallocatedCents: undefined,
        exceedsAllocation: true,
        amounts: undefined,
      });
    }
  });

  it('a correction range accepts anything between its bounds (legacy 120 € recorded, 100 € due)', () => {
    const legacy = { minimumCents: 10000, maximumCents: 12000 };

    for (const cardText of ['120', '115', '100']) {
      expect(deriveCheckoutFormState(10000, { cardText, cashText: '' }, legacy).canSubmit).toBe(true);
    }
    expect(deriveCheckoutFormState(10000, { cardText: '125', cashText: '' }, legacy).exceedsAllocation).toBe(true);
    expect(deriveCheckoutFormState(10000, { cardText: '90', cashText: '' }, legacy).unallocatedCents).toBe(1000);
  });
});

describe('checkout split — who owns each amount', () => {
  const texts = (split: CheckoutSplit) => [split.CARD.text, split.CASH.text];
  const owners = (split: CheckoutSplit) => [split.CARD.owner, split.CASH.owner];

  it('Card 30 → Cash automatically 70; Card 45 → Cash 55', () => {
    const card30 = editCheckoutSplit(createCheckoutSplit(), 'CARD', '30', 10000);
    expect(texts(card30)).toEqual(['30', '70,00']);
    expect(owners(card30)).toEqual(['manual', 'auto']);

    expect(texts(editCheckoutSplit(card30, 'CARD', '45', 10000))).toEqual(['45', '55,00']);
  });

  it('Card 100 → Cash empty; Card 110 → Cash empty, never negative, Card never capped', () => {
    expect(texts(editCheckoutSplit(createCheckoutSplit(), 'CARD', '100', 10000))).toEqual(['100', '']);
    expect(texts(editCheckoutSplit(createCheckoutSplit(), 'CARD', '110', 10000))).toEqual(['110', '']);
  });

  it('a typed Cash becomes manual and is never rewritten when Card changes afterwards', () => {
    let split = editCheckoutSplit(createCheckoutSplit(), 'CARD', '30', 10000);
    split = editCheckoutSplit(split, 'CASH', '50', 10000);
    expect(texts(split)).toEqual(['30', '50']);
    expect(owners(split)).toEqual(['manual', 'manual']);

    split = editCheckoutSplit(split, 'CARD', '40', 10000);
    expect(texts(split)).toEqual(['40', '50']);
  });

  it('clearing a manual amount releases it WITHOUT refilling it; the next edit of the other one does', () => {
    let split = editCheckoutSplit(createCheckoutSplit(), 'CARD', '30', 10000);
    split = editCheckoutSplit(split, 'CASH', '50', 10000);

    split = editCheckoutSplit(split, 'CASH', '', 10000);
    expect(texts(split)).toEqual(['30', '']);
    expect(owners(split)).toEqual(['manual', 'auto']);

    split = editCheckoutSplit(split, 'CARD', '35', 10000);
    expect(texts(split)).toEqual(['35', '65,00']);
  });

  it('an unparseable entry keeps the other amount as it was', () => {
    const card30 = editCheckoutSplit(createCheckoutSplit(), 'CARD', '30', 10000);

    expect(texts(editCheckoutSplit(card30, 'CARD', '3a', 10000))).toEqual(['3a', '70,00']);
  });

  it('« Reste » fills what remains, as an automatic amount', () => {
    const cashFilled = fillCheckoutSplitRemainder(createCheckoutSplit(), 'CASH', 10000);
    expect(texts(cashFilled)).toEqual(['', '100,00']);
    expect(owners(cashFilled)).toEqual(['auto', 'auto']);

    // Typing Card then rebalances the automatic Cash.
    expect(texts(editCheckoutSplit(cashFilled, 'CARD', '20', 10000))).toEqual(['20', '80,00']);
  });

  it('a new target (discount) moves the automatic amount only', () => {
    const card30 = editCheckoutSplit(createCheckoutSplit(), 'CARD', '30', 10000);

    expect(texts(retargetCheckoutSplit(card30, 8000))).toEqual(['30', '50,00']);
    const bothManual = editCheckoutSplit(card30, 'CASH', '70', 10000);
    expect(retargetCheckoutSplit(bothManual, 8000)).toBe(bothManual);
    // Nobody typed yet: nothing to follow.
    const untouched = createCheckoutSplit();
    expect(retargetCheckoutSplit(untouched, 8000)).toBe(untouched);
  });

  it('with a deposit: 70 € due, Card 20 → Cash 50', () => {
    expect(texts(editCheckoutSplit(createCheckoutSplit(), 'CARD', '20', 7000))).toEqual(['20', '50,00']);
  });

  it('a correction opens EXACTLY on the recorded amounts, then rebalances on the first edit', () => {
    const recorded = createCheckoutSplit({ cardAmountCents: 5000, cashAmountCents: 7000 });
    expect(texts(recorded)).toEqual(['50,00', '70,00']);
    // Legacy overpaid 120 €: the target is the recorded total, so it is preserved.
    expect(texts(editCheckoutSplit(recorded, 'CARD', '20', 12000))).toEqual(['20', '100,00']);
  });
});

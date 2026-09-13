import { deriveCheckoutFormState, getRemainingExpectedCents } from '../checkout-form';

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

  it('tolerates a different actual total and exposes the signed difference', () => {
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

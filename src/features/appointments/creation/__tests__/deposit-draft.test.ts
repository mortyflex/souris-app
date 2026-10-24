// BeautIzzy — « Ajouter un acompte reçu » draft rules (Appointment creation)
//
// The creation draft asks THE deposit rule of an existing Appointment: same
// cents, same refusals, same maximum. A price or discount change is re-read
// against the SAME typed text, so a deposit never silently outgrows its total.

import { getAppointmentServicesTotal, type AppointmentServicesTotal } from '@/domain/appointments';
import { formatEuroCents } from '@/shared/lib/money';

import {
  canOfferCreationDeposit,
  deriveCreationDepositState,
  getCreationDepositPosition,
  getCreationDepositStatus,
  type CreationDepositDraft,
} from '../deposit-draft';

/** The services total of a draft: prices in euros, optional discount. */
function total(
  prices: readonly number[],
  discount?: { type: 'PERCENT'; percent: number } | { type: 'FIXED'; amountCents: number },
): AppointmentServicesTotal {
  return getAppointmentServicesTotal({ items: prices.map((price) => ({ price })), discount });
}

const draft = (amountText: string, paymentMethod: 'CARD' | 'CASH' = 'CARD'): CreationDepositDraft => ({
  id: 'deposit-draft',
  amountText,
  paymentMethod,
});

describe('creation deposit position', () => {
  it('a new Appointment expects its services net of the discount and has nothing paid ahead', () => {
    expect(getCreationDepositPosition(total([95, 40]))).toEqual({
      expectedTotalCents: 13_500,
      activeDepositTotalCents: 0,
      remainingCents: 13_500,
    });
    expect(getCreationDepositPosition(total([95, 40], { type: 'PERCENT', percent: 20 }))).toEqual({
      expectedTotalCents: 10_800,
      activeDepositTotalCents: 0,
      remainingCents: 10_800,
    });
  });
});

describe('creation deposit draft', () => {
  it('no draft: nothing to save, nothing blocks the creation', () => {
    expect(deriveCreationDepositState(undefined, 'SCHEDULED', total([60]))).toMatchObject({
      deposit: undefined,
      blocksCreation: false,
      form: { error: undefined, canSubmit: false },
    });
  });

  it('an empty entry is not a deposit and not an error (the row was merely opened)', () => {
    expect(deriveCreationDepositState(draft('  '), 'SCHEDULED', total([60]))).toMatchObject({
      deposit: undefined,
      blocksCreation: false,
    });
  });

  it('reads a comma amount into exact cents, with the method chosen', () => {
    const state = deriveCreationDepositState(draft('20,50', 'CASH'), 'SCHEDULED', total([60]));
    expect(state.deposit).toEqual({ id: 'deposit-draft', amountCents: 2050, paymentMethod: 'CASH' });
    expect(state.form.remainingAfterCents).toBe(3950);
    expect(state.blocksCreation).toBe(false);
  });

  it('reads a dot amount the same way', () => {
    expect(deriveCreationDepositState(draft('20.5'), 'SCHEDULED', total([60])).deposit?.amountCents).toBe(2050);
    expect(deriveCreationDepositState(draft('20.50'), 'SCHEDULED', total([60])).deposit?.amountCents).toBe(2050);
  });

  it('a trailing separator while typing is still a readable amount', () => {
    expect(deriveCreationDepositState(draft('20,'), 'SCHEDULED', total([60])).deposit?.amountCents).toBe(2000);
  });

  it('accepts exactly the whole total (fully prepaid)', () => {
    const state = deriveCreationDepositState(draft('60'), 'SCHEDULED', total([60]));
    expect(state.deposit?.amountCents).toBe(6000);
    expect(state.form.remainingAfterCents).toBe(0);
  });

  it('refuses zero — consistently with « Prendre un acompte » — and blocks the creation', () => {
    const state = deriveCreationDepositState(draft('0'), 'SCHEDULED', total([60]));
    expect(state.deposit).toBeUndefined();
    expect(state.blocksCreation).toBe(true);
    expect(state.form.error).toBe('Le montant doit être supérieur à 0 €.');
  });

  it('refuses a negative or unreadable entry', () => {
    for (const text of ['-5', 'abc', '12,345', '1,2,3']) {
      const state = deriveCreationDepositState(draft(text), 'SCHEDULED', total([60]));
      expect([text, state.deposit, state.blocksCreation, state.form.error]).toEqual([
        text,
        undefined,
        true,
        'Montant invalide',
      ]);
    }
  });

  it('refuses more than the expected total, naming the maximum', () => {
    const state = deriveCreationDepositState(draft('60,01'), 'SCHEDULED', total([60]));
    expect(state.deposit).toBeUndefined();
    expect(state.blocksCreation).toBe(true);
    expect(state.form.error).toBe(
      `L’acompte ne peut pas dépasser le reste à encaisser (${formatEuroCents(6000)}).`,
    );
  });

  it('a fixed discount lowers the maximum: 60 € − 15 € leaves 45 €', () => {
    const net = total([60], { type: 'FIXED', amountCents: 1500 });
    expect(deriveCreationDepositState(draft('45'), 'SCHEDULED', net).deposit?.amountCents).toBe(4500);
    expect(deriveCreationDepositState(draft('45,01'), 'SCHEDULED', net)).toMatchObject({
      deposit: undefined,
      blocksCreation: true,
    });
  });

  it('a percentage discount lowers the maximum: 60 € − 50 % leaves 30 €', () => {
    const net = total([60], { type: 'PERCENT', percent: 50 });
    const state = deriveCreationDepositState(draft('30'), 'SCHEDULED', net);
    expect(state.deposit?.amountCents).toBe(3000);
    expect(state.form.remainingAfterCents).toBe(0);
    expect(deriveCreationDepositState(draft('30,01'), 'SCHEDULED', net).blocksCreation).toBe(true);
  });

  it('the SAME typed amount becomes invalid when the price drops below it, and valid again when it rises', () => {
    const typed = draft('50');
    expect(deriveCreationDepositState(typed, 'SCHEDULED', total([60])).deposit?.amountCents).toBe(5000);
    // The price is lowered to 40 €: the 50 € deposit is refused, never clamped to 40.
    const lowered = deriveCreationDepositState(typed, 'SCHEDULED', total([40]));
    expect(lowered.deposit).toBeUndefined();
    expect(lowered.blocksCreation).toBe(true);
    expect(lowered.form.error).toContain(formatEuroCents(4000));
    // A discount added later has the same effect.
    expect(
      deriveCreationDepositState(typed, 'SCHEDULED', total([60], { type: 'PERCENT', percent: 20 })).blocksCreation,
    ).toBe(true);
    // Removing a service, then adding a dearer one: valid again, same text, same id.
    const raised = deriveCreationDepositState(typed, 'SCHEDULED', total([40, 20]));
    expect(raised.deposit).toEqual({ id: 'deposit-draft', amountCents: 5000, paymentMethod: 'CARD' });
  });

  it('services at zero price cannot receive a deposit: every amount exceeds the 0,00 € remaining', () => {
    const free = total([0, 0]);
    expect(getCreationDepositPosition(free).remainingCents).toBe(0);
    const state = deriveCreationDepositState(draft('10'), 'SCHEDULED', free);
    expect(state.deposit).toBeUndefined();
    expect(state.blocksCreation).toBe(true);
    expect(state.form.error).toBe(`L’acompte ne peut pas dépasser le reste à encaisser (${formatEuroCents(0)}).`);
  });

  it('a fixed discount above the total leaves 0,00 € to collect, never a negative remaining', () => {
    const position = getCreationDepositPosition(total([20], { type: 'FIXED', amountCents: 5000 }));
    expect(position.expectedTotalCents).toBe(0);
    expect(position.remainingCents).toBe(0);
  });

  it('a status that is not financially open refuses every amount', () => {
    const state = deriveCreationDepositState(draft('10'), 'COMPLETED', total([60]));
    expect(state.deposit).toBeUndefined();
    expect(state.form.error).toBe('Ce rendez-vous ne peut plus recevoir d’acompte.');
  });
});

describe('when a deposit may be offered', () => {
  const now = new Date(2026, 7, 25, 9, 0);

  it('a same-day or future Appointment is SCHEDULED on save: a deposit may be offered', () => {
    expect(getCreationDepositStatus(new Date(2026, 7, 25, 18, 0), now)).toBe('SCHEDULED');
    expect(getCreationDepositStatus(new Date(2026, 7, 26, 8, 0), now)).toBe('SCHEDULED');
    expect(canOfferCreationDeposit(new Date(2026, 7, 25, 7, 0), now)).toBe(true);
  });

  it('a previous-day Appointment is finalized COMPLETED on save: no deposit can be offered', () => {
    expect(getCreationDepositStatus(new Date(2026, 7, 24, 23, 59), now)).toBe('COMPLETED');
    expect(canOfferCreationDeposit(new Date(2026, 7, 24, 23, 59), now)).toBe(false);
  });
});

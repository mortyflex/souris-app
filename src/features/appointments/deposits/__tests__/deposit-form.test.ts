import type { AppointmentDepositPosition, AppointmentDeposit } from '@/domain/appointments';
import { formatEuroCents } from '@/shared/lib/money';

import {
  DEPOSIT_QUICK_AMOUNTS_CENTS,
  deriveDepositFormState,
  isQuickDepositAmountAvailable,
} from '../deposit-form';
import {
  describeDepositShortfall,
  formatDepositAccessibilityLabel,
  formatDepositRowLabel,
  formatVoidDepositLabel,
} from '../presentation';

// 120 € expected, 30 € already paid ahead.
const position: AppointmentDepositPosition = {
  expectedTotalCents: 12000,
  activeDepositTotalCents: 3000,
  remainingCents: 9000,
};

describe('« Prendre un acompte » form', () => {
  it('an empty entry is not an error but cannot be submitted', () => {
    expect(deriveDepositFormState('SCHEDULED', position, '')).toEqual({
      amountCents: undefined,
      error: undefined,
      canSubmit: false,
      remainingAfterCents: 9000,
    });
  });

  it('parses a French amount into exact cents and shows what will remain', () => {
    expect(deriveDepositFormState('SCHEDULED', position, '20,50')).toEqual({
      amountCents: 2050,
      error: undefined,
      canSubmit: true,
      remainingAfterCents: 6950,
    });
  });

  it('accepts exactly the remaining amount', () => {
    expect(deriveDepositFormState('CONFIRMED', position, '90')).toMatchObject({ canSubmit: true, remainingAfterCents: 0 });
  });

  it('refuses more than the remaining amount, with the maximum spelled out', () => {
    expect(deriveDepositFormState('SCHEDULED', position, '90,01')).toMatchObject({
      canSubmit: false,
      error: `L’acompte ne peut pas dépasser le reste à encaisser (${formatEuroCents(9000)}).`,
    });
  });

  it('refuses zero and unreadable entries', () => {
    expect(deriveDepositFormState('SCHEDULED', position, '0')).toMatchObject({
      canSubmit: false,
      error: 'Le montant doit être supérieur à 0 €.',
    });
    expect(deriveDepositFormState('SCHEDULED', position, '-5')).toMatchObject({ canSubmit: false, error: 'Montant invalide' });
    expect(deriveDepositFormState('SCHEDULED', position, '12,345')).toMatchObject({ canSubmit: false, error: 'Montant invalide' });
  });

  it('refuses any amount once the Appointment is frozen', () => {
    expect(deriveDepositFormState('COMPLETED', position, '10')).toMatchObject({
      canSubmit: false,
      error: 'Ce rendez-vous ne peut plus recevoir d’acompte.',
    });
  });

  it('offers only the quick amounts that fit in what remains', () => {
    const small = { ...position, remainingCents: 2500 };
    expect(DEPOSIT_QUICK_AMOUNTS_CENTS.filter((cents) => isQuickDepositAmountAvailable(cents, small))).toEqual([1000, 2000]);
    expect(DEPOSIT_QUICK_AMOUNTS_CENTS.filter((cents) => isQuickDepositAmountAvailable(cents, position))).toEqual([
      1000, 2000, 3000, 5000,
    ]);
  });
});

describe('deposit wording', () => {
  const deposit: AppointmentDeposit = {
    id: 'd',
    businessId: 'b',
    appointmentId: 'a',
    amountCents: 3000,
    paymentMethod: 'CARD',
    paidAt: new Date(2026, 8, 22, 10, 0),
    status: 'ACTIVE',
    createdAt: new Date(2026, 8, 22, 10, 0),
  };

  it('names the day and the method; a VOIDED deposit says so in words', () => {
    expect(formatDepositRowLabel(deposit)).toBe('22 sept. · Carte');
    expect(formatDepositRowLabel({ ...deposit, status: 'VOIDED', voidedAt: new Date() })).toBe('22 sept. · Carte · Annulé');
  });

  it('speaks the amount, the method and the day', () => {
    const thirty = formatEuroCents(3000);
    expect(formatDepositAccessibilityLabel(deposit)).toBe(`Acompte, ${thirty}, payé par carte le 22 septembre`);
    expect(formatDepositAccessibilityLabel({ ...deposit, paymentMethod: 'CASH', status: 'VOIDED', voidedAt: new Date() })).toBe(
      `Acompte annulé, ${thirty}, payé par espèces le 22 septembre`,
    );
    expect(formatVoidDepositLabel(deposit)).toBe(`Annuler l’acompte de ${thirty}`);
  });

  it('explains a refused change with the deposits already received', () => {
    expect(describeDepositShortfall({ activeDepositTotalCents: 5000, expectedTotalCents: 4000 }).message).toBe(
      `Ce changement ferait passer le total du rendez-vous sous les ${formatEuroCents(5000)} déjà versés en acompte.`,
    );
  });
});

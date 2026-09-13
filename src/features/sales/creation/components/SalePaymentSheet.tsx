// Souris — standalone Sale payment step
//
// After the Products are chosen and before the Sale completes, the
// professional records what was received by card and/or cash — the shared
// CheckoutSheet with Sale wording. Tracking only; nothing is charged. Never
// shown for a Sale sold during an Appointment (« Revente »): that money is
// recorded by the Appointment checkout.

import type { SalePaymentAmounts } from '@/domain/sales';
import { CheckoutSheet } from '@/features/checkout/CheckoutSheet';

interface SalePaymentSheetProps {
  readonly visible: boolean;
  /** Derived Sale total from the current draft, in cents. */
  readonly totalCents: number;
  readonly onClose: () => void;
  readonly onConfirm: (amounts: SalePaymentAmounts) => void;
}

export function SalePaymentSheet({ visible, totalCents, onClose, onConfirm }: SalePaymentSheetProps) {
  return (
    <CheckoutSheet
      confirmTitle="Valider la vente"
      expectedTotalCents={totalCents}
      onClose={onClose}
      onConfirm={onConfirm}
      summaryLines={[{ label: 'Total vente', cents: totalCents, testID: 'checkout-sale-total' }]}
      testID="sale-payment-sheet"
      title="Encaisser la vente"
      visible={visible}
    />
  );
}

// Souris — payment method icons
//
// The ONE cross-platform mapping for the two checkout methods, shared by
// Appointment Details (Encaisser, payment summary), the Checkout sheet and
// the Cash Register. SF Symbols on iOS, Material Symbols on Android; never
// emoji. Typed against expo-symbols so an unknown glyph fails at compile time.

import type { SymbolViewProps } from 'expo-symbols';

export type PaymentMethod = 'CARD' | 'CASH';

export type PlatformSymbolName = SymbolViewProps['name'];

export const paymentMethodIcons = {
  CARD: { ios: 'creditcard.fill', android: 'credit_card' },
  CASH: { ios: 'banknote.fill', android: 'payments' },
} as const satisfies Record<PaymentMethod, PlatformSymbolName>;

/** Cash Register entry and screen. */
export const cashRegisterIcon = { ios: 'banknote', android: 'payments' } as const satisfies PlatformSymbolName;

export const paymentMethodLabels: Readonly<Record<PaymentMethod, string>> = {
  CARD: 'Carte',
  CASH: 'Espèces',
};

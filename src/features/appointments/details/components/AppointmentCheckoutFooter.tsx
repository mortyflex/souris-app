// Souris — sticky checkout footer of Appointment Details
//
// Anchored below the scrolling body (SheetActionBar), so it stays visible
// while the Prestations scroll and never covers them. Left: « Total à
// encaisser » — the real pre-checkout total (service snapshots + Products
// sold during the Appointment, net of the discount), from the ONE canonical
// expected-total derivation the checkout sheet also consumes. Right: the
// primary violet CTA naming the amount, when checkout is possible.
//
// With an Appointment discount, ONE restrained « Réduction » line sits under
// the total. Without a discount the line does not exist. The total is always
// shown, as before; only the CTA depends on the checkout rule.

import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import type { AppointmentDiscount, AppointmentExpectedTotal } from '@/domain/appointments';
import {
  formatDiscountAmount,
  formatDiscountLabel,
  formatDiscountSpokenValue,
} from '@/features/appointments/presentation';
import { paymentMethodIcons } from '@/shared/icons/payment-method-icons';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import {
  interaction,
  lavender,
  radii,
  semanticColors,
  spacing,
  touchTarget,
} from '@/shared/ui/theme';

/** `checkout` for a live Appointment; `record` for a completed one without payment. */
export type AppointmentCheckoutAction = 'checkout' | 'record';

interface AppointmentCheckoutFooterProps {
  readonly expectedTotal: AppointmentExpectedTotal;
  readonly discount?: AppointmentDiscount;
  /** Absent when the Appointment cannot be checked out: the total stays, alone. */
  readonly onCheckout?: () => void;
  readonly checkoutAction?: AppointmentCheckoutAction;
}

export function AppointmentCheckoutFooter({
  expectedTotal,
  discount,
  onCheckout,
  checkoutAction = 'checkout',
}: AppointmentCheckoutFooterProps) {
  const amount = formatEuroCents(expectedTotal.expectedTotalCents);
  const verb = checkoutAction === 'record' ? 'Enregistrer' : 'Encaisser';

  return (
    <SheetActionBar direction="row" style={styles.bar} testID="appointment-checkout-footer">
      <View
        accessible
        accessibilityLabel={`Total à encaisser ${amount}`}
        style={styles.totalColumn}
        testID="appointment-expected-total"
      >
        <AppText variant="metadata" numberOfLines={1} style={styles.label}>
          Total à encaisser
        </AppText>
        <AppText
          variant="summaryValue"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          selectable
          style={styles.value}
          testID="appointment-expected-total-value"
        >
          {amount}
        </AppText>
        {discount && (
          <AppText
            accessibilityLabel={`Réduction de ${formatDiscountSpokenValue(discount)}, ${formatDiscountAmount(expectedTotal.discountCents)}`}
            variant="metadata"
            numberOfLines={1}
            style={styles.discount}
            testID="appointment-discount-row"
          >
            {`${formatDiscountLabel(discount)} · `}
            <AppText variant="metadata" style={styles.discountValue} testID="appointment-discount-value">
              {formatDiscountAmount(expectedTotal.discountCents)}
            </AppText>
          </AppText>
        )}
      </View>
      {onCheckout && (
        <Pressable
          accessibilityHint="Confirmer la fin du rendez-vous et saisir le montant reçu"
          accessibilityLabel={
            checkoutAction === 'record' ? `Enregistrer un encaissement de ${amount}` : `Encaisser ${amount}`
          }
          accessibilityRole="button"
          onPress={onCheckout}
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          testID="checkout-appointment"
        >
          <SymbolView
            name={paymentMethodIcons.CARD}
            size={18}
            tintColor={semanticColors.surfaceElevated}
          />
          <AppText
            variant="control"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={styles.ctaText}
          >
            {`${verb} ${amount}`}
          </AppText>
        </Pressable>
      )}
    </SheetActionBar>
  );
}

const minimumHeight = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'] + spacing.sm;

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.base,
  },
  totalColumn: { flexShrink: 1, flexGrow: 1, minWidth: 0 },
  label: { color: semanticColors.foregroundSoft },
  value: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  discount: { color: semanticColors.foregroundSoft },
  discountValue: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  cta: {
    alignItems: 'center',
    backgroundColor: semanticColors.accent,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    maxWidth: '62%',
    minHeight: minimumHeight,
    paddingHorizontal: spacing.lg,
  },
  ctaPressed: {
    backgroundColor: lavender.lav700,
    transform: [{ scale: interaction.pressedScale }],
  },
  ctaText: { color: semanticColors.surfaceElevated, flexShrink: 1, fontVariant: ['tabular-nums'] },
});

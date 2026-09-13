// Souris — Appointment Details primary row: [ Revente ] [ Encaisser ]
//
// The two commercial actions of a live Appointment share ONE row of equal
// height and balanced width: Revente is the lighter lavender action,
// Encaisser the primary violet one. Either may be absent (archived Client
// hides Revente; a paid Appointment has no Encaisser) and the remaining
// action then stretches. Icons come from the shared cross-platform mapping.

import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { paymentMethodIcons } from '@/shared/icons/payment-method-icons';
import { AppText } from '@/shared/ui/AppText';
import { interaction, lavender, radii, semanticColors, spacing, touchTarget } from '@/shared/ui/theme';

interface AppointmentPrimaryActionsProps {
  readonly onSell?: () => void;
  readonly onCheckout?: () => void;
  /** « Encaisser » for a live Appointment; « Enregistrer un encaissement » for a completed one. */
  readonly checkoutLabel?: string;
}

export function AppointmentPrimaryActions({
  onSell,
  onCheckout,
  checkoutLabel = 'Encaisser',
}: AppointmentPrimaryActionsProps) {
  if (!onSell && !onCheckout) return null;

  return (
    <View style={styles.row} testID="appointment-primary-actions">
      {onSell && (
        <Pressable
          accessibilityHint="Vendre un produit à cette cliente"
          accessibilityLabel="Revente"
          accessibilityRole="button"
          onPress={onSell}
          style={({ pressed }) => [styles.action, styles.saleAction, pressed && styles.saleActionPressed]}
          testID="sell-product"
        >
          <SymbolView
            name={{ ios: 'bag.fill', android: 'shopping_bag' }}
            size={18}
            tintColor={semanticColors.accent}
          />
          <AppText variant="control" numberOfLines={1} style={styles.saleActionText}>
            Revente
          </AppText>
        </Pressable>
      )}
      {onCheckout && (
        <Pressable
          accessibilityHint="Confirmer la fin du rendez-vous et saisir le montant reçu"
          accessibilityLabel={checkoutLabel}
          accessibilityRole="button"
          onPress={onCheckout}
          style={({ pressed }) => [
            styles.action,
            styles.checkoutAction,
            pressed && styles.checkoutActionPressed,
          ]}
          testID="checkout-appointment"
        >
          <SymbolView
            name={paymentMethodIcons.CARD}
            size={18}
            tintColor={semanticColors.surfaceElevated}
          />
          <AppText variant="control" numberOfLines={1} style={styles.checkoutActionText}>
            {checkoutLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const minimumHeight = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  action: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: minimumHeight,
    minWidth: 0,
    paddingHorizontal: spacing.md,
  },
  saleAction: { backgroundColor: semanticColors.surfaceLavenderStrong },
  saleActionPressed: {
    backgroundColor: semanticColors.borderLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  saleActionText: { color: semanticColors.accent, flexShrink: 1 },
  checkoutAction: { backgroundColor: semanticColors.accent },
  checkoutActionPressed: {
    backgroundColor: lavender.lav700,
    transform: [{ scale: interaction.pressedScale }],
  },
  checkoutActionText: { color: semanticColors.surfaceElevated, flexShrink: 1 },
});

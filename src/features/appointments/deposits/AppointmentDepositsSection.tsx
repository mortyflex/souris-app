// BeautIzzy — « Acomptes » of Appointment Details
//
// Compact on purpose — Details is not an accounting screen:
//
//   no deposit      ONE lightweight « Prendre un acompte » row (like « Ajouter
//                   une vente »), only while a deposit can be taken
//   deposits        the « Acomptes » section: the position (Total attendu →
//                   Acomptes → Reste à encaisser), then one row per deposit —
//                   `22 sept. · Carte   30,00 €`. A VOIDED deposit stays
//                   listed, subdued, struck through AND labelled « Annulé »
//                   (never colour alone), and counts in no total. An ACTIVE
//                   deposit of an open Appointment offers « Annuler »; then
//                   « Prendre un acompte » while there is room for one.
//
// Every amount comes from the domain position; nothing is computed here.

import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import type {
  AppointmentDeposit,
  AppointmentDepositInvariantBreach,
  AppointmentDepositPosition,
} from '@/domain/appointments';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  foregroundSoft,
  interaction,
  lavender,
  radii,
  rose,
  semanticColors,
  spacing,
  touchTarget,
} from '@/shared/ui/theme';

import {
  formatDepositAccessibilityLabel,
  formatDepositRowLabel,
  formatVoidDepositLabel,
} from './presentation';

interface AppointmentDepositsSectionProps {
  /** The deposits of this Appointment, oldest first, VOIDED included. */
  readonly deposits: readonly AppointmentDeposit[];
  readonly position: AppointmentDepositPosition;
  /** Present only when a new deposit can be taken. */
  readonly onTakeDeposit?: () => void;
  /** Present while deposits can be corrected (any Appointment but a COMPLETED one). */
  readonly onVoidDeposit?: (deposit: AppointmentDeposit) => void;
  /**
   * Deposits above the expected total (a cross-device merge). The position then
   * names the excess instead of a « Reste à encaisser » of 0,00 € that would
   * read as "nothing is due".
   */
  readonly breach?: AppointmentDepositInvariantBreach;
}

const minimumRowHeight = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

export function AppointmentDepositsSection({
  deposits,
  position,
  onTakeDeposit,
  onVoidDeposit,
  breach,
}: AppointmentDepositsSectionProps) {
  if (deposits.length === 0) {
    return onTakeDeposit ? <TakeDepositRow onPress={onTakeDeposit} standalone /> : null;
  }

  return (
    <View style={styles.section} testID="appointment-deposits">
      <SectionHeader count={deposits.length} style={styles.header} title="Acomptes" />
      <View style={styles.group}>
        <View style={styles.position} testID="appointment-deposit-position">
          <PositionRow
            label="Total attendu"
            testID="appointment-deposit-expected"
            value={formatEuroCents(position.expectedTotalCents)}
          />
          <PositionRow
            accessibilityLabel={`Total des acomptes, ${formatEuroCents(position.activeDepositTotalCents)}`}
            label="Acomptes"
            testID="appointment-deposit-total"
            value={formatEuroCents(position.activeDepositTotalCents)}
          />
          <View style={styles.divider} />
          {breach ? (
            <View
              accessible
              accessibilityLabel={`Conflit financier, les acomptes dépassent le total de ${formatEuroCents(breach.excessCents)}`}
              style={styles.positionRow}
            >
              <AppText variant="control" style={styles.conflictLabel}>
                Acomptes en trop
              </AppText>
              <AppText variant="control" style={styles.conflictValue} testID="appointment-deposit-excess">
                {formatEuroCents(breach.excessCents)}
              </AppText>
            </View>
          ) : (
            <View
              accessible
              accessibilityLabel={`Reste à encaisser, ${formatEuroCents(position.remainingCents)}`}
              style={styles.positionRow}
            >
              <AppText variant="control" style={styles.remainingLabel}>
                Reste à encaisser
              </AppText>
              <AppText variant="control" style={styles.remainingValue} testID="appointment-deposit-remaining">
                {formatEuroCents(position.remainingCents)}
              </AppText>
            </View>
          )}
        </View>

        {deposits.map((deposit) => {
          const voided = deposit.status === 'VOIDED';
          return (
            <View key={deposit.id} style={styles.depositRow} testID={`appointment-deposit-${deposit.id}`}>
              <View
                accessible
                accessibilityLabel={formatDepositAccessibilityLabel(deposit)}
                style={styles.depositCopy}
              >
                <AppText
                  variant="metadata"
                  numberOfLines={1}
                  style={voided ? styles.depositLabelVoided : styles.depositLabel}
                  testID={`appointment-deposit-label-${deposit.id}`}
                >
                  {formatDepositRowLabel(deposit)}
                </AppText>
                <AppText
                  variant="control"
                  style={voided ? styles.depositAmountVoided : styles.depositAmount}
                  testID={`appointment-deposit-amount-${deposit.id}`}
                >
                  {formatEuroCents(deposit.amountCents)}
                </AppText>
              </View>
              {!voided && onVoidDeposit && (
                <Pressable
                  accessibilityLabel={formatVoidDepositLabel(deposit)}
                  accessibilityRole="button"
                  hitSlop={spacing.sm}
                  onPress={() => onVoidDeposit(deposit)}
                  style={({ pressed }) => [styles.voidAction, pressed && styles.pressed]}
                  testID={`void-deposit-${deposit.id}`}
                >
                  <AppText variant="metadata" style={styles.voidLabel}>
                    Annuler
                  </AppText>
                </Pressable>
              )}
            </View>
          );
        })}

        {onTakeDeposit && <TakeDepositRow onPress={onTakeDeposit} />}
      </View>
    </View>
  );
}

function PositionRow({
  label,
  value,
  testID,
  accessibilityLabel,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID: string;
  readonly accessibilityLabel?: string;
}) {
  return (
    <View accessible accessibilityLabel={accessibilityLabel ?? `${label}, ${value}`} style={styles.positionRow}>
      <AppText variant="metadata" style={styles.positionLabel}>
        {label}
      </AppText>
      <AppText variant="metadata" style={styles.positionValue} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

function TakeDepositRow({ onPress, standalone = false }: { readonly onPress: () => void; readonly standalone?: boolean }) {
  return (
    <Pressable
      accessibilityHint="Enregistrer un montant reçu à l’avance pour ce rendez-vous"
      accessibilityLabel="Prendre un acompte"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.takeRow,
        standalone && styles.takeRowStandalone,
        pressed && styles.takeRowPressed,
      ]}
      testID="take-deposit"
    >
      <SymbolView
        name={{ ios: 'plus.circle', android: 'add_circle' }}
        size={20}
        tintColor={semanticColors.accent}
      />
      <AppText variant="control" numberOfLines={1} style={styles.takeLabel}>
        Prendre un acompte
      </AppText>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={14}
        tintColor={semanticColors.accent}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  header: { marginBottom: spacing.md },
  group: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  position: {
    backgroundColor: semanticColors.surfaceLavender,
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  positionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  positionLabel: { color: foregroundSoft },
  positionValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  divider: {
    backgroundColor: semanticColors.borderLavender,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
  },
  remainingLabel: { color: semanticColors.foreground },
  remainingValue: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  conflictLabel: { color: rose.rose700 },
  conflictValue: { color: rose.rose600, fontVariant: ['tabular-nums'] },
  depositRow: {
    alignItems: 'center',
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: minimumRowHeight,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  depositCopy: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.md, minWidth: 0 },
  depositLabel: { color: semanticColors.foreground, flex: 1 },
  depositLabelVoided: { color: semanticColors.foregroundMuted, flex: 1 },
  depositAmount: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  depositAmountVoided: {
    color: semanticColors.foregroundMuted,
    fontVariant: ['tabular-nums'],
    textDecorationLine: 'line-through',
  },
  voidAction: { justifyContent: 'center', minHeight: 32 },
  voidLabel: { color: semanticColors.accent },
  pressed: { opacity: interaction.pressedOpacity },
  takeRow: {
    alignItems: 'center',
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: minimumRowHeight + spacing.sm,
    paddingHorizontal: spacing.base,
  },
  takeRowStandalone: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.md,
  },
  takeRowPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  takeLabel: { color: semanticColors.accent, flex: 1 },
});

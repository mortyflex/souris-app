// Souris — « Prendre un acompte » sheet
//
// The canonical Souris editing sheet (SheetEditingHeader: « Annuler » leading,
// the title, no eyebrow; drag handle, backdrop and swipe dismissal) in which
// the professional records money received NOW, in advance, for an existing
// Appointment. Nothing is written until « Encaisser l'acompte »; cancelling or
// dismissing writes nothing.
//
// - the position block always shows what matters: the expected total, what
//   was already paid ahead, the new deposit, and what will remain;
// - quick amounts (10 / 20 / 30 / 50 €) only fill the entry — a deposit is
//   always stored as exact integer cents, never as a percentage; a quick
//   amount above what is left to collect is not offered;
// - the method is Carte or Espèces (THE domain vocabulary);
// - every rule comes from the pure form module and the domain; the sheet
//   computes nothing;
// - ONE submission per presentation: the deposit id is created when the
//   sheet opens and a submitting flag (ref + state) blocks a second tap, so a
//   double tap can never record two deposits.
//
// Haptics: a quick amount gives ONE selection tick when it changes the entry
// (the method switch ticks by itself, SegmentedControl); success is the
// caller's single haptic once the deposit is committed.

import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type {
  AppointmentDepositPosition,
  AppointmentStatus,
  PaymentMethod,
} from '@/domain/appointments';
import { paymentMethodLabels } from '@/shared/icons/payment-method-icons';
import { haptics } from '@/shared/lib/haptics';
import { formatCentsAsInput, formatEuroCents } from '@/shared/lib/money';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import {
  fontFamilies,
  foregroundSoft,
  interaction,
  lavender,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import {
  DEPOSIT_QUICK_AMOUNTS_CENTS,
  deriveDepositFormState,
  isQuickDepositAmountAvailable,
} from './deposit-form';
import { createAppointmentDepositId } from './runtime-ids';

export interface AppointmentDepositSubmission {
  readonly id: string;
  readonly amountCents: number;
  readonly paymentMethod: PaymentMethod;
}

interface AppointmentDepositSheetProps {
  readonly visible: boolean;
  readonly status: AppointmentStatus;
  /** The CURRENT position of the Appointment (domain). */
  readonly position: AppointmentDepositPosition;
  readonly onClose: () => void;
  /** Records the deposit; returns whether it was committed (the sheet then closes). */
  readonly onConfirm: (submission: AppointmentDepositSubmission) => boolean;
}

const methodOptions: readonly SegmentedControlOption<PaymentMethod>[] = [
  { value: 'CARD', label: paymentMethodLabels.CARD, testID: 'deposit-method-card' },
  { value: 'CASH', label: paymentMethodLabels.CASH, testID: 'deposit-method-cash' },
];

function formatQuickAmount(cents: number): string {
  return `${cents / 100} €`;
}

export function AppointmentDepositSheet({
  visible,
  status,
  position,
  onClose,
  onConfirm,
}: AppointmentDepositSheetProps) {
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [depositId, setDepositId] = useState(createAppointmentDepositId);
  const [submitting, setSubmitting] = useState(false);
  // The id already handed to `onConfirm` in this presentation: a second tap in
  // the same frame (before `submitting` re-renders) is ignored. A new
  // presentation has a new id, so nothing needs resetting.
  const submittedId = useRef<string | undefined>(undefined);
  // Every presentation starts empty with a FRESH id; a previous draft never
  // leaks into the next one. Derived during render so the first frame is right.
  const [presentedVisible, setPresentedVisible] = useState(visible);
  if (visible !== presentedVisible) {
    setPresentedVisible(visible);
    if (visible) {
      setAmountText('');
      setMethod('CARD');
      setDepositId(createAppointmentDepositId());
      setSubmitting(false);
    }
  }

  const state = deriveDepositFormState(status, position, amountText);

  const chooseQuickAmount = (cents: number) => {
    const text = formatCentsAsInput(cents);
    if (text === amountText) return;
    haptics.selection();
    setAmountText(text);
  };

  const confirm = () => {
    if (submittedId.current === depositId || !state.canSubmit || state.amountCents === undefined) return;
    submittedId.current = depositId;
    setSubmitting(true);
    const committed = onConfirm({ id: depositId, amountCents: state.amountCents, paymentMethod: method });
    if (!committed) {
      // Nothing was written: the professional may correct and try again.
      submittedId.current = undefined;
      setSubmitting(false);
    }
  };

  const newDepositCents = state.canSubmit && state.amountCents !== undefined ? state.amountCents : 0;

  return (
    <BottomSheet
      backdropLabel="Fermer l’acompte"
      footer={
        <SheetActionBar>
          <AppButton
            accessibilityLabel="Encaisser l’acompte"
            accessibilityState={{ disabled: !state.canSubmit || submitting, busy: submitting }}
            disabled={!state.canSubmit || submitting}
            onPress={confirm}
            testID="confirm-deposit"
            title="Encaisser l’acompte"
          />
        </SheetActionBar>
      }
      header={
        <SheetEditingHeader
          cancelAccessibilityLabel="Annuler l’acompte en cours"
          cancelTestID="cancel-deposit"
          onCancel={onClose}
          testID="deposit-header"
          title="Prendre un acompte"
        />
      }
      keyboardAvoiding
      onClose={onClose}
      scrollable
      testID="deposit-sheet"
      visible={visible}
    >
      <View style={styles.body}>
        <View style={styles.position} testID="deposit-position">
          <PositionRow
            label="Total attendu"
            testID="deposit-expected-total"
            value={formatEuroCents(position.expectedTotalCents)}
          />
          <PositionRow
            label="Déjà versé"
            testID="deposit-already-paid"
            value={formatEuroCents(position.activeDepositTotalCents)}
          />
          <PositionRow
            label="Nouvel acompte"
            testID="deposit-new-amount"
            value={formatEuroCents(newDepositCents)}
          />
          <View style={styles.divider} />
          <View
            accessible
            accessibilityLabel={`Reste après acompte, ${formatEuroCents(state.remainingAfterCents)}`}
            style={styles.positionRow}
          >
            <AppText variant="control" style={styles.remainingLabel}>
              Reste après acompte
            </AppText>
            <AppText variant="control" style={styles.remainingValue} testID="deposit-remaining-after">
              {formatEuroCents(state.remainingAfterCents)}
            </AppText>
          </View>
        </View>

        <View style={styles.amountSection}>
          <AppText variant="control" style={styles.sectionLabel}>
            Montant
          </AppText>
          <View style={styles.quickAmounts} testID="deposit-quick-amounts">
            {DEPOSIT_QUICK_AMOUNTS_CENTS.filter((cents) =>
              isQuickDepositAmountAvailable(cents, position),
            ).map((cents) => {
              const selected = state.amountCents === cents;
              return (
                <Pressable
                  accessibilityLabel={`Acompte de ${formatEuroCents(cents)}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={cents}
                  onPress={() => chooseQuickAmount(cents)}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`deposit-quick-${cents}`}
                >
                  <AppText
                    variant={selected ? 'control' : 'metadata'}
                    style={selected ? styles.chipTextSelected : styles.chipText}
                  >
                    {formatQuickAmount(cents)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.amountField, state.error !== undefined && styles.amountFieldInvalid]}>
            <AppText variant="control" style={styles.amountLabel}>
              Autre montant
            </AppText>
            <TextInput
              accessibilityLabel="Montant de l’acompte"
              inputAccessoryViewButtonLabel="OK"
              keyboardType="decimal-pad"
              onChangeText={setAmountText}
              placeholder="0,00"
              placeholderTextColor={semanticColors.foregroundMuted}
              returnKeyType="done"
              selectTextOnFocus
              style={styles.amountInput}
              testID="deposit-amount"
              textAlign="right"
              value={amountText}
            />
            <AppText variant="control" style={styles.currency}>
              €
            </AppText>
          </View>
          {state.error !== undefined && (
            <AppText
              accessibilityLiveRegion="polite"
              variant="metadata"
              style={styles.error}
              testID="deposit-error"
            >
              {state.error}
            </AppText>
          )}
        </View>

        <View style={styles.methodSection}>
          <AppText variant="control" style={styles.sectionLabel}>
            Moyen de paiement
          </AppText>
          <SegmentedControl
            onChange={setMethod}
            options={methodOptions}
            stretch
            testID="deposit-method"
            value={method}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

function PositionRow({
  label,
  value,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID: string;
}) {
  return (
    <View accessible accessibilityLabel={`${label}, ${value}`} style={styles.positionRow}>
      <AppText variant="metadata" style={styles.positionLabel}>
        {label}
      </AppText>
      <AppText variant="metadata" style={styles.positionValue} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.xs },
  position: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  positionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  positionLabel: { color: foregroundSoft },
  positionValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  divider: { backgroundColor: semanticColors.borderLavender, height: StyleSheet.hairlineWidth },
  remainingLabel: { color: semanticColors.foreground },
  remainingValue: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  amountSection: { gap: spacing.sm },
  sectionLabel: { color: semanticColors.foreground },
  quickAmounts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1,
    flexBasis: '20%',
    flexGrow: 1,
    height: 44,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: lavender.lav100,
    borderColor: semanticColors.accent,
    borderWidth: 1.5,
  },
  chipText: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  chipTextSelected: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  pressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  amountField: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.base,
  },
  amountFieldInvalid: { backgroundColor: semanticColors.surfaceRose, borderColor: rose.rose600 },
  amountLabel: { color: foregroundSoft, flex: 1 },
  amountInput: {
    color: semanticColors.foreground,
    fontFamily: fontFamilies['600'],
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    minWidth: 96,
    paddingVertical: 0,
  },
  currency: { color: foregroundSoft },
  error: { color: rose.rose600 },
  methodSection: { gap: spacing.sm },
});

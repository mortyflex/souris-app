// BeautIzzy — Checkout sheet (« Encaisser »)
//
// The ONE canonical BeautIzzy drawer where the professional records what was
// actually received by card and/or cash — for an Appointment checkout, its
// correction, or a standalone Product Sale. Not payment processing: nothing
// is charged.
//
// - opens with the keyboard CLOSED (no autoFocus); a decimal keyboard opens
//   only when an amount is tapped, inside the keyboard-safe scroll; every
//   amount field carries the same compact « OK » (KeyboardDismissAccessory),
//   which only closes the keyboard;
// - amounts are French decimal entries normalized to integer cents by the
//   pure form module; the raw text never reaches persistence;
// - the expected total is a helper: the received total may differ, the
//   difference is shown without alarm;
// - callers own the wording (title, summary lines, confirm label) and may
//   prefill the entries (payment correction);
// - the canonical creation / editing header (DESIGN_OVERRIDES.md §30):
//   « Annuler » leading, then the title, no eyebrow;
// - a caller may place ONE adjustment control above the expectation block
//   (the Appointment discount); it owns that control and recomputes the
//   summary lines and expected total it passes back in;
// - with deposits (`settlement`), the expectation block goes on below
//   « Total attendu » — « Acomptes déjà versés », then « Reste à encaisser » —
//   and the « Reste » shortcuts, the « Écart » and the acceptability of the
//   entry are measured against what is still DUE, never against the whole
//   expected total: the final payment records only the new money. A typed
//   amount is never overwritten;
// - a caller may BLOCK confirmation (`blockingNotice`: a discount below the
//   deposits) — the notice explains why, the entries stay editable;
// - when nothing is due and nothing is typed, `zeroBalanceConfirmTitle`
//   names the action (« Terminer le rendez-vous »): the caller completes
//   without inventing a payment;
// - `allocation` (the Appointment final checkout and its correction) replaces
//   the standalone-Sale tolerance with THE domain bounds: confirmation needs a
//   total inside them; below → « Reste à répartir : 35,00 € », above → « Le
//   montant dépasse le reste à encaisser. » — the typed value is never capped.
//   The amounts then have owners (checkout-form `CheckoutSplit`): a typed
//   amount is `manual` and never rewritten, the other one stays `auto` and
//   follows the target, including when a discount draft moves it. Without
//   `allocation` (the standalone Sale) nothing of this applies;
// - a caller may add ONE control under the amounts (`paymentDate`: the
//   Appointment « Encaissé le » choice).

import { SymbolView } from 'expo-symbols';
import { useId, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  paymentMethodIcons,
  paymentMethodLabels,
  type PaymentMethod,
} from '@/shared/icons/payment-method-icons';
import { formatCentsAsInput, formatEuroCents, formatSignedEuroCents } from '@/shared/lib/money';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { KeyboardDismissAccessory } from '@/shared/ui/KeyboardDismissAccessory';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import {
  fontFamilies,
  foregroundSoft,
  lavender,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import {
  createCheckoutSplit,
  deriveCheckoutFormState,
  editCheckoutSplit,
  fillCheckoutSplitRemainder,
  getRemainingExpectedCents,
  retargetCheckoutSplit,
  type CheckoutAllocation,
  type CheckoutAmounts,
  type CheckoutSplit,
} from './checkout-form';

/** One line of the expectation block (« Prestations », « Produits », « Total vente »). */
export interface CheckoutSummaryLine {
  readonly label: string;
  readonly cents: number;
  readonly testID?: string;
}

interface CheckoutSheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly confirmTitle: string;
  /** Lines shown above « Total attendu ». */
  readonly summaryLines: readonly CheckoutSummaryLine[];
  readonly expectedTotalCents: number;
  /** Recorded amounts when correcting; the sheet opens prefilled with them. */
  readonly initialAmounts?: CheckoutAmounts;
  readonly onClose: () => void;
  readonly onConfirm: (amounts: CheckoutAmounts) => void;
  /** Control shown above the expectation block (the Appointment discount). */
  readonly adjustment?: ReactNode;
  /**
   * Deposits already received for what is being paid. `dueCents` (domain:
   * expected − ACTIVE deposits, never below 0) replaces the expected total
   * for the shortcuts, the difference and the acceptability of the entry.
   */
  readonly settlement?: { readonly depositsCents: number; readonly dueCents: number };
  /** Shown under the expectation block; while present, confirmation is disabled. */
  readonly blockingNotice?: ReactNode;
  /** Informative line under the expectation block; never blocks confirmation. */
  readonly note?: ReactNode;
  /** Confirm label when nothing is due and nothing is typed (no payment will be recorded). */
  readonly zeroBalanceConfirmTitle?: string;
  /** The Appointment amount rule (exact due, or a correction range); absent = the Sale tolerance. */
  readonly allocation?: CheckoutAllocation;
  /** Control shown under the amounts (the Appointment « Encaissé le » choice). */
  readonly paymentDate?: ReactNode;
  readonly testID?: string;
}

export function CheckoutSheet({
  visible,
  title,
  confirmTitle,
  summaryLines,
  expectedTotalCents,
  initialAmounts,
  onClose,
  onConfirm,
  adjustment,
  settlement,
  blockingNotice,
  note,
  zeroBalanceConfirmTitle,
  allocation,
  paymentDate,
  testID = 'checkout-sheet',
}: CheckoutSheetProps) {
  const [split, setSplit] = useState<CheckoutSplit>(() => createCheckoutSplit(initialAmounts));
  const targetCents = allocation?.targetCents;
  const [presentedTarget, setPresentedTarget] = useState(targetCents);
  // Every presentation starts from the recorded values (edit) or empty
  // entries (checkout); a previous draft never leaks into the next one.
  // Derived during render (not in an effect) so the first visible frame
  // already shows the right values.
  const [presentedVisible, setPresentedVisible] = useState(visible);
  if (visible !== presentedVisible) {
    setPresentedVisible(visible);
    if (visible) {
      setSplit(createCheckoutSplit(initialAmounts));
      setPresentedTarget(targetCents);
    }
  } else if (targetCents !== presentedTarget) {
    // The target moved (a discount draft): `auto` amounts follow it.
    setPresentedTarget(targetCents);
    if (targetCents !== undefined) setSplit(retargetCheckoutSplit(split, targetCents));
  }
  const cardText = split.CARD.text;
  const cashText = split.CASH.text;

  // What the entries are measured against: the amount still due.
  const dueCents = settlement ? settlement.dueCents : expectedTotalCents;
  const state = deriveCheckoutFormState(dueCents, { cardText, cashText }, allocation);
  // The amount the « Reste » shortcuts aim for.
  const shortcutTargetCents = allocation ? allocation.targetCents : dueCents;
  const changeAmount = (method: PaymentMethod) => (text: string) =>
    setSplit((current) =>
      allocation
        ? editCheckoutSplit(current, method, text, allocation.targetCents)
        : { ...current, [method]: { ...current[method], text } },
    );
  const fillRemainder = (method: PaymentMethod) => (text: string) =>
    setSplit((current) =>
      allocation
        ? fillCheckoutSplitRemainder(current, method, allocation.targetCents)
        : { ...current, [method]: { ...current[method], text } },
    );
  const blocked = blockingNotice !== undefined && blockingNotice !== null && blockingNotice !== false;
  const canConfirm = state.canSubmit && !blocked;
  const confirmLabel =
    zeroBalanceConfirmTitle !== undefined && dueCents === 0 && state.enteredTotalCents === 0
      ? zeroBalanceConfirmTitle
      : confirmTitle;

  const confirm = () => {
    if (!state.amounts || blocked) return;
    onConfirm(state.amounts);
  };

  return (
    <BottomSheet
      backdropLabel="Fermer l’encaissement"
      footer={
        <SheetActionBar>
          <AppButton
            accessibilityLabel={confirmLabel}
            disabled={!canConfirm}
            onPress={confirm}
            testID="confirm-checkout"
            title={confirmLabel}
          />
        </SheetActionBar>
      }
      header={
        <SheetEditingHeader
          cancelAccessibilityLabel="Annuler l’encaissement"
          cancelTestID="cancel-checkout"
          onCancel={onClose}
          testID="checkout-header"
          title={title}
        />
      }
      keyboardAvoiding
      onClose={onClose}
      scrollable
      testID={testID}
      visible={visible}
    >
      <View style={styles.body}>
        {adjustment}
        <View style={styles.expectation} testID="checkout-expectation">
          {summaryLines.map((line) => (
            <ExpectationRow key={line.label} label={line.label} testID={line.testID} value={formatEuroCents(line.cents)} />
          ))}
          <View style={styles.divider} />
          <View
            accessible
            accessibilityLabel={`Total attendu ${formatEuroCents(expectedTotalCents)}`}
            style={styles.expectationRow}
            testID="checkout-expected-total-row"
          >
            <AppText variant="control" style={styles.expectedLabel}>
              Total attendu
            </AppText>
            <AppText variant="control" style={styles.expectedValue} testID="checkout-expected-total">
              {formatEuroCents(expectedTotalCents)}
            </AppText>
          </View>
          {settlement && settlement.depositsCents > 0 && (
            <>
              <View
                accessible
                accessibilityLabel={`Acomptes déjà versés, ${formatEuroCents(settlement.depositsCents)}`}
                style={styles.expectationRow}
                testID="checkout-deposits-row"
              >
                <AppText variant="metadata" style={styles.expectationLabel}>
                  Acomptes déjà versés
                </AppText>
                <AppText variant="metadata" style={styles.expectationValue} testID="checkout-deposits">
                  {formatEuroCents(0 - settlement.depositsCents)}
                </AppText>
              </View>
              <View style={styles.divider} />
              <View
                accessible
                accessibilityLabel={`Reste à encaisser, ${formatEuroCents(settlement.dueCents)}`}
                style={styles.expectationRow}
                testID="checkout-due-row"
              >
                <AppText variant="control" style={styles.expectedLabel}>
                  Reste à encaisser
                </AppText>
                <AppText variant="control" style={styles.expectedValue} testID="checkout-due">
                  {formatEuroCents(settlement.dueCents)}
                </AppText>
              </View>
            </>
          )}
        </View>
        {blockingNotice}
        {note}

        <View style={styles.methods}>
          <PaymentMethodField
            error={state.cardError}
            method="CARD"
            onChangeText={changeAmount('CARD')}
            onFillRemaining={fillRemainder('CARD')}
            remainingCents={getRemainingExpectedCents(shortcutTargetCents, state.cashCents)}
            value={cardText}
          />
          <PaymentMethodField
            error={state.cashError}
            method="CASH"
            onChangeText={changeAmount('CASH')}
            onFillRemaining={fillRemainder('CASH')}
            remainingCents={getRemainingExpectedCents(shortcutTargetCents, state.cardCents)}
            value={cashText}
          />
        </View>

        <View style={styles.entered}>
          <View style={styles.expectationRow}>
            <AppText variant="control" style={styles.enteredLabel}>
              Total encaissé
            </AppText>
            <AppText variant="summaryValue" style={styles.enteredValue} testID="checkout-entered-total">
              {state.enteredTotalCents === undefined ? '—' : formatEuroCents(state.enteredTotalCents)}
            </AppText>
          </View>
          {!allocation && state.differenceCents !== undefined && state.differenceCents !== 0 && (
            <AppText variant="metadata" style={styles.difference} testID="checkout-difference">
              Écart : {formatSignedEuroCents(state.differenceCents)}
            </AppText>
          )}
          {state.unallocatedCents !== undefined && (state.enteredTotalCents ?? 0) > 0 && (
            <AppText
              accessibilityLiveRegion="polite"
              variant="metadata"
              style={styles.difference}
              testID="checkout-unallocated"
            >
              Reste à répartir : {formatEuroCents(state.unallocatedCents)}
            </AppText>
          )}
          {state.exceedsAllocation && (
            <AppText
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
              variant="metadata"
              style={styles.allocationError}
              testID="checkout-exceeds"
            >
              Le montant dépasse le reste à encaisser.
            </AppText>
          )}
        </View>
        {paymentDate}
      </View>
    </BottomSheet>
  );
}

function ExpectationRow({
  label,
  value,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly testID: string | undefined;
}) {
  return (
    <View style={styles.expectationRow}>
      <AppText variant="metadata" style={styles.expectationLabel}>
        {label}
      </AppText>
      <AppText variant="metadata" style={styles.expectationValue} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

interface PaymentMethodFieldProps {
  readonly method: PaymentMethod;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly error: string | undefined;
  /** Remaining expected amount the professional may fill in with one tap. */
  readonly remainingCents: number;
  /** The « Reste » tap; receives the remaining amount as text. */
  readonly onFillRemaining: (text: string) => void;
}

function PaymentMethodField({
  method,
  value,
  onChangeText,
  error,
  remainingCents,
  onFillRemaining,
}: PaymentMethodFieldProps) {
  const [focused, setFocused] = useState(false);
  // iOS binds one accessory view to ONE text input, once, when it mounts
  // (React Native looks up the first input carrying its `nativeID`). Each
  // amount field therefore binds its own instance of the shared « OK », with
  // a stable id: both pads have it before either is focused, and moving
  // Carte ⇄ Espèces swaps two identical pills without closing the keyboard.
  const keyboardAccessoryID = useId();
  const label = paymentMethodLabels[method];
  const key = method.toLowerCase();
  const showRemaining = value.trim().length === 0 && remainingCents > 0;

  return (
    <View
      style={[styles.method, focused && styles.methodFocused, error && styles.methodInvalid]}
      testID={`checkout-method-${key}`}
    >
      <View style={styles.methodIcon}>
        <SymbolView name={paymentMethodIcons[method]} size={18} tintColor={semanticColors.accent} />
      </View>
      <View style={styles.methodCopy}>
        <AppText variant="control" style={styles.methodLabel}>
          {label}
        </AppText>
        {error ? (
          <AppText variant="metadata" style={styles.methodError}>
            {error}
          </AppText>
        ) : (
          showRemaining && (
            <Pressable
              accessibilityLabel={`Saisir le reste en ${label.toLowerCase()}, ${formatEuroCents(remainingCents)}`}
              accessibilityRole="button"
              hitSlop={spacing.xs}
              onPress={() => onFillRemaining(formatCentsAsInput(remainingCents))}
              style={({ pressed }) => [styles.remaining, pressed && styles.remainingPressed]}
              testID={`checkout-fill-${key}`}
            >
              <AppText variant="chip" style={styles.remainingText}>
                Reste {formatEuroCents(remainingCents)}
              </AppText>
            </Pressable>
          )
        )}
      </View>
      <View style={styles.amountShell}>
        <TextInput
          accessibilityLabel={`Montant ${label.toLowerCase()}`}
          // The decimal pad has no return key: the compact BeautIzzy « OK »
          // replaces React Native's full-width system toolbar.
          inputAccessoryViewID={keyboardAccessoryID}
          keyboardType="decimal-pad"
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder="0,00"
          placeholderTextColor={semanticColors.foregroundMuted}
          selectTextOnFocus
          style={styles.amountInput}
          testID={`checkout-amount-${key}`}
          textAlign="right"
          value={value}
        />
        <AppText variant="control" style={styles.currency}>
          €
        </AppText>
      </View>
      {/* Absolutely positioned by React Native: never part of the row layout. */}
      <KeyboardDismissAccessory nativeID={keyboardAccessoryID} testID={`checkout-keyboard-dismiss-${key}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.xs },
  expectation: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  expectationRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  expectationLabel: { color: foregroundSoft },
  expectationValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  divider: { backgroundColor: semanticColors.borderLavender, height: StyleSheet.hairlineWidth },
  expectedLabel: { color: semanticColors.foreground },
  expectedValue: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  methods: { gap: spacing.sm },
  method: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  methodFocused: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.accent,
  },
  methodInvalid: {
    backgroundColor: semanticColors.surfaceRose,
    borderColor: rose.rose600,
  },
  methodIcon: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  methodCopy: { flex: 1, gap: 2, minWidth: 0 },
  methodLabel: { color: semanticColors.foreground },
  methodError: { color: rose.rose600 },
  remaining: { alignSelf: 'flex-start', paddingVertical: 2 },
  remainingPressed: { opacity: 0.6 },
  remainingText: { color: semanticColors.accent },
  amountShell: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  amountInput: {
    color: semanticColors.foreground,
    fontFamily: fontFamilies['600'],
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    minWidth: 96,
    paddingVertical: 0,
  },
  currency: { color: foregroundSoft },
  entered: { gap: spacing.xs, paddingHorizontal: spacing.xs },
  enteredLabel: { color: semanticColors.foreground },
  enteredValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  difference: { color: foregroundSoft, fontVariant: ['tabular-nums'], textAlign: 'right' },
  allocationError: { color: rose.rose600, textAlign: 'right' },
});

// BeautIzzy — « Acompte » control (Appointment creation, Résumé step)
//
// The optional entry of a deposit ALREADY received from the client, recorded
// with the new Appointment. Deliberately secondary, in the same family as the
// « Réduction » row above it: ONE collapsed row (« Acompte · Aucun ») until
// the professional opens it. Open, it shows the quick amounts of « Prendre un
// acompte » (10 / 20 / 30 / 50 €, only those that fit), ONE free entry
// (« Montant de l'acompte », French decimals), the Carte / Espèces switch, and
// — once the entry reads — the position it leaves: Total attendu, Acompte
// encaissé, Reste à encaisser, with « Aucun acompte » to remove it.
//
// It registers money the professional HAS received, outside the app. It
// charges nothing, collects nothing, preselects nothing: inactive by default,
// and a no-show warning never fills it in.
//
// DRAFT state only — the parent owns the draft and saves it with the
// Appointment in ONE transaction. Nothing is computed here: the position and
// every refusal come from the pure draft rules (`deposit-draft.ts`), which ask
// THE domain deposit rule. The amount text is kept as typed (`30,` must
// survive while typing) and re-read on every render, so a changed price or
// discount re-validates it at once; an entry that cannot be saved turns rose
// and names the reason.
//
// The deposit id is created when the draft starts (`createAppointmentDepositId`)
// and kept until the draft is removed: a repeated save reuses it and is
// refused, never duplicated.
//
// Haptics: ONE subtle selection tick per real change — a quick amount, the
// removal; the method switch ticks by itself (SegmentedControl). Typing ticks
// nothing. The banknote glyph is decorative and hidden from accessibility.

import { useId, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import type { PaymentMethod } from '@/domain/appointments';
import { cashRegisterIcon, paymentMethodLabels } from '@/shared/icons/payment-method-icons';
import { haptics } from '@/shared/lib/haptics';
import { formatCentsAsInput, formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { DisclosureChevron } from '@/shared/ui/DisclosureChevron';
import { useFormScrollView } from '@/shared/ui/FormScrollView';
import { KeyboardDismissAccessory } from '@/shared/ui/KeyboardDismissAccessory';
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import {
  fontFamilies,
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
  DEPOSIT_QUICK_AMOUNTS_CENTS,
  isQuickDepositAmountAvailable,
} from '../../deposits/deposit-form';
import { createAppointmentDepositId } from '../../deposits/runtime-ids';
import type { CreationDepositDraft, CreationDepositState } from '../deposit-draft';

export const CREATION_DEPOSIT_TITLE = 'Acompte';
export const CREATION_DEPOSIT_HINT = 'Ajouter un acompte reçu';
export const CREATION_DEPOSIT_CAPTION =
  'Montant déjà reçu du client, enregistré avec le rendez-vous.';

interface CreationDepositEditorProps {
  readonly draft: CreationDepositDraft | undefined;
  /** Derived by the screen from the draft and the current services total. */
  readonly state: CreationDepositState;
  readonly onChange: (draft: CreationDepositDraft | undefined) => void;
}

const methodOptions: readonly SegmentedControlOption<PaymentMethod>[] = [
  { value: 'CARD', label: paymentMethodLabels.CARD, testID: 'creation-deposit-method-card' },
  { value: 'CASH', label: paymentMethodLabels.CASH, testID: 'creation-deposit-method-cash' },
];

const minimumTouchTarget = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];
const chipHeight = 40;
const chipTouchSlop = Math.max(0, (minimumTouchTarget - chipHeight) / 2);
const chipHitSlop = { bottom: chipTouchSlop, top: chipTouchSlop } as const;

function formatQuickAmount(cents: number): string {
  return `${cents / 100} €`;
}

/** `30,00 € · Carte` once the entry reads; `Aucun` otherwise. */
export function formatCreationDepositSummary(state: CreationDepositState): string {
  if (!state.deposit) return 'Aucun';
  return `${formatEuroCents(state.deposit.amountCents)} · ${paymentMethodLabels[state.deposit.paymentMethod]}`;
}

/** `Acompte, 30,00 € par carte` / `Acompte, aucun` — the spoken row. */
export function formatCreationDepositAccessibilityLabel(state: CreationDepositState): string {
  if (!state.deposit) return `${CREATION_DEPOSIT_TITLE}, aucun`;
  return `${CREATION_DEPOSIT_TITLE}, ${formatEuroCents(state.deposit.amountCents)} par ${paymentMethodLabels[state.deposit.paymentMethod].toLowerCase()}`;
}

export function CreationDepositEditor({ draft, state, onChange }: CreationDepositEditorProps) {
  const [expanded, setExpanded] = useState(draft !== undefined);
  const keyboardAccessoryID = useId();
  // The entry sits low on the Résumé: the form keeps it visible above the keyboard.
  const formScroll = useFormScrollView();
  const method = draft?.paymentMethod ?? 'CARD';
  const amountText = draft?.amountText ?? '';
  const { form, position } = state;
  const hasEntry = amountText.trim().length > 0;

  // The draft starts with its ONE id on the first real entry; later changes
  // keep that id. Removing the deposit drops the draft, id included.
  const startOrUpdate = (changes: Partial<Omit<CreationDepositDraft, 'id'>>) => {
    onChange({
      id: draft?.id ?? createAppointmentDepositId(),
      amountText,
      paymentMethod: method,
      ...changes,
    });
  };

  const chooseQuickAmount = (cents: number) => {
    const text = formatCentsAsInput(cents);
    if (text === amountText) return;
    haptics.selection();
    startOrUpdate({ amountText: text });
  };

  const typeAmount = (text: string) => {
    if (text === amountText) return;
    startOrUpdate({ amountText: text });
  };

  const switchMethod = (next: PaymentMethod) => {
    if (next === method) return;
    startOrUpdate({ paymentMethod: next });
  };

  const clear = () => {
    haptics.selection();
    onChange(undefined);
  };

  return (
    <View style={styles.container} testID="creation-deposit">
      <Pressable
        accessibilityHint={CREATION_DEPOSIT_HINT}
        accessibilityLabel={formatCreationDepositAccessibilityLabel(state)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        testID="creation-deposit-toggle"
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="creation-deposit-icon"
        >
          <SymbolView name={cashRegisterIcon} size={16} tintColor={semanticColors.accent} />
        </View>
        <AppText variant="control" style={styles.title}>
          {CREATION_DEPOSIT_TITLE}
        </AppText>
        <AppText
          variant="metadata"
          style={state.deposit ? styles.summaryActive : styles.summary}
          testID="creation-deposit-summary"
        >
          {formatCreationDepositSummary(state)}
        </AppText>
        <DisclosureChevron expanded={expanded} />
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          <AppText variant="metadata" style={styles.caption}>
            {CREATION_DEPOSIT_CAPTION}
          </AppText>

          <View style={styles.presets} testID="creation-deposit-quick-amounts">
            {DEPOSIT_QUICK_AMOUNTS_CENTS.filter((cents) =>
              isQuickDepositAmountAvailable(cents, position),
            ).map((cents) => {
              const selected = form.amountCents === cents;
              return (
                <Pressable
                  accessibilityLabel={`Acompte de ${formatEuroCents(cents)}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  hitSlop={chipHitSlop}
                  key={cents}
                  onPress={() => chooseQuickAmount(cents)}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`creation-deposit-quick-${cents}`}
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

          <View style={styles.entry}>
            <View
              style={[styles.entryField, form.error !== undefined && styles.entryFieldInvalid]}
              testID="creation-deposit-entry"
            >
              <AppText variant="control" style={styles.entryLabel}>
                Montant de l’acompte
              </AppText>
              <TextInput
                accessibilityLabel="Montant de l’acompte"
                // The decimal pad has no return key: the compact BeautIzzy
                // « OK » replaces React Native's full-width system toolbar.
                inputAccessoryViewID={keyboardAccessoryID}
                keyboardType="decimal-pad"
                onChangeText={typeAmount}
                onFocus={() => formScroll?.revealFocusedInput()}
                placeholder="0,00"
                placeholderTextColor={semanticColors.foregroundMuted}
                returnKeyType="done"
                selectTextOnFocus
                style={styles.entryInput}
                testID="creation-deposit-amount"
                textAlign="right"
                value={amountText}
              />
              <AppText variant="control" style={styles.entryUnit}>
                €
              </AppText>
            </View>
            {form.error !== undefined && (
              <AppText
                accessibilityLiveRegion="polite"
                variant="metadata"
                style={styles.entryError}
                testID="creation-deposit-error"
              >
                {form.error}
              </AppText>
            )}
            {/* Absolutely positioned by React Native: never part of the layout. */}
            <KeyboardDismissAccessory
              nativeID={keyboardAccessoryID}
              testID="creation-deposit-keyboard-dismiss"
            />
          </View>

          <SegmentedControl
            onChange={switchMethod}
            options={methodOptions}
            stretch
            testID="creation-deposit-method"
            value={method}
          />

          {hasEntry && (
            <View style={styles.footer}>
              {state.deposit && (
                <View style={styles.position} testID="creation-deposit-position">
                  <PositionRow
                    label="Total attendu"
                    testID="creation-deposit-expected-total"
                    value={formatEuroCents(position.expectedTotalCents)}
                  />
                  <PositionRow
                    label="Acompte encaissé"
                    testID="creation-deposit-collected"
                    value={formatEuroCents(state.deposit.amountCents)}
                  />
                  <View
                    accessible
                    accessibilityLabel={`Reste à encaisser, ${formatEuroCents(form.remainingAfterCents)}`}
                    style={styles.positionRow}
                  >
                    <AppText variant="metadata" style={styles.remainingLabel}>
                      Reste à encaisser
                    </AppText>
                    <AppText
                      variant="control"
                      style={styles.remainingValue}
                      testID="creation-deposit-remaining"
                    >
                      {formatEuroCents(form.remainingAfterCents)}
                    </AppText>
                  </View>
                </View>
              )}
              <Pressable
                accessibilityLabel="Supprimer l’acompte"
                accessibilityRole="button"
                hitSlop={spacing.sm}
                onPress={clear}
                style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
                testID="creation-deposit-clear"
              >
                <AppText variant="metadata" style={styles.clearText}>
                  Aucun acompte
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
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
  // The white grouped row of the Résumé, like « Réduction » above it.
  container: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.base,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: minimumTouchTarget,
  },
  title: { color: semanticColors.foreground, flex: 1 },
  summary: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  summaryActive: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  body: { gap: spacing.md, paddingBottom: spacing.base },
  caption: { color: foregroundSoft },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1,
    flexBasis: '20%',
    flexGrow: 1,
    height: chipHeight,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: lavender.lav100,
    borderColor: semanticColors.accent,
    borderWidth: 1.5,
  },
  chipText: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  chipTextSelected: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  entry: { gap: spacing.xs },
  entryField: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.md,
  },
  entryFieldInvalid: { backgroundColor: semanticColors.surfaceRose, borderColor: rose.rose600 },
  entryLabel: { color: foregroundSoft, flex: 1 },
  entryInput: {
    color: semanticColors.foreground,
    fontFamily: fontFamilies['600'],
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    minWidth: 88,
    paddingVertical: 0,
  },
  entryUnit: { color: foregroundSoft },
  entryError: { color: rose.rose600 },
  footer: { gap: spacing.xs },
  position: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  positionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  positionLabel: { color: foregroundSoft },
  positionValue: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  remainingLabel: { color: semanticColors.foreground },
  remainingValue: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  clear: { alignSelf: 'flex-end', justifyContent: 'center', minHeight: 32 },
  clearText: { color: semanticColors.accent },
  pressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
});

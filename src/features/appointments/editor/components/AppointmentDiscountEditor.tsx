// BeautIzzy — « Réduction » control (Appointment creation, editing, checkout)
//
// Deliberately secondary: most Appointments carry no discount, so the block
// is ONE collapsed row (« Réduction · Aucune ») until the professional opens
// it. Open, it shows the % / € switch, the ten quick presets of that mode,
// ONE free entry (« Autre pourcentage » / « Autre montant ») for any other
// value, and « Aucune réduction » once a discount is chosen.
//
// DRAFT state only — the parent owns the discount and persists it with the
// rest of the Appointment. Nothing is computed here: the gross → discount →
// net amounts come from the ONE domain derivation, passed in as
// `servicesTotal`; the free entry is read by the pure entry rules
// (`discount-entry.ts`). A discount is a normal professional action: lavender
// identity, never a warning colour — only an unreadable entry turns rose. The
// chosen value is always written in the header row, so selection never
// relies on colour alone.
//
// Presets and the free entry are two ways of choosing the SAME value: a
// preset selects its chip and empties the entry; a typed value deselects
// every chip; a discount that is not a preset reopens with its text in the
// entry. The text is local (`7,` must survive while typing) and the entry
// hands the parent a value on every readable change, or `undefined` once it
// is empty or unreadable.
//
// Haptics: ONE subtle selection tick per real change — a new preset, the
// removal, and the % / € switch (given by SegmentedControl itself, only when
// the mode changes). Re-tapping the chosen preset is a no-op: no tick, no
// `onChange`. Typing ticks nothing. The price-tag icon is decorative and
// hidden from accessibility.
//
// Disclosure: the block opens and closes itself. A parent that needs to open
// it from outside (the birthday suggestion, AppointmentDiscountSection) passes
// `expanded` + `onExpandedChange` and owns that one boolean instead.

import { useId, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

import {
  areAppointmentDiscountsEqual,
  type AppointmentDiscount,
  type AppointmentServicesTotal,
} from '@/domain/appointments';
import {
  formatDiscountAmount,
  formatDiscountSpokenValue,
} from '@/features/appointments/presentation';
import { discountIcon } from '@/shared/icons/discount-icon';
import { haptics } from '@/shared/lib/haptics';
import { formatEuroCents } from '@/shared/lib/money';
import { AppText } from '@/shared/ui/AppText';
import { DisclosureChevron } from '@/shared/ui/DisclosureChevron';
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
  DISCOUNT_ENTRY_MAX_LENGTH,
  deriveDiscountEntryState,
  formatDiscountEntryText,
} from '../discount-entry';
import {
  formatDiscountPresetLabel,
  getDiscountPresetKey,
  getDiscountPresets,
  type AppointmentDiscountMode,
} from '../discount-presets';

interface AppointmentDiscountEditorProps {
  readonly discount: AppointmentDiscount | undefined;
  /** Gross, applied discount and net of the draft, from the domain. */
  readonly servicesTotal: AppointmentServicesTotal;
  readonly onChange: (discount: AppointmentDiscount | undefined) => void;
  /** Controlled disclosure; leave both undefined for the self-managed block. */
  readonly expanded?: boolean;
  readonly onExpandedChange?: (expanded: boolean) => void;
  /** Surface override (the white grouped row of « Modifier le rendez-vous »). */
  readonly style?: StyleProp<ViewStyle>;
}

const modeOptions: readonly SegmentedControlOption<AppointmentDiscountMode>[] = [
  { value: 'PERCENT', label: '%', accessibilityLabel: 'Réduction en pourcentage' },
  { value: 'FIXED', label: '€', accessibilityLabel: 'Réduction en euros' },
];

const entryCopy = {
  PERCENT: {
    label: 'Autre pourcentage',
    accessibilityLabel: 'Pourcentage de réduction',
    placeholder: '0',
    unit: '%',
    keyboardType: 'number-pad',
  },
  FIXED: {
    label: 'Autre montant',
    accessibilityLabel: 'Montant de la réduction',
    placeholder: '0,00',
    unit: '€',
    keyboardType: 'decimal-pad',
  },
} as const;

const minimumTouchTarget = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];
const chipHeight = 40;
const chipTouchSlop = Math.max(0, (minimumTouchTarget - chipHeight) / 2);
const chipHitSlop = { bottom: chipTouchSlop, top: chipTouchSlop } as const;

function formatDiscountSummary(
  discount: AppointmentDiscount | undefined,
  discountCents: number,
): string {
  if (!discount) return 'Aucune';
  const amount = formatDiscountAmount(discountCents);
  return discount.type === 'PERCENT' ? `-${discount.percent} % · ${amount}` : amount;
}

export function AppointmentDiscountEditor({
  discount,
  servicesTotal,
  onChange,
  expanded: controlledExpanded,
  onExpandedChange,
  style,
}: AppointmentDiscountEditorProps) {
  const [ownExpanded, setOwnExpanded] = useState(discount !== undefined);
  const expanded = controlledExpanded ?? ownExpanded;
  const [mode, setMode] = useState<AppointmentDiscountMode>(discount?.type ?? 'PERCENT');
  // The free entry's own text: a custom discount reopens with it, a preset
  // leaves it empty. Kept as typed so `7,` survives until the next digit.
  const [entryText, setEntryText] = useState(() => formatDiscountEntryText(discount, mode));
  const keyboardAccessoryID = useId();
  const summary = formatDiscountSummary(discount, servicesTotal.discountCents);
  const entry = deriveDiscountEntryState(mode, entryText);
  const copy = entryCopy[mode];
  // A fixed amount above the services total is applied in full by the domain
  // clamp (the net is zero): said in words, never silently.
  const clamped = discount?.type === 'FIXED' && discount.amountCents > servicesTotal.grossCents;

  const choose = (preset: AppointmentDiscount) => {
    setEntryText('');
    if (areAppointmentDiscountsEqual(preset, discount)) return;
    haptics.selection();
    onChange(preset);
  };

  const typeEntry = (text: string) => {
    setEntryText(text);
    const next = deriveDiscountEntryState(mode, text).discount;
    if (areAppointmentDiscountsEqual(next, discount)) return;
    onChange(next);
  };

  const switchMode = (next: AppointmentDiscountMode) => {
    if (next === mode) return;
    setMode(next);
    setEntryText(formatDiscountEntryText(discount, next));
  };

  const clear = () => {
    setEntryText('');
    haptics.selection();
    onChange(undefined);
  };

  const toggleExpanded = () => {
    setOwnExpanded(!expanded);
    onExpandedChange?.(!expanded);
  };

  return (
    <View style={[styles.container, style]} testID="appointment-discount">
      <Pressable
        accessibilityLabel={
          discount
            ? `Réduction, ${formatDiscountSpokenValue(discount)}`
            : 'Réduction, aucune'
        }
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggleExpanded}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        testID="appointment-discount-toggle"
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="appointment-discount-icon"
        >
          <SymbolView name={discountIcon} size={16} tintColor={semanticColors.accent} />
        </View>
        <AppText variant="control" style={styles.title}>
          Réduction
        </AppText>
        <AppText
          variant="metadata"
          style={discount ? styles.summaryActive : styles.summary}
          testID="appointment-discount-summary"
        >
          {summary}
        </AppText>
        <DisclosureChevron expanded={expanded} />
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          <SegmentedControl
            onChange={switchMode}
            options={modeOptions}
            testID="appointment-discount-mode"
            value={mode}
          />

          <View style={styles.presets} testID="appointment-discount-presets">
            {getDiscountPresets(mode).map((preset) => {
              const selected = areAppointmentDiscountsEqual(preset, discount);
              return (
                <Pressable
                  accessibilityLabel={`Réduction de ${formatDiscountSpokenValue(preset)}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  hitSlop={chipHitSlop}
                  key={getDiscountPresetKey(preset)}
                  onPress={() => choose(preset)}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`appointment-discount-preset-${getDiscountPresetKey(preset)}`}
                >
                  <AppText
                    variant={selected ? 'control' : 'metadata'}
                    style={selected ? styles.chipTextSelected : styles.chipText}
                  >
                    {formatDiscountPresetLabel(preset)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.entry}>
            <View
              style={[styles.entryField, entry.error !== undefined && styles.entryFieldInvalid]}
              testID="appointment-discount-entry"
            >
              <AppText variant="control" style={styles.entryLabel}>
                {copy.label}
              </AppText>
              <TextInput
                accessibilityLabel={copy.accessibilityLabel}
                // The numeric pads have no return key: the compact BeautIzzy
                // « OK » replaces React Native's full-width system toolbar.
                inputAccessoryViewID={keyboardAccessoryID}
                keyboardType={copy.keyboardType}
                maxLength={DISCOUNT_ENTRY_MAX_LENGTH[mode]}
                onChangeText={typeEntry}
                placeholder={copy.placeholder}
                placeholderTextColor={semanticColors.foregroundMuted}
                returnKeyType="done"
                selectTextOnFocus
                style={styles.entryInput}
                testID="appointment-discount-entry-input"
                textAlign="right"
                value={entryText}
              />
              <AppText variant="control" style={styles.entryUnit}>
                {copy.unit}
              </AppText>
            </View>
            {entry.error !== undefined && (
              <AppText
                accessibilityLiveRegion="polite"
                variant="metadata"
                style={styles.entryError}
                testID="appointment-discount-entry-error"
              >
                {entry.error}
              </AppText>
            )}
            {/* Absolutely positioned by React Native: never part of the layout. */}
            <KeyboardDismissAccessory
              nativeID={keyboardAccessoryID}
              testID="appointment-discount-keyboard-dismiss"
            />
          </View>

          {discount && (
            <View style={styles.footer}>
              {clamped && (
                <AppText variant="metadata" style={styles.clampedNote} testID="appointment-discount-clamped">
                  Limitée au total des prestations.
                </AppText>
              )}
              {/* The label stays quiet; the amount she will charge carries the weight. */}
              <View
                accessible
                accessibilityLabel={`Total après réduction ${formatEuroCents(servicesTotal.netCents)}`}
                style={styles.netTotalRow}
              >
                <AppText variant="metadata" style={styles.netTotalLabel}>
                  Total après réduction
                </AppText>
                <AppText
                  variant="control"
                  style={styles.netTotalValue}
                  testID="appointment-discount-net-total"
                >
                  {formatEuroCents(servicesTotal.netCents)}
                </AppText>
              </View>
              <Pressable
                accessibilityLabel="Supprimer la réduction"
                accessibilityRole="button"
                hitSlop={spacing.sm}
                onPress={clear}
                style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
                testID="appointment-discount-clear"
              >
                <AppText variant="metadata" style={styles.clearText}>
                  Aucune réduction
                </AppText>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.large,
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
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Five chips per row on every supported width: two tidy rows of presets.
  chip: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1,
    flexBasis: '17%',
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
  // The « Autre montant » field of the deposit sheet: white on the neutral
  // surface, a chip's hairline, rose only while the entry cannot be read.
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
  netTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  netTotalLabel: { color: foregroundSoft },
  clampedNote: { color: foregroundSoft },
  netTotalValue: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  clear: { alignSelf: 'flex-end', justifyContent: 'center', minHeight: 32 },
  clearText: { color: semanticColors.accent },
  pressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
});

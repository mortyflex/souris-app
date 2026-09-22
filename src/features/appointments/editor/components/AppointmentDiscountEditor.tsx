// Souris — « Réduction » control (Appointment creation and editing)
//
// Deliberately secondary: most Appointments carry no discount, so the block
// is ONE collapsed row (« Réduction · Aucune ») until the professional opens
// it. Open, it shows the % / € switch, the ten quick presets of that mode,
// and « Aucune réduction » once a discount is chosen.
//
// DRAFT state only — the parent owns the discount and persists it with the
// rest of the Appointment. Nothing is computed here: the gross → discount →
// net amounts come from the ONE domain derivation, passed in as
// `servicesTotal`. A discount is a normal professional action: lavender
// identity, never a warning colour. The chosen value is always written in
// the header row, so selection never relies on colour alone.
//
// Haptics: ONE subtle selection tick per real change — a new preset, the
// removal, and the % / € switch (given by SegmentedControl itself, only when
// the mode changes). Re-tapping the chosen preset is a no-op: no tick, no
// `onChange`. The price-tag icon is decorative and hidden from accessibility.
//
// Disclosure: the block opens and closes itself. A parent that needs to open
// it from outside (the birthday suggestion, AppointmentDiscountSection) passes
// `expanded` + `onExpandedChange` and owns that one boolean instead.

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
import { SegmentedControl, type SegmentedControlOption } from '@/shared/ui/SegmentedControl';
import {
  foregroundSoft,
  interaction,
  lavender,
  radii,
  semanticColors,
  spacing,
  touchTarget,
} from '@/shared/ui/theme';

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
  const summary = formatDiscountSummary(discount, servicesTotal.discountCents);

  const choose = (preset: AppointmentDiscount) => {
    if (areAppointmentDiscountsEqual(preset, discount)) return;
    haptics.selection();
    onChange(preset);
  };

  const clear = () => {
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
            onChange={setMode}
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

          {discount && (
            <View style={styles.footer}>
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
  footer: { gap: spacing.xs },
  netTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  netTotalLabel: { color: foregroundSoft },
  netTotalValue: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  clear: { alignSelf: 'flex-end', justifyContent: 'center', minHeight: 32 },
  clearText: { color: semanticColors.accent },
  pressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
});

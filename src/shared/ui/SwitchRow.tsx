// BeautIzzy — a labeled native switch row
//
// The ONE on/off row of the product (settings rows, the per-appointment
// reminder toggle): label (and optional supporting line) on the left, the
// native Switch on the right, the whole row accessible as one switch. Uses
// the platform Switch deliberately — an on/off setting is exactly where the
// native control belongs (CLAUDE.md §6).

import { Platform, StyleSheet, Switch, View } from 'react-native';

import { AppText } from './AppText';
import { semanticColors, spacing } from './theme';

interface SwitchRowProps {
  readonly label: string;
  /** Optional supporting line under the label. */
  readonly description?: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: SwitchRowProps) {
  // Android paints an untinted switch thumb with the AppCompat theme accent —
  // the stock teal, since the native theme declares no colorAccent — so the
  // thumb is told its colour explicitly: BeautIzzy white on the violet track,
  // the same reading as iOS. A disabled Android switch loses the native
  // dimming once its track is tinted, so its "on" track fades to the lavender
  // border tone instead. iOS keeps its own thumb and dimming untouched.
  const isAndroid = Platform.OS === 'android';
  const onTrackColor =
    isAndroid && disabled ? semanticColors.borderLavender : semanticColors.accent;

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.copy}>
        <AppText variant="rowTitle" numberOfLines={2}>
          {label}
        </AppText>
        {description !== undefined && (
          <AppText variant="metadata" style={styles.description}>
            {description}
          </AppText>
        )}
      </View>
      <Switch
        accessibilityLabel={accessibilityLabel ?? label}
        disabled={disabled}
        onValueChange={onValueChange}
        testID={testID ? `${testID}-switch` : undefined}
        thumbColor={isAndroid ? semanticColors.onAccent : undefined}
        trackColor={{ true: onTrackColor, false: undefined }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  description: { color: semanticColors.foregroundSoft },
});

// Souris — GroupedDataRow
//
// The editable-data row of the redesigned sheets (DESIGN_OVERRIDES.md §27):
// glyph + label on the left, value + chevron on the right, inside a
// GroupedSurface. The whole row is the action; no separate « Modifier » link.
// Without `onPress` the row is intentionally read-only: same row, no chevron,
// no button role.

import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "./AppText";
import { DisclosureChevron } from "./DisclosureChevron";
import { foregroundSoft, semanticColors, spacing } from "./theme";

const ICON_COLUMN = 22;
/** Separators start under the labels: row padding + glyph column + gap. */
export const GROUPED_DATA_ROW_SEPARATOR_INSET =
  spacing.base + ICON_COLUMN + spacing.md;

interface GroupedDataRowProps {
  readonly icon: SymbolViewProps["name"];
  readonly label: string;
  readonly value: string;
  /** Spoken in place of the compact visible value (e.g. a full date). */
  readonly accessibilityValueLabel?: string;
  /** Absent: the value is read-only (no chevron, not a button). */
  readonly onPress?: () => void;
  readonly accessibilityHint?: string;
  /** Rows that open inline turn their chevron; the others push a picker. */
  readonly expanded?: boolean;
  /** Quiet secondary line under the label (read-only context, e.g. origin). */
  readonly detail?: string;
  readonly testID: string;
}

export function GroupedDataRow({
  icon,
  label,
  value,
  accessibilityValueLabel,
  onPress,
  accessibilityHint,
  expanded,
  testID,
}: GroupedDataRowProps) {
  const accessibilityLabel = `${label}, ${accessibilityValueLabel ?? value}`;
  const content = (
    <>
      <View style={styles.iconColumn}>
        <SymbolView name={icon} size={17} tintColor={semanticColors.accent} />
      </View>
      <View style={styles.labelColumn}>
        <AppText variant="body" style={styles.label}>
          {label}
        </AppText>
      </View>
      <AppText
        variant="control"
        numberOfLines={1}
        style={styles.value}
        testID={`${testID}-value`}
      >
        {value}
      </AppText>
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        style={styles.row}
        testID={testID}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={testID}
    >
      {content}
      <DisclosureChevron expanded={expanded ?? false} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  iconColumn: { alignItems: "center", width: ICON_COLUMN },
  labelColumn: { flexShrink: 0 },
  label: { color: foregroundSoft },
  detail: { color: foregroundSoft },
  // The value takes the remaining width and truncates: a long client name
  // never pushes the chevron off screen.
  value: {
    color: semanticColors.foreground,
    flex: 1,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
});

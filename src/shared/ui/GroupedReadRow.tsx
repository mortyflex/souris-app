// Souris — GroupedReadRow
//
// The read-only « label  value » row of detail sheets, inside a
// GroupedSurface (separators: `GroupedSeparator` with
// GROUPED_READ_ROW_SEPARATOR_INSET). Secondary label in a fixed column, the
// stronger value aligned after it; a long value wraps to two lines rather
// than overflowing. No chevron, no button role.

import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { foregroundSoft, semanticColors, spacing } from './theme';

export const GROUPED_READ_ROW_SEPARATOR_INSET = spacing.base;

interface GroupedReadRowProps {
  readonly label: string;
  readonly value: string;
  readonly testID?: string;
}

export function GroupedReadRow({ label, value, testID }: GroupedReadRowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <AppText variant="body" style={styles.label}>
        {label}
      </AppText>
      <AppText variant="control" numberOfLines={2} selectable style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  label: { color: foregroundSoft, width: 112 },
  value: { color: semanticColors.foreground, flex: 1, fontVariant: ['tabular-nums'] },
});

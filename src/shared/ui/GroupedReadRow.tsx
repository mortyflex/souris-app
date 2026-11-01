// BeautIzzy — GroupedReadRow
//
// The read-only « label  value » row of detail sheets, inside a
// GroupedSurface (separators: `GroupedSeparator` with
// GROUPED_READ_ROW_SEPARATOR_INSET). Secondary label in a 112 pt column, the
// stronger value aligned after it; a long value wraps to two lines rather
// than overflowing. No chevron, no button role.
//
// The label column is a MINIMUM, never a cage: a label wider than it (« Remboursement »)
// takes its natural width instead of breaking mid-word, and when the label and a
// readable value no longer fit on one line — a compact iPhone, a larger text size —
// the value wraps UNDER the label (`flexWrap`). No screen width is assumed.

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

/** The label column: values line up after it; a longer label widens its own row only. */
export const GROUPED_READ_ROW_LABEL_MIN_WIDTH = 112;
/** Below this width a value is no longer comfortable beside its label: it wraps under it. */
export const GROUPED_READ_ROW_VALUE_MIN_WIDTH = 140;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    columnGap: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 50,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    rowGap: spacing.xs,
  },
  // Never narrower than the column, never wider than the row: a word wraps whole.
  label: { color: foregroundSoft, maxWidth: '100%', minWidth: GROUPED_READ_ROW_LABEL_MIN_WIDTH },
  // A readable minimum: rather than being squeezed beside a wide label, the value takes the next line.
  value: {
    color: semanticColors.foreground,
    flexBasis: GROUPED_READ_ROW_VALUE_MIN_WIDTH,
    flexGrow: 1,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
    minWidth: GROUPED_READ_ROW_VALUE_MIN_WIDTH,
  },
});

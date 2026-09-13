// Souris — SheetHeader
//
// The canonical drawer header (reference: the Plus › Compte sheet): an
// optional uppercase eyebrow, a large navy title that may wrap, and one text
// action at the top-right (« Fermer » / « Annuler »). Used by the shared
// BottomSheet and by every native sheet screen so all drawers read as one
// Souris surface. Content-agnostic: wording stays feature-owned.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { rose, semanticColors, spacing } from './theme';

export interface SheetHeaderAction {
  readonly label: string;
  readonly onPress: () => void;
  /** Defaults to the label. */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

interface SheetHeaderProps {
  readonly eyebrow?: string;
  readonly title: string;
  /** Accent (default) for regular drawers; danger for lifecycle/destructive sheets. */
  readonly tone?: 'accent' | 'danger';
  readonly action?: SheetHeaderAction;
  readonly titleNumberOfLines?: number;
  /** Adds the bottom hairline used by tall workflow sheets. */
  readonly divider?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function SheetHeader({
  eyebrow,
  title,
  tone = 'accent',
  action,
  titleNumberOfLines = 2,
  divider = false,
  style,
  testID,
}: SheetHeaderProps) {
  return (
    <View style={[styles.header, divider && styles.divider, style]} testID={testID}>
      <View style={styles.copy}>
        {eyebrow && (
          <AppText variant="eyebrow" style={tone === 'danger' ? styles.dangerEyebrow : styles.eyebrow}>
            {eyebrow}
          </AppText>
        )}
        <AppText accessibilityRole="header" numberOfLines={titleNumberOfLines} variant="sheetTitle">
          {title}
        </AppText>
      </View>
      {action && (
        <AppButton
          accessibilityLabel={action.accessibilityLabel ?? action.label}
          onPress={action.onPress}
          style={styles.action}
          testID={action.testID}
          title={action.label}
          variant="tertiary"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.md,
  },
  divider: {
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  eyebrow: { color: semanticColors.accent },
  dangerEyebrow: { color: rose.rose600 },
  action: { paddingHorizontal: spacing.md },
});

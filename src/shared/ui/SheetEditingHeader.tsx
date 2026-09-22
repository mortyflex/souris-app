// Souris — SheetEditingHeader
//
// The canonical header of creation / editing sheets (DESIGN_OVERRIDES.md §30):
// « Annuler » leading, then ONE title — « Nouveau rendez-vous », « Modifier le
// rendez-vous », « Nouvelle vente ». No eyebrow. The trailing slot is reserved
// for a DISTINCT action (never a second « Annuler »). The grabber stays above,
// drawn by the sheet shell.
//
// Place it in a container padded by the sheet gutter: the leading button's
// own padding is pulled back so its text lines up with the content below.
// Content-agnostic: wording and the cancel handler stay feature-owned.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import type { SheetHeaderAction } from './SheetHeader';
import { semanticColors, spacing } from './theme';

interface SheetEditingHeaderProps {
  readonly title: string;
  readonly onCancel: () => void;
  /** Defaults to « Annuler ». */
  readonly cancelLabel?: string;
  /** Spoken label of the cancel action; defaults to the label. */
  readonly cancelAccessibilityLabel?: string;
  readonly cancelTestID?: string;
  /** A distinct trailing action (« Enregistrer », …). Never Cancel. */
  readonly rightAction?: SheetHeaderAction;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function SheetEditingHeader({
  title,
  onCancel,
  cancelLabel = 'Annuler',
  cancelAccessibilityLabel,
  cancelTestID,
  rightAction,
  style,
  testID,
}: SheetEditingHeaderProps) {
  return (
    <View style={[styles.header, style]} testID={testID}>
      <AppButton
        accessibilityLabel={cancelAccessibilityLabel ?? cancelLabel}
        onPress={onCancel}
        style={styles.action}
        testID={cancelTestID}
        title={cancelLabel}
        variant="tertiary"
      />
      <AppText
        accessibilityRole="header"
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        numberOfLines={1}
        style={styles.title}
        variant="sectionTitle"
      >
        {title}
      </AppText>
      {rightAction && (
        <AppButton
          accessibilityLabel={rightAction.accessibilityLabel ?? rightAction.label}
          onPress={rightAction.onPress}
          style={styles.action}
          testID={rightAction.testID}
          title={rightAction.label}
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
    gap: spacing.xs,
    marginHorizontal: -spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  action: { paddingHorizontal: spacing.md },
  title: { color: semanticColors.foreground, flex: 1 },
});

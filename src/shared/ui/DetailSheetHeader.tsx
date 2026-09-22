// Souris — DetailSheetHeader
//
// The canonical header of DETAIL sheets (Product, Prestation): the object's
// name as the heading, then « ••• » (secondary actions) and × (close), both
// GlassIconButtons — the language of Appointment Details. No eyebrow: the
// object type is obvious from where the sheet was opened. The grabber stays
// above, drawn by the sheet shell.
//
// Creation / editing sheets use SheetEditingHeader (« Annuler » + title)
// instead; a details sheet never shows « Annuler ».
//
// Place it in a container padded by the sheet gutter. Content-agnostic:
// wording and handlers stay feature-owned.

import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { GlassIconButton, glassIcons } from './GlassIconButton';
import { semanticColors, spacing } from './theme';

interface DetailSheetHeaderProps {
  readonly title: string;
  /** Spoken label of « ••• », e.g. « Actions du produit ». */
  readonly actionsAccessibilityLabel: string;
  readonly onOpenActions: () => void;
  readonly onClose: () => void;
  readonly actionsTestID?: string;
  readonly closeTestID?: string;
  readonly testID?: string;
}

export function DetailSheetHeader({
  title,
  actionsAccessibilityLabel,
  onOpenActions,
  onClose,
  actionsTestID,
  closeTestID,
  testID,
}: DetailSheetHeaderProps) {
  return (
    <View style={styles.header} testID={testID}>
      {/* Up to two lines; the buttons keep their own column, never overlapped. */}
      <AppText
        accessibilityRole="header"
        numberOfLines={2}
        selectable
        style={styles.title}
        variant="sheetTitle"
      >
        {title}
      </AppText>
      <View style={styles.actions}>
        <GlassIconButton
          accessibilityLabel={actionsAccessibilityLabel}
          icon={glassIcons.more}
          onPress={onOpenActions}
          testID={actionsTestID}
        />
        <GlassIconButton
          accessibilityLabel="Fermer"
          icon={glassIcons.close}
          onPress={onClose}
          testID={closeTestID}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  title: { color: semanticColors.foreground, flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: spacing.sm },
});

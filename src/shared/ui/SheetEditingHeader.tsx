// Souris — SheetEditingHeader
//
// The canonical header of creation / editing sheets (DESIGN_OVERRIDES.md §30):
// « Annuler » leading, ONE title centered on the header — « Nouveau
// rendez-vous », « Modifier le rendez-vous », « Nouvelle vente », « Encaisser
// le rendez-vous ». No eyebrow. The trailing slot is reserved for a DISTINCT
// action (never a second « Annuler »). A picker that only dismisses passes
// `cancelLabel="Fermer"` (« Choisir la cliente »). The grabber stays above,
// drawn by the sheet shell.
//
// Centering: the actions stay in the row; the title lives in its own layer
// spanning the whole header, inset by the SAME amount on both sides — the
// width of the wider side action, measured. It is therefore centered on the
// header whatever the width of « Annuler », and a long title truncates before
// it can reach either action. No empty placeholder button.
//
// Fixed title size, no `adjustsFontSizeToFit`: measured during a sheet's
// entry animation it shrank the title to an unreadable size and never grew
// back (the checkout sheet).
//
// Place it in a container padded by the sheet gutter: the leading button's
// own padding is pulled back so its text lines up with the content below.
// Content-agnostic: wording and the cancel handler stay feature-owned.

import { useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

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

/**
 * Side reserved for the title before the actions are measured: about the
 * width of « Annuler » with its padding, so the first frame is already
 * centered and clear of it.
 */
const INITIAL_SIDE_INSET = 96;

function measuredWidth(event: LayoutChangeEvent): number {
  return Math.ceil(event.nativeEvent.layout.width);
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
  const [leadingWidth, setLeadingWidth] = useState<number>();
  const [trailingWidth, setTrailingWidth] = useState(0);
  const sideInset = Math.max(leadingWidth ?? INITIAL_SIDE_INSET, rightAction ? trailingWidth : 0);

  return (
    <View style={[styles.header, style]} testID={testID}>
      <View onLayout={(event) => setLeadingWidth(measuredWidth(event))} testID="sheet-editing-header-leading">
        <AppButton
          accessibilityLabel={cancelAccessibilityLabel ?? cancelLabel}
          onPress={onCancel}
          style={styles.action}
          testID={cancelTestID}
          title={cancelLabel}
          variant="tertiary"
        />
      </View>
      <View
        pointerEvents="none"
        style={[styles.titleLayer, { left: sideInset, right: sideInset }]}
        testID="sheet-editing-header-title"
      >
        <AppText
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.title}
          variant="sectionTitle"
        >
          {title}
        </AppText>
      </View>
      {rightAction && (
        <View
          onLayout={(event) => setTrailingWidth(measuredWidth(event))}
          style={styles.trailing}
          testID="sheet-editing-header-trailing"
        >
          <AppButton
            accessibilityLabel={rightAction.accessibilityLabel ?? rightAction.label}
            onPress={rightAction.onPress}
            style={styles.action}
            testID={rightAction.testID}
            title={rightAction.label}
            variant="tertiary"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginHorizontal: -spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  action: { paddingHorizontal: spacing.md },
  // Spans the header (padding included) so centering is on the whole row.
  titleLayer: {
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
  },
  title: { color: semanticColors.foreground, textAlign: 'center' },
  trailing: { marginLeft: 'auto' },
});

// Souris — « ••• » secondary actions of Product Details
//
// The management actions leave the main sheet for ONE action list on the
// canonical Souris drawer (BottomSheet), like Appointment Details:
//
//   Désactiver le produit | Réactiver le produit    normal
//   ─────────────────────────
//   Supprimer le produit                            destructive, own group
//
// Choosing an action only reports it: the screen closes the list and runs it
// once the list is gone (`onDismissed`), so a confirmation dialog or a
// navigation never races the closing drawer. The confirmations themselves
// stay the screen's.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { radii, rose, semanticColors, spacing, touchTarget } from '@/shared/ui/theme';

export type ProductSecondaryAction = 'toggle-active' | 'delete';

interface ProductActionsSheetProps {
  readonly productName: string;
  readonly active: boolean;
  readonly visible: boolean;
  readonly onSelect: (action: ProductSecondaryAction) => void;
  readonly onClose: () => void;
  readonly onDismissed: () => void;
}

export function ProductActionsSheet({
  productName,
  active,
  visible,
  onSelect,
  onClose,
  onDismissed,
}: ProductActionsSheetProps) {
  return (
    <BottomSheet
      backdropLabel="Fermer les actions"
      header={<SheetHeader title={productName} titleNumberOfLines={1} />}
      onClose={onClose}
      onDismissed={onDismissed}
      testID="product-actions-sheet"
      visible={visible}
    >
      <View style={styles.body}>
        <View style={styles.group}>
          <ActionRow
            icon={active ? { ios: 'eye.slash', android: 'visibility_off' } : { ios: 'eye', android: 'visibility' }}
            label={active ? 'Désactiver le produit' : 'Réactiver le produit'}
            onPress={() => onSelect('toggle-active')}
            testID="toggle-product-active"
            tone="normal"
          />
        </View>
        <View style={styles.group}>
          <ActionRow
            accessibilityHint="Supprime le produit du catalogue"
            icon={{ ios: 'trash', android: 'delete' }}
            label="Supprimer le produit"
            onPress={() => onSelect('delete')}
            testID="open-product-deletion"
            tone="destructive"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const toneColors = {
  normal: { text: semanticColors.foreground, icon: semanticColors.accent },
  destructive: { text: rose.rose600, icon: rose.rose600 },
} as const;

function ActionRow({
  icon,
  label,
  tone,
  onPress,
  testID,
  accessibilityHint,
}: {
  readonly icon: SymbolViewProps['name'];
  readonly label: string;
  readonly tone: keyof typeof toneColors;
  readonly onPress: () => void;
  readonly testID: string;
  readonly accessibilityHint?: string;
}) {
  const colors = toneColors[tone];

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={testID}
    >
      <SymbolView name={icon} size={20} tintColor={colors.icon} />
      <AppText variant="control" numberOfLines={1} style={[styles.label, { color: colors.text }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.base, paddingTop: spacing.sm },
  group: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: touchTarget[Platform.OS === 'android' ? 'android' : 'ios'] + spacing.sm,
    paddingHorizontal: spacing.base,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  label: { flex: 1 },
});

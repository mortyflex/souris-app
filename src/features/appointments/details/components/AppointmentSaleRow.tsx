// Souris — « Ajouter une vente » of Appointment Details
//
// The retail action of an Appointment (internally a Revente: a Sale linked
// to the Appointment) as ONE lightweight row: accent ⊕ glyph, accent label,
// chevron, on the same white grouped surface as the Prestations. Secondary
// by construction — the checkout footer is the one primary action. Absent
// for an archived Client (the screen decides and passes no handler).

import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, semanticColors, spacing, touchTarget } from '@/shared/ui/theme';

interface AppointmentSaleRowProps {
  readonly onPress: () => void;
}

export function AppointmentSaleRow({ onPress }: AppointmentSaleRowProps) {
  return (
    <Pressable
      accessibilityHint="Vendre un produit à cette cliente"
      accessibilityLabel="Ajouter une vente"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID="sell-product"
    >
      <SymbolView
        name={{ ios: 'plus.circle', android: 'add_circle' }}
        size={20}
        tintColor={semanticColors.accent}
      />
      <AppText variant="control" numberOfLines={1} style={styles.label}>
        Ajouter une vente
      </AppText>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={14}
        tintColor={semanticColors.accent}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    minHeight: touchTarget[Platform.OS === 'android' ? 'android' : 'ios'] + spacing.sm,
    paddingHorizontal: spacing.base,
  },
  pressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  label: { color: semanticColors.accent, flex: 1 },
});

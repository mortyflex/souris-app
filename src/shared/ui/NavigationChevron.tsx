// BeautIzzy — NavigationChevron
//
// The trailing « opens a detail » affordance of a directory row (Produits,
// Clientes): a small muted chevron at the end of the shared directory grid
// (directory-list.ts). Decorative: the whole row is the one navigation action,
// so the chevron is never a button, never a touch target and never an
// accessibility stop. Not the expand/collapse DisclosureChevron.

import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { semanticColors } from './theme';

interface NavigationChevronProps {
  readonly testID?: string;
}

export function NavigationChevron({ testID }: NavigationChevronProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.container}
      testID={testID}
    >
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={14}
        tintColor={semanticColors.foregroundMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
});

// BeautIzzy — the selection mark of onboarding choices
//
// One small circle shared by the activity tiles, the reminder card and the
// starter rows: a hairline ring at rest, the accent fill with a white check
// once selected. Decorative — the control that holds it announces its own
// selected state.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { radii, semanticColors } from '@/shared/ui/theme';

export const selectionCheckSize = 24;

interface SelectionCheckProps {
  readonly selected: boolean;
  readonly testID?: string;
}

export function SelectionCheck({ selected, testID }: SelectionCheckProps) {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.ring, selected && styles.selected]}
      testID={testID}
    >
      {selected && (
        <SymbolView
          name={{ ios: 'checkmark', android: 'check' }}
          size={13}
          tintColor={semanticColors.onAccent}
          weight="bold"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    borderColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: selectionCheckSize,
    justifyContent: 'center',
    width: selectionCheckSize,
  },
  selected: { backgroundColor: semanticColors.accent, borderColor: semanticColors.accent },
});

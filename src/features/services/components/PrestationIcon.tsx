// Souris — Prestation pictogram tile
//
// The compact, decorative family pictogram of Prestation Details: a rounded
// square on the category whisper, the family glyph in the category accent
// (prestation-visual.ts). Same shape family as the Product Details
// thumbnail, deliberately smaller, so it never outweighs the name or the
// price. Hidden from VoiceOver: the name and the written category already
// say everything.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import type { Service } from '@/domain/appointments';
import { radii } from '@/shared/ui/theme';

import { getPrestationVisual } from '../prestation-visual';

export const PRESTATION_ICON_TILE_SIZE = 80;

interface PrestationIconProps {
  readonly prestation: Pick<Service, 'name' | 'type'>;
  readonly testID?: string;
}

export function PrestationIcon({ prestation, testID = 'prestation-icon' }: PrestationIconProps) {
  const visual = getPrestationVisual(prestation);

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, { backgroundColor: visual.tint }]}
      testID={testID}
    >
      <SymbolView name={visual.icon} size={32} tintColor={visual.iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radii.large,
    height: PRESTATION_ICON_TILE_SIZE,
    justifyContent: 'center',
    width: PRESTATION_ICON_TILE_SIZE,
  },
});

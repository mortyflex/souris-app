// BeautIzzy — Prestation pictogram tile
//
// The compact, decorative family pictogram of a Prestation: a rounded square
// on the category whisper, the family glyph in the category accent
// (prestation-visual.ts — the ONE mapping). `detail` sits in Prestation
// Details, in the shape family of the Product Details thumbnail but smaller;
// `row` leads every row of Prestations & tarifs, so a Prestation is
// recognised from the list to its details. It never outweighs the name or the
// price. Hidden from VoiceOver: the name and the written category already
// say everything.
//
// `ServiceCategoryIcon` is the same tile for a professional category, from
// the same mapping (`getCategoryVisual`), so « Beauté des pieds » and its
// « Semi-permanent pieds » carry the same foot.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import type { Service } from '@/domain/appointments';
import type { ServiceCategory } from '@/domain/services';
import { radii } from '@/shared/ui/theme';

import { getCategoryVisual, getPrestationVisual, type PrestationVisual } from '../prestation-visual';

export type PrestationIconSize = 'detail' | 'row';

const tileSizes: Record<PrestationIconSize, { readonly tile: number; readonly glyph: number; readonly radius: number }> = {
  detail: { tile: 80, glyph: 32, radius: radii.large },
  row: { tile: 44, glyph: 20, radius: radii.medium },
};

interface PrestationIconProps {
  readonly prestation: Pick<Service, 'name' | 'type'>;
  readonly size?: PrestationIconSize;
  readonly testID?: string;
}

export function PrestationIcon({
  prestation,
  size = 'detail',
  testID = 'prestation-icon',
}: PrestationIconProps) {
  return <PictogramTile size={size} testID={testID} visual={getPrestationVisual(prestation)} />;
}

export function ServiceCategoryIcon({
  category,
  size = 'row',
  testID = 'service-category-icon',
}: {
  readonly category: Pick<ServiceCategory, 'name'>;
  readonly size?: PrestationIconSize;
  readonly testID?: string;
}) {
  return <PictogramTile size={size} testID={testID} visual={getCategoryVisual(category)} />;
}

function PictogramTile({
  visual,
  size,
  testID,
}: {
  readonly visual: PrestationVisual;
  readonly size: PrestationIconSize;
  readonly testID: string;
}) {
  const dimensions = tileSizes[size];

  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.tile,
        {
          backgroundColor: visual.tint,
          borderRadius: dimensions.radius,
          height: dimensions.tile,
          width: dimensions.tile,
        },
      ]}
      testID={testID}
    >
      <SymbolView name={visual.icon} size={dimensions.glyph} tintColor={visual.iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    borderCurve: 'continuous',
    justifyContent: 'center',
  },
});

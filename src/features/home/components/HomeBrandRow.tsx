// BeautIzzy — the brand row of Accueil (presentation only)
//
// The editorial BeautIzzy logo (BrandMark — the one way the app draws its
// identity) set on the page gutter and, when the caller says so, the small
// « Plus » mark beside it (`PlusMarkBadge`), centred on the artwork, 6 pt
// from its visible right edge (the PNG's transparent right padding is pulled
// back like its other sides, so the gap is measured from the ARTWORK). It
// decides nothing: `HomeHeader` derives `showPlus` from the
// session's verified subscription; the development preview passes it
// explicitly to show both states side by side.

import { StyleSheet, View } from 'react-native';

import { PlusMarkBadge } from '@/features/access/status/PlusMarkBadge';
import { BrandMark, brandMarkInsets } from '@/shared/ui/BrandMark';
import { spacing } from '@/shared/ui/theme';

/** Rendered width of the logo box; its artwork is about 148 × 49 pt. */
export const HOME_LOGO_SIZE = 160;
// The canonical PNG carries a thin transparent safe padding around the artwork
// (BrandMark). Pulling the box back by it sets the ARTWORK, not the box, on
// the page gutter, on the top of the header and against the « Plus » mark.
const LOGO_INSETS = brandMarkInsets('editorial', HOME_LOGO_SIZE);

/** Visible distance between the logo artwork and the mark. */
export const HOME_PLUS_MARK_GAP = spacing.xs + 2;

interface HomeBrandRowProps {
  readonly showPlus: boolean;
  readonly testID?: string;
  readonly markTestID?: string;
}

export function HomeBrandRow({ showPlus, testID = 'home-header', markTestID = 'home-plus-mark' }: HomeBrandRowProps) {
  return (
    <View style={styles.row} testID={testID}>
      <BrandMark size={HOME_LOGO_SIZE} style={styles.logo} variant="editorial" />
      {showPlus && <PlusMarkBadge testID={markTestID} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // One row: the logo, then the mark centred on the artwork's height.
  row: { alignItems: 'center', flexDirection: 'row', gap: HOME_PLUS_MARK_GAP },
  logo: {
    marginBottom: -LOGO_INSETS.bottom,
    marginLeft: -LOGO_INSETS.left,
    marginRight: -LOGO_INSETS.right,
    marginTop: -LOGO_INSETS.top,
  },
});

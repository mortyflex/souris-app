// BeautIzzy — Accueil header
//
// The brand, alone: the editorial BeautIzzy logo (BrandMark — the one way the
// app draws its identity) set on the page gutter. No date, no text, no
// ornament: the greeting lives in its own card below (HomeGreetingCard).

import { StyleSheet, View } from 'react-native';

import { BrandMark, brandMarkInsets } from '@/shared/ui/BrandMark';

/** Rendered width of the logo box; its artwork is about 148 × 49 pt. */
export const HOME_LOGO_SIZE = 160;
// The canonical PNG carries a thin transparent safe padding around the artwork
// (BrandMark). Pulling the box back by it sets the ARTWORK, not the box, on
// the page gutter and on the top of the header.
const LOGO_INSETS = brandMarkInsets('editorial', HOME_LOGO_SIZE);

export function HomeHeader() {
  return (
    <View style={styles.header} testID="home-header">
      <BrandMark size={HOME_LOGO_SIZE} style={styles.logo} variant="editorial" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'flex-start' },
  logo: {
    marginBottom: -LOGO_INSETS.bottom,
    marginLeft: -LOGO_INSETS.left,
    marginTop: -LOGO_INSETS.top,
  },
});

// Souris — BrandMark
//
// The only way the application renders the Souris identity. It draws one of
// the three canonical brand assets under assets/brand — never a redrawn
// symbol, an emoji, or a platform icon:
//
//   mark      logo-mark.png      canonical symbol (app icon, splash, compact identity)
//   wordmark  logo-wordmark.png  the canonical name
//   lockup    logo-lockup.png    retained asset: alternate mouse + name + the
//                                salon-specific baseline — not the default
//                                cross-profession identity (DESIGN_OVERRIDES §15)
//
// `BrandComposition` stacks mark + wordmark: the primary product-facing
// composition (Plus, future onboarding / auth; the iOS splash is a derived
// PNG of the same arrangement).
//
// `size` is the rendered width in dp; the height follows the PNG's intrinsic
// aspect ratio so the artwork is never stretched. The canonical PNGs carry
// transparent padding around the artwork; that padding is part of the asset.
//
// Accessibility: the default announces "Souris" once. Pass `decorative` when
// the mark sits next to visible Souris text (or another labelled brand
// element) so VoiceOver never reads "Souris, Souris".

import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

export type BrandMarkVariant = 'mark' | 'wordmark' | 'lockup';

interface BrandAsset {
  readonly source: number;
  /** Intrinsic pixel size of the canonical PNG (verified by BrandMark.test). */
  readonly width: number;
  readonly height: number;
}

export const brandAssets: Record<BrandMarkVariant, BrandAsset> = {
  mark: { source: require('../../../assets/brand/logo-mark.png'), width: 1254, height: 1254 },
  wordmark: { source: require('../../../assets/brand/logo-wordmark.png'), width: 2172, height: 724 },
  lockup: { source: require('../../../assets/brand/logo-lockup.png'), width: 1122, height: 1402 },
};

export interface BrandMarkProps {
  readonly variant: BrandMarkVariant;
  /** Rendered width in dp. */
  readonly size: number;
  /** Hide from assistive technology when visible text already says "Souris". */
  readonly decorative?: boolean;
  readonly style?: StyleProp<ImageStyle>;
}

export function BrandMark({ variant, size, decorative = false, style }: BrandMarkProps) {
  const asset = brandAssets[variant];
  const height = Math.round((size * asset.height) / asset.width);

  return (
    <Image
      source={asset.source}
      resizeMode="contain"
      style={[{ width: size, height }, style]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : 'Souris'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    />
  );
}

export interface BrandCompositionProps {
  /** Rendered width of the wordmark in dp; the mark is half as wide. */
  readonly size: number;
  /** Hide the whole composition when visible text already says "Souris". */
  readonly decorative?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Canonical mark above the canonical wordmark. The wordmark is pulled up into
 * the mark's transparent padding (18 % of the mark width) so the two artworks
 * sit at the rhythm of the original lockup without ever overlapping. The
 * wordmark carries the single accessible "Souris"; the mark is decorative.
 */
export function BrandComposition({ size, decorative = false, style }: BrandCompositionProps) {
  const markSize = Math.round(size / 2);
  return (
    <View
      style={[styles.composition, style]}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    >
      <BrandMark variant="mark" size={markSize} decorative />
      <BrandMark
        variant="wordmark"
        size={size}
        decorative={decorative}
        style={{ marginTop: -Math.round(markSize * 0.18) }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  composition: { alignItems: 'center' },
});


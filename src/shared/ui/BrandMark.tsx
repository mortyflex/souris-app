// Souris — BrandMark
//
// The only way the application renders the BeautIzzy identity. It draws one
// of the three canonical brand assets under assets/brand — never a redrawn
// symbol, an emoji, or a platform icon:
//
//   primary    logo-primary.png    the symbol, then the full name (boot
//                                  surface, Welcome)
//   editorial  logo-editorial.png  the name with the symbol as its initial
//                                  (Home header, Plus, receipts, share footer)
//   symbol     symbol.png          the symbol alone, for reduced uses
//
// `size` is the rendered width in dp; the height follows the PNG's intrinsic
// aspect ratio so the artwork is never stretched. Each canonical PNG is its
// artwork plus an even transparent safe padding (4 % of the artwork's longer
// side), so the box is only slightly larger than the artwork. `inset` records
// that padding, measured on the files; `brandMarkInsets` gives it in dp for a
// caller that must sit the ARTWORK, not the box, exactly on an edge.
// The PNGs are transparent and coloured: they sit directly on the light
// background, with no plate behind them.
//
// Accessibility: the default announces "BeautIzzy" once. Pass `decorative`
// when the mark sits next to visible BeautIzzy text (or another labelled
// brand element) so VoiceOver never reads "BeautIzzy, BeautIzzy".

import { Image, type ImageStyle, type StyleProp } from 'react-native';

export type BrandMarkVariant = 'primary' | 'editorial' | 'symbol';

interface BrandMarkInsets {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface BrandAsset {
  readonly source: number;
  /** Intrinsic pixel size of the canonical PNG. */
  readonly width: number;
  readonly height: number;
  /** Transparent padding around the artwork, in pixels of the PNG. */
  readonly inset: BrandMarkInsets;
}

export const brandAssets: Record<BrandMarkVariant, BrandAsset> = {
  primary: {
    source: require('../../../assets/brand/logo-primary.png'),
    width: 1489,
    height: 541,
    inset: { left: 55, top: 55, right: 55, bottom: 55 },
  },
  editorial: {
    source: require('../../../assets/brand/logo-editorial.png'),
    width: 1514,
    height: 580,
    inset: { left: 56, top: 56, right: 56, bottom: 56 },
  },
  symbol: {
    source: require('../../../assets/brand/symbol.png'),
    width: 811,
    height: 1097,
    inset: { left: 41, top: 41, right: 41, bottom: 41 },
  },
};

/** The transparent padding of a variant rendered `size` dp wide, in dp. */
export function brandMarkInsets(variant: BrandMarkVariant, size: number): BrandMarkInsets {
  const { inset, width } = brandAssets[variant];
  const scale = size / width;
  return {
    left: Math.round(inset.left * scale),
    top: Math.round(inset.top * scale),
    right: Math.round(inset.right * scale),
    bottom: Math.round(inset.bottom * scale),
  };
}

export interface BrandMarkProps {
  readonly variant: BrandMarkVariant;
  /** Rendered width in dp. */
  readonly size: number;
  /** Hide from assistive technology when visible text already says "BeautIzzy". */
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
      accessibilityLabel={decorative ? undefined : 'BeautIzzy'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    />
  );
}

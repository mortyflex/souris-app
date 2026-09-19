// Souris — BrandMark
//
// The only way the application renders the Souris identity. It draws one of
// the three canonical brand assets under assets/brand — never a redrawn
// symbol, an emoji, or a platform icon:
//
//   lockup    logo-lockup.png    full logo: ears + the name + whiskers +
//                                smile/tail + calendar (boot surface, iOS
//                                splash, welcome)
//   mark      logo-mark.png      compact symbol for reduced uses
//   wordmark  logo-wordmark.png  the horizontal Souris name
//
// `size` is the rendered width in dp; the height follows the PNG's intrinsic
// aspect ratio so the artwork is never stretched. The canonical PNGs carry
// transparent padding around the artwork; that padding is part of the asset
// (the artwork spans roughly 56 % of the lockup width, 45 % of the mark and
// 61 % of the wordmark), so callers size the box, not the artwork. The PNGs
// are transparent and coloured: they sit directly on the light background,
// with no plate behind them.
//
// Accessibility: the default announces "Souris" once. Pass `decorative` when
// the mark sits next to visible Souris text (or another labelled brand
// element) so VoiceOver never reads "Souris, Souris".

import { Image, type ImageStyle, type StyleProp } from 'react-native';

export type BrandMarkVariant = 'mark' | 'wordmark' | 'lockup';

interface BrandAsset {
  readonly source: number;
  /** Intrinsic pixel size of the canonical PNG. */
  readonly width: number;
  readonly height: number;
}

export const brandAssets: Record<BrandMarkVariant, BrandAsset> = {
  mark: { source: require('../../../assets/brand/logo-mark.png'), width: 1536, height: 1024 },
  wordmark: { source: require('../../../assets/brand/logo-wordmark.png'), width: 2172, height: 724 },
  lockup: { source: require('../../../assets/brand/logo-lockup.png'), width: 2172, height: 724 },
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

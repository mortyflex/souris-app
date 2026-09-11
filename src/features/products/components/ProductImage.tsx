// Souris — Product image
//
// One consistent primary-image treatment across catalog, details, and form
// (docs/design/DESIGN_OVERRIDES.md §11 and §13).
//
// - photographs: `cover` thumbnail, `contain` detail/form, lavender surface;
// - isolated (transparent PNG) images: a "sticker" — a clean white contour
//   drawn from offset copies of the silhouette, plus a soft navy shadow — so
//   the Product reads as a cut-out object resting on the surface;
// - no image: quiet lavender square with the package symbol.
//
// The contour is built only from the image itself (no native shaders): each
// offset copy is the same source tinted white. The thumbnail uses fewer copies
// to stay cheap inside a long SectionList.
//
// Sizing comes from the processed file, never from a UI zoom: the native
// module crops the cutout to the subject bounds (plus a small transparent
// margin), so `contain` inside the inset box naturally fills the surface.

import { Image, type ImageStyle } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp } from 'react-native';

import { isIsolatedProductImage } from '@/features/products/images/product-image-presentation';
import { lavender, radii, semanticColors, shadowSource, spacing } from '@/shared/ui/theme';

export type ProductImageVariant = 'thumbnail' | 'detail' | 'form';

interface ProductImageProps {
  readonly imageUri?: string;
  readonly productName?: string;
  readonly variant: ProductImageVariant;
  readonly testID?: string;
}

/**
 * Media surface heights. Form and details are deliberately tall (near 4:3 and
 * near square on a phone width) so a typical bottle fills most of the box with
 * `contain`; the catalog thumbnail stays compact.
 */
export const productImageHeights = {
  thumbnail: 52,
  form: 264,
  detail: 320,
} as const satisfies Record<ProductImageVariant, number>;

const symbolSizes: Record<ProductImageVariant, number> = {
  thumbnail: 20,
  detail: 36,
  form: 28,
};

interface StickerGeometry {
  /** White contour thickness, in dp. */
  readonly outline: number;
  /** Silhouette copies drawn around the image to form the contour. */
  readonly directions: readonly (readonly [number, number])[];
  /** Inner inset so the contour and the shadow are never clipped. */
  readonly inset: number;
  readonly shadowOffsetY: number;
  readonly shadowBlur: number;
}

const DIAGONAL = Math.SQRT1_2;
const fullRing: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [DIAGONAL, DIAGONAL],
  [-DIAGONAL, DIAGONAL],
  [DIAGONAL, -DIAGONAL],
  [-DIAGONAL, -DIAGONAL],
];
const lightRing: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const stickerGeometry: Record<ProductImageVariant, StickerGeometry> = {
  thumbnail: {
    outline: 1.5,
    directions: lightRing,
    inset: spacing.xs,
    shadowOffsetY: 1.5,
    shadowBlur: 1,
  },
  form: {
    outline: 3,
    directions: fullRing,
    inset: spacing.md,
    shadowOffsetY: 6,
    shadowBlur: 5,
  },
  detail: {
    outline: 4,
    directions: fullRing,
    inset: spacing.base,
    shadowOffsetY: 8,
    shadowBlur: 6,
  },
};

export function ProductImage({
  imageUri,
  productName,
  variant,
  testID = 'product-image',
}: ProductImageProps) {
  const namedProduct = productName?.trim();
  const accessibilityLabel = imageUri
    ? namedProduct
      ? `Photo de ${namedProduct}`
      : 'Photo du produit'
    : namedProduct
      ? `Aucune photo pour ${namedProduct}`
      : 'Aucune photo pour ce produit';
  const sticker = isIsolatedProductImage(imageUri);

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={[styles.base, variantStyles[variant]]}
      testID={testID}
    >
      {imageUri ? (
        sticker ? (
          <StickerImage imageUri={imageUri} testID={testID} variant={variant} />
        ) : (
          <Image
            accessible={false}
            contentFit={variant === 'thumbnail' ? 'cover' : 'contain'}
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            testID={`${testID}-source`}
            transition={120}
          />
        )
      ) : (
        <SymbolView
          name={{ ios: 'shippingbox.fill', android: 'inventory_2' }}
          size={symbolSizes[variant]}
          tintColor={lavender.lav700}
        />
      )}
    </View>
  );
}

interface StickerImageProps {
  readonly imageUri: string;
  readonly variant: ProductImageVariant;
  readonly testID: string;
}

function StickerImage({ imageUri, variant, testID }: StickerImageProps) {
  const geometry = stickerGeometry[variant];
  const source = { uri: imageUri };
  const layer: StyleProp<ImageStyle> = [StyleSheet.absoluteFill, { margin: geometry.inset }];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`${testID}-sticker`}>
      <Image
        accessible={false}
        blurRadius={geometry.shadowBlur}
        contentFit="contain"
        source={source}
        style={[
          layer,
          styles.stickerShadow,
          { transform: [{ translateY: geometry.shadowOffsetY }] },
        ]}
        tintColor={shadowSource.navy}
      />
      {geometry.directions.map(([x, y]) => (
        <Image
          accessible={false}
          contentFit="contain"
          key={`${x},${y}`}
          source={source}
          style={[
            layer,
            {
              transform: [
                { translateX: x * geometry.outline },
                { translateY: y * geometry.outline },
              ],
            },
          ]}
          tintColor={semanticColors.surfaceElevated}
        />
      ))}
      <Image
        accessible={false}
        contentFit="contain"
        source={source}
        style={layer}
        testID={`${testID}-source`}
        transition={120}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderCurve: 'continuous',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stickerShadow: { opacity: 0.22 },
});

const variantStyles = StyleSheet.create({
  // The compact thumbnail keeps the quiet lavender so legacy Products without
  // images do not turn catalog rows noisy.
  thumbnail: {
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.medium,
    height: productImageHeights.thumbnail,
    width: productImageHeights.thumbnail,
  },
  detail: {
    backgroundColor: semanticColors.surfaceMedia,
    borderRadius: radii.large,
    height: productImageHeights.detail,
    width: '100%',
  },
  form: {
    backgroundColor: semanticColors.surfaceMedia,
    borderRadius: radii.large,
    height: productImageHeights.form,
    width: '100%',
  },
});

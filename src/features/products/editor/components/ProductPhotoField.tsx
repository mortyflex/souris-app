// Souris — Product photo field
//
// The image area is the interaction: tapping the tile opens the shared photo
// source flow (camera / library / remove — shared/ui/PhotoSourceFlow.tsx,
// which also owns the camera permission: asked on « Prendre une photo »,
// before the camera is presented). Acquisition and processing update only
// the draft through `onChangeImageUri`; Save/Cancel semantics belong to the
// Product editor.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { productImageHeights } from '@/features/products/components/ProductImage';
import { ProductImageReveal } from '@/features/products/components/ProductImageReveal';
import { removeImageBackground } from '@/features/products/images/remove-image-background';
import { AppText } from '@/shared/ui/AppText';
import { PhotoSourceFlow } from '@/shared/ui/PhotoSourceFlow';
import { interaction, nativeShadows, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface ProductPhotoFieldProps {
  readonly imageUri?: string;
  readonly productName: string;
  readonly onChangeImageUri: (imageUri: string | undefined) => void;
}

type PhotoState = 'idle' | 'processing';

export function ProductPhotoField({
  imageUri,
  productName,
  onChangeImageUri,
}: ProductPhotoFieldProps) {
  const [state, setState] = useState<PhotoState>('idle');
  const [sourceVisible, setSourceVisible] = useState(false);
  const activeOperation = useRef(0);

  useEffect(
    () => () => {
      activeOperation.current += 1;
    },
    [],
  );

  // Vision is optional: the selected original is immediately usable while a
  // transparent, subject-cropped version is prepared in the background.
  const prepareSelectedPhoto = async (uri: string) => {
    const operation = activeOperation.current + 1;
    activeOperation.current = operation;
    onChangeImageUri(uri);
    setState('processing');
    const preparedUri = await removeImageBackground(uri);
    if (operation !== activeOperation.current) return;
    onChangeImageUri(preparedUri);
    setState('idle');
  };

  const removePhoto = () => {
    activeOperation.current += 1;
    setState('idle');
    onChangeImageUri(undefined);
  };

  const showPickError = () => {
    Alert.alert(
      'Impossible d’ajouter la photo',
      'La photo n’a pas pu être préparée. Réessayez ou continuez sans photo.',
    );
  };

  const busy = state !== 'idle';
  const tileLabel = imageUri ? 'Modifier la photo' : 'Ajouter une photo';

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tileLabel}
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => setSourceVisible(true)}
        style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
        testID="product-photo-tile"
      >
        {imageUri ? (
          <>
            <ProductImageReveal
              imageUri={imageUri}
              productName={productName}
              style={styles.reveal}
              testID="product-form-image"
              variant="form"
            />
            {state === 'processing' ? (
              <View pointerEvents="none" style={styles.badge} testID="photo-processing-badge">
                <ActivityIndicator color={semanticColors.accent} size="small" />
              </View>
            ) : (
              <View pointerEvents="none" style={[styles.badge, styles.editBadge]}>
                <SymbolView
                  name={{ ios: 'camera.fill', android: 'photo_camera' }}
                  size={14}
                  tintColor={semanticColors.accent}
                />
                <AppText variant="chip" style={styles.editBadgeText}>
                  Modifier
                </AppText>
              </View>
            )}
          </>
        ) : (
          <View style={styles.emptyTile} testID="product-photo-empty">
            <View style={styles.emptyIcon}>
              <SymbolView
                name={{ ios: 'camera.fill', android: 'photo_camera' }}
                size={22}
                tintColor={semanticColors.accent}
              />
            </View>
            <AppText variant="control" style={styles.emptyLabel}>
              Ajouter une photo
            </AppText>
          </View>
        )}
      </Pressable>
      {state === 'processing' && (
        <AppText
          accessibilityLiveRegion="polite"
          variant="metadata"
          style={styles.processing}
          testID="photo-processing"
        >
          Préparation de la photo…
        </AppText>
      )}
      <PhotoSourceFlow
        cameraHint="Placez le produit au centre"
        cameraTestID="product-camera"
        cameraTitle="Photo du produit"
        hasImage={Boolean(imageUri)}
        libraryLabel="Choisir dans la photothèque"
        onClose={() => setSourceVisible(false)}
        onPickError={showPickError}
        onRemove={removePhoto}
        onSelected={(uri) => void prepareSelectedPhoto(uri)}
        testID="product-photo"
        title="Photo du produit"
        visible={sourceVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  tile: {
    borderCurve: 'continuous',
    borderRadius: radii.large,
    position: 'relative',
  },
  tilePressed: { opacity: interaction.pressedOpacity },
  reveal: { alignSelf: 'stretch' },
  badge: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.pill,
    bottom: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
    height: 30,
    justifyContent: 'center',
    minWidth: 30,
    position: 'absolute',
    right: spacing.sm,
    ...nativeShadows.raised,
  },
  editBadge: { paddingHorizontal: spacing.md },
  editBadgeText: { color: semanticColors.accent },
  emptyTile: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceMedia,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    height: productImageHeights.form,
    justifyContent: 'center',
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.pill,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  emptyLabel: { color: semanticColors.accent },
  processing: { color: semanticColors.foregroundSoft, textAlign: 'center' },
});

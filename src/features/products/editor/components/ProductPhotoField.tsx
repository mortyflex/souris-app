// Souris — Product photo field
//
// The image area is the interaction: tapping the tile opens the Product photo
// source sheet (camera / library / remove). Acquisition and processing update
// only the draft through `onChangeImageUri`; Save/Cancel semantics belong to
// the Product editor.
//
// Presentation state machine — one modal at a time, never stacked:
//
//   none → source → (dismissed) → camera → none
//                 → library picker (system, over the sheet) → none
//                 → remove → none
//
// The camera is presented only from the source sheet's `onDismissed`
// callback, i.e. after its Modal is completely gone.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

import { productImageHeights } from '@/features/products/components/ProductImage';
import { ProductImageReveal } from '@/features/products/components/ProductImageReveal';
import { pickProductPhotoFromLibrary } from '@/features/products/images/product-photo-acquisition';
import { removeImageBackground } from '@/features/products/images/remove-image-background';
import { AppText } from '@/shared/ui/AppText';
import { interaction, nativeShadows, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { ProductCameraModal } from './ProductCameraModal';
import { ProductPhotoSourceSheet } from './ProductPhotoSourceSheet';

interface ProductPhotoFieldProps {
  readonly imageUri?: string;
  readonly productName: string;
  readonly onChangeImageUri: (imageUri: string | undefined) => void;
}

type PhotoState = 'idle' | 'acquiring' | 'processing';
type PhotoPresentation = 'none' | 'source' | 'camera';

export function ProductPhotoField({
  imageUri,
  productName,
  onChangeImageUri,
}: ProductPhotoFieldProps) {
  const [state, setState] = useState<PhotoState>('idle');
  const [presentation, setPresentation] = useState<PhotoPresentation>('none');
  const cameraRequested = useRef(false);
  const activeOperation = useRef(0);

  useEffect(
    () => () => {
      activeOperation.current += 1;
    },
    [],
  );

  const showLibraryPermissionError = (canAskAgain: boolean) => {
    Alert.alert(
      'Accès à la photothèque refusé',
      canAskAgain
        ? 'La photo n’a pas été ajoutée. Vous pouvez réessayer ou continuer sans photo.'
        : 'Autorisez l’accès à la photothèque dans les réglages, ou continuez sans photo.',
      canAskAgain
        ? [{ text: 'OK' }]
        : [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Ouvrir les réglages', onPress: () => void Linking.openSettings() },
          ],
    );
  };

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

  const requestCamera = () => {
    cameraRequested.current = true;
    setPresentation('none');
  };

  const handleSourceSheetDismissed = () => {
    if (!cameraRequested.current) return;
    cameraRequested.current = false;
    setPresentation('camera');
  };

  const closeCamera = () => {
    setPresentation((current) => (current === 'camera' ? 'none' : current));
  };

  const handleCaptured = (uri: string) => {
    setPresentation('none');
    void prepareSelectedPhoto(uri);
  };

  const chooseFromLibrary = async () => {
    const operation = activeOperation.current + 1;
    activeOperation.current = operation;
    setState('acquiring');
    const result = await pickProductPhotoFromLibrary();
    if (operation !== activeOperation.current) return;
    setPresentation('none');

    if (result.status === 'selected') {
      await prepareSelectedPhoto(result.uri);
      return;
    }

    setState('idle');
    if (result.status === 'permission-denied') {
      showLibraryPermissionError(result.canAskAgain);
    } else if (result.status === 'error') {
      Alert.alert(
        'Impossible d’ajouter la photo',
        'La photo n’a pas pu être préparée. Réessayez ou continuez sans photo.',
      );
    }
  };

  const removePhoto = () => {
    activeOperation.current += 1;
    setPresentation('none');
    setState('idle');
    onChangeImageUri(undefined);
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
        onPress={() => setPresentation('source')}
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
      <ProductPhotoSourceSheet
        hasImage={Boolean(imageUri)}
        onChooseCamera={requestCamera}
        onChooseLibrary={() => void chooseFromLibrary()}
        onClose={() => setPresentation('none')}
        onDismissed={handleSourceSheetDismissed}
        onRemove={removePhoto}
        visible={presentation === 'source'}
      />
      <ProductCameraModal
        onCaptured={handleCaptured}
        onClose={closeCamera}
        visible={presentation === 'camera'}
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

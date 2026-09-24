// Souris — photo camera (dedicated large sheet)
//
// Photography only (Product photos, Client photos): a generous live preview,
// one instruction, one shutter. No barcode framing, no scanner language, no
// torch or zoom, and deliberately independent from BarcodeScannerModal.
//
// Presentation follows the proven scanner lifecycle: its own native Modal
// (iOS `pageSheet` — the system large card, swipe-to-dismiss, clean depth
// over the editor; full screen on Android), with the CameraView filling a
// flex container that always has real dimensions. Nothing is drawn over the
// preview. It is presented only after the source sheet has been dismissed.
//
// It never asks for the camera permission: PhotoSourceFlow resolves it on the
// « Prendre une photo » tap (shared/lib/photo-acquisition.ts) and presents
// this sheet only once it is granted. A camera that still cannot start
// closes the sheet instead of showing a dead preview.

import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { CameraView } from 'expo-camera';

import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { colors, interaction, radii, spacing, touchTarget } from '@/shared/ui/theme';

interface PhotoCameraModalProps {
  readonly visible: boolean;
  /** Header title, e.g. « Photo du produit ». */
  readonly title: string;
  /** The one framing instruction under the preview. */
  readonly hint: string;
  /** Called once per capture with the local photo URI. */
  readonly onCaptured: (uri: string) => void;
  readonly onClose: () => void;
  readonly testID?: string;
}

const ON_DARK = colors.background;
const ON_DARK_SOFT = 'rgba(255, 255, 255, 0.78)';
const GLASS = 'rgba(255, 255, 255, 0.16)';
const GLASS_PRESSED = 'rgba(255, 255, 255, 0.28)';
const SHUTTER_SIZE = 72;

export function PhotoCameraModal({
  visible,
  title,
  hint,
  onCaptured,
  onClose,
  testID = 'photo-camera',
}: PhotoCameraModalProps) {
  const [capturing, setCapturing] = useState(false);
  const camera = useRef<CameraView>(null);

  const capture = async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        haptics.selection();
        onCaptured(photo.uri);
      }
    } catch {
      // The shutter returns to idle; the professional can retry or close.
    }
    setCapturing(false);
  };

  return (
    <Modal
      animationType="slide"
      onDismiss={onClose}
      onRequestClose={onClose}
      onShow={() => setCapturing(false)}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.root} testID={testID}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer la caméra"
            hitSlop={spacing.xs}
            onPress={onClose}
            style={({ pressed }) => [styles.glassButton, pressed && styles.glassButtonPressed]}
          >
            <SymbolView
              name={{ ios: 'xmark', android: 'close' }}
              size={17}
              tintColor={ON_DARK}
              weight="semibold"
            />
          </Pressable>
          <AppText accessibilityRole="header" variant="rowTitle" style={styles.title}>
            {title}
          </AppText>
          <View style={styles.glassButtonPlaceholder} />
        </View>

        <View style={styles.preview} testID={`${testID}-preview`}>
          <CameraView
            animateShutter={false}
            facing="back"
            onMountError={onClose}
            ref={camera}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <AppText variant="control" style={styles.hint}>
          {hint}
        </AppText>
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Prendre la photo"
            accessibilityState={{ busy: capturing, disabled: capturing }}
            disabled={capturing}
            onPress={() => void capture()}
            style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
            testID={`${testID}-shutter`}
          >
            <View style={styles.shutterCore}>
              {capturing && <ActivityIndicator color={colors.foreground} size="small" />}
            </View>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const cameraTouchTarget = touchTarget.ios;

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.foreground,
    flex: 1,
    gap: spacing.md,
    paddingHorizontal: spacing.base,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  title: { color: ON_DARK, flex: 1, textAlign: 'center' },
  glassButton: {
    alignItems: 'center',
    backgroundColor: GLASS,
    borderRadius: radii.pill,
    height: cameraTouchTarget,
    justifyContent: 'center',
    width: cameraTouchTarget,
  },
  glassButtonPlaceholder: { height: cameraTouchTarget, width: cameraTouchTarget },
  glassButtonPressed: {
    backgroundColor: GLASS_PRESSED,
    transform: [{ scale: interaction.pressedScale }],
  },
  preview: {
    backgroundColor: '#000000',
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flex: 1,
    overflow: 'hidden',
  },
  hint: { color: ON_DARK_SOFT, textAlign: 'center' },
  footer: { alignItems: 'center', paddingBottom: spacing.sm, paddingTop: spacing.xs },
  shutter: {
    alignItems: 'center',
    borderColor: ON_DARK,
    borderRadius: radii.pill,
    borderWidth: 4,
    height: SHUTTER_SIZE,
    justifyContent: 'center',
    width: SHUTTER_SIZE,
  },
  shutterPressed: { transform: [{ scale: interaction.pressedScale }] },
  shutterCore: {
    alignItems: 'center',
    backgroundColor: ON_DARK,
    borderRadius: radii.pill,
    height: SHUTTER_SIZE - 16,
    justifyContent: 'center',
    width: SHUTTER_SIZE - 16,
  },
});

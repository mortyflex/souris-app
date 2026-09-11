// Souris — Product camera (dedicated large sheet)
//
// Product photography only: a generous live preview, one instruction, one
// shutter. No barcode framing, no scanner language, no torch or zoom, and
// deliberately independent from BarcodeScannerModal.
//
// Presentation follows the proven scanner lifecycle: its own native Modal
// (iOS `pageSheet` — the system large card, swipe-to-dismiss, clean depth
// over the editor; full screen on Android), with the CameraView filling a
// flex container that always has real dimensions. Nothing is drawn over the
// preview. It is presented only after the source sheet has been dismissed.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { colors, interaction, radii, spacing, touchTarget } from '@/shared/ui/theme';

interface ProductCameraModalProps {
  readonly visible: boolean;
  /** Called once per capture with the local photo URI. */
  readonly onCaptured: (uri: string) => void;
  readonly onClose: () => void;
}

const ON_DARK = colors.background;
const ON_DARK_SOFT = 'rgba(255, 255, 255, 0.78)';
const GLASS = 'rgba(255, 255, 255, 0.16)';
const GLASS_PRESSED = 'rgba(255, 255, 255, 0.28)';
const SHUTTER_SIZE = 72;

export function ProductCameraModal({ visible, onCaptured, onClose }: ProductCameraModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const camera = useRef<CameraView>(null);
  const permissionRequestStarted = useRef(false);

  useEffect(() => {
    if (!visible) permissionRequestStarted.current = false;
  }, [visible]);

  // Permission is requested only when the camera is actually presented.
  useEffect(() => {
    if (visible && permission === null && !permissionRequestStarted.current) {
      permissionRequestStarted.current = true;
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

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
      <SafeAreaView edges={['top', 'bottom']} style={styles.root} testID="product-camera">
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
            Photo du produit
          </AppText>
          <View style={styles.glassButtonPlaceholder} />
        </View>

        {permission?.granted ? (
          <>
            <View style={styles.preview} testID="product-camera-preview">
              <CameraView
                animateShutter={false}
                facing="back"
                ref={camera}
                style={StyleSheet.absoluteFill}
              />
            </View>
            <AppText variant="control" style={styles.hint}>
              Placez le produit au centre
            </AppText>
            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Prendre la photo"
                accessibilityState={{ busy: capturing, disabled: capturing }}
                disabled={capturing}
                onPress={() => void capture()}
                style={({ pressed }) => [styles.shutter, pressed && styles.shutterPressed]}
                testID="product-camera-shutter"
              >
                <View style={styles.shutterCore}>
                  {capturing && <ActivityIndicator color={colors.foreground} size="small" />}
                </View>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.center}>
            {permission === null ? (
              <AppText variant="stateTitle" style={styles.centerTitle}>
                Préparation de la caméra…
              </AppText>
            ) : permission.canAskAgain ? (
              <>
                <AppText variant="stateTitle" style={styles.centerTitle}>
                  Autoriser la caméra
                </AppText>
                <AppButton
                  onPress={() => {
                    void requestPermission();
                  }}
                  style={styles.centerButton}
                  title="Réessayer"
                />
              </>
            ) : (
              <>
                <AppText variant="stateTitle" style={styles.centerTitle}>
                  La caméra est nécessaire pour prendre une photo.
                </AppText>
                <AppText variant="body" style={styles.centerText}>
                  Autorisez l&apos;accès à la caméra dans les réglages, ou choisissez une image
                  dans la photothèque.
                </AppText>
                <AppButton
                  onPress={() => void Linking.openSettings()}
                  style={styles.centerButton}
                  title="Ouvrir les réglages"
                />
              </>
            )}
            <AppButton onPress={onClose} title="Fermer" variant="secondary" />
          </View>
        )}
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
  center: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  centerTitle: { color: ON_DARK, textAlign: 'center' },
  centerText: { color: ON_DARK_SOFT, textAlign: 'center' },
  centerButton: { alignSelf: 'stretch' },
});

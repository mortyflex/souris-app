// Souris — Barcode scanner (shared, non-Product-specific)
//
// A focused full-screen native scanner presentation. Responsibility is ONLY:
// camera, permission, barcode detection, and returning the scanned STRING.
// It knows nothing about Products, catalog providers, routes, stock, or
// Sales. Future Sales may reuse it unchanged.
//
// Scanned values are strings — never numeric coercion, leading zeroes
// preserved. A scan lock guarantees exactly one result per presentation.
//
// Presentation: the camera fills the whole screen; a navy scrim with a
// cut-out window frames the scan area, and the header floats inside the
// safe area (Dynamic Island / notch / gesture bar) on top of that scrim.

import { useEffect, useRef, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import {
  colors,
  interaction,
  lavender,
  radii,
  semanticColors,
  spacing,
  touchTarget,
} from '@/shared/ui/theme';

/**
 * Retail barcode types matching the real catalog (EAN-13 / EAN-8 dominant,
 * plus GTIN-14-like records) and other common retail formats. No QR.
 */
const BARCODE_TYPES: BarcodeType[] = [
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'code128',
  'itf14',
];
const scannerTouchTarget = touchTarget[Platform.OS === 'android' ? 'android' : 'ios'];

// Scrim and glass tones derived from the canonical navy / white.
const SCRIM = 'rgba(25, 22, 63, 0.58)';
const GLASS = 'rgba(255, 255, 255, 0.16)';
const GLASS_PRESSED = 'rgba(255, 255, 255, 0.28)';
const ON_SCRIM = colors.background;
const ON_SCRIM_SOFT = 'rgba(255, 255, 255, 0.78)';

// Scan window: wide landscape frame suited to retail barcodes.
const FRAME_ASPECT_RATIO = 1.75;
const FRAME_CORNER = 28;
const FRAME_STROKE = 3;
const PULSE_DURATION = 1400;

interface BarcodeScannerModalProps {
  readonly visible: boolean;
  /** Called exactly once per presentation with the scanned string. */
  readonly onScanned: (barcode: string) => void;
  readonly onClose: () => void;
}

export function BarcodeScannerModal({
  visible,
  onScanned,
  onClose,
}: BarcodeScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const scanLocked = useRef(false);
  const permissionRequestStarted = useRef(false);

  // One detection is accepted per presentation, even when the native camera
  // emits several frames before the caller has closed the modal.
  useEffect(() => {
    if (visible) {
      scanLocked.current = false;
    } else {
      permissionRequestStarted.current = false;
    }
  }, [visible]);

  // Permission is requested only when this scanner is actually opened.
  useEffect(() => {
    if (visible && permission === null && !permissionRequestStarted.current) {
      permissionRequestStarted.current = true;
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  const close = () => {
    setTorchEnabled(false);
    onClose();
  };

  const handleScanned = (barcode: string) => {
    const trimmedBarcode = barcode.trim();
    if (trimmedBarcode.length === 0) return;
    if (scanLocked.current) return;
    scanLocked.current = true;
    setTorchEnabled(false);
    haptics.selection();
    onScanned(trimmedBarcode);
  };

  const cameraReady = permission?.granted === true;

  return (
    <Modal
      animationType="slide"
      onRequestClose={close}
      onShow={() => {
        scanLocked.current = false;
        setTorchEnabled(false);
      }}
      presentationStyle="fullScreen"
      visible={visible}
    >
      {visible && <StatusBar style="light" />}
      <SafeAreaProvider style={styles.root} testID="scanner-safe-area-provider">
        {cameraReady && (
          <>
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              enableTorch={torchEnabled}
              facing="back"
              onBarcodeScanned={(result) => handleScanned(result.data)}
              style={StyleSheet.absoluteFill}
            />
            <ScanOverlay active={visible} />
          </>
        )}

        <SafeAreaView
          edges={['top', 'bottom']}
          style={styles.safeArea}
          testID="scanner-safe-area-root"
        >
          <View style={styles.topBar} testID="scanner-header">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer le scanner"
              hitSlop={spacing.xs}
              onPress={close}
              style={({ pressed }) => [styles.glassButton, pressed && styles.glassButtonPressed]}
            >
              <SymbolView
                name={{ ios: 'xmark', android: 'close' }}
                size={17}
                tintColor={ON_SCRIM}
                weight="semibold"
              />
            </Pressable>
            <View style={styles.titleBlock}>
              <AppText
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                numberOfLines={2}
                variant="sheetTitle"
                style={styles.title}
              >
                Scanner un code-barres
              </AppText>
            </View>
            {cameraReady ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={torchEnabled ? 'Éteindre la lampe' : 'Allumer la lampe'}
                accessibilityState={{ selected: torchEnabled }}
                hitSlop={spacing.xs}
                onPress={() => setTorchEnabled((current) => !current)}
                style={({ pressed }) => [
                  styles.glassButton,
                  torchEnabled && styles.torchButtonActive,
                  pressed && styles.glassButtonPressed,
                ]}
              >
                <SymbolView
                  name={{
                    ios: torchEnabled ? 'flashlight.on.fill' : 'flashlight.off.fill',
                    android: torchEnabled ? 'flashlight_on' : 'flashlight_off',
                  }}
                  size={18}
                  tintColor={ON_SCRIM}
                />
              </Pressable>
            ) : (
              <View style={styles.glassButtonPlaceholder} />
            )}
          </View>

          <View style={styles.content} testID="scanner-content">
            {permission === null ? (
              <View style={styles.center}>
                <AppText variant="stateTitle" style={styles.centerTitle}>
                  Préparation de la caméra…
                </AppText>
                <AppButton onPress={close} title="Fermer" variant="secondary" />
              </View>
            ) : !permission.granted ? (
              <View style={styles.center}>
                {permission.canAskAgain ? (
                  <>
                    <AppText variant="stateTitle" style={styles.centerTitle}>
                      Autoriser la caméra
                    </AppText>
                    <AppText variant="body" style={styles.centerText}>
                      La caméra permet de scanner un code-barres sans le saisir manuellement.
                    </AppText>
                    <AppButton
                      onPress={() => {
                        void requestPermission();
                      }}
                      style={styles.centerButton}
                      title="Réessayer"
                    />
                    <AppButton onPress={close} title="Fermer" variant="secondary" />
                  </>
                ) : (
                  <>
                    <AppText variant="stateTitle" style={styles.centerTitle}>
                      La caméra est nécessaire pour scanner un code-barres.
                    </AppText>
                    <AppText variant="body" style={styles.centerText}>
                      Autorisez l&apos;accès à la caméra dans les réglages, ou saisissez le
                      code-barres manuellement.
                    </AppText>
                    <AppButton
                      onPress={() => void Linking.openSettings()}
                      style={styles.centerButton}
                      title="Ouvrir les réglages"
                    />
                    <AppButton onPress={close} title="Fermer" variant="secondary" />
                  </>
                )}
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

/**
 * Navy scrim with a transparent scan window, rounded corner brackets, a soft
 * lavender pulse, and the instruction below the window. Pointer-transparent
 * and never drawn over the camera pixels inside the window.
 */
function ScanOverlay({ active }: { readonly active: boolean }) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!active || reducedMotion) {
      cancelAnimation(pulse);
      pulse.set(0);
      return;
    }
    pulse.set(
      withRepeat(
        withTiming(1, { duration: PULSE_DURATION, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [active, pulse, reducedMotion]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + pulse.get() * 0.45,
    transform: [{ scale: 1 + pulse.get() * 0.012 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="scanner-overlay">
      <View style={styles.scrimTop} />
      <View style={styles.windowRow}>
        <View style={styles.scrimSide} />
        <View style={styles.window} testID="scanner-window">
          <Animated.View style={[styles.glow, glowStyle]} />
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
        <View style={styles.scrimSide} />
      </View>
      <View style={styles.scrimBottom}>
        <View style={styles.hint}>
          <SymbolView
            name={{ ios: 'barcode.viewfinder', android: 'barcode_scanner' }}
            size={16}
            tintColor={ON_SCRIM}
          />
          <AppText variant="control" style={styles.hintText}>
            Placez le code-barres dans le cadre
          </AppText>
        </View>
        <AppText variant="metadata" style={styles.hintSecondary}>
          La détection est automatique
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.foreground, flex: 1 },
  safeArea: { backgroundColor: 'transparent', flex: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  titleBlock: { alignItems: 'center', flex: 1, minWidth: 0 },
  title: { color: ON_SCRIM, textAlign: 'center' },
  glassButton: {
    alignItems: 'center',
    backgroundColor: GLASS,
    borderRadius: radii.pill,
    height: scannerTouchTarget,
    justifyContent: 'center',
    width: scannerTouchTarget,
  },
  glassButtonPlaceholder: { height: scannerTouchTarget, width: scannerTouchTarget },
  glassButtonPressed: {
    backgroundColor: GLASS_PRESSED,
    transform: [{ scale: interaction.pressedScale }],
  },
  torchButtonActive: { backgroundColor: semanticColors.accent },
  content: { flex: 1 },
  center: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  centerTitle: { color: ON_SCRIM, textAlign: 'center' },
  centerText: { color: ON_SCRIM_SOFT, marginBottom: spacing.sm, textAlign: 'center' },
  centerButton: { alignSelf: 'stretch' },

  // Overlay
  scrimTop: { backgroundColor: SCRIM, flex: 0.9 },
  scrimBottom: {
    alignItems: 'center',
    backgroundColor: SCRIM,
    flex: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  windowRow: { flexDirection: 'row' },
  scrimSide: { backgroundColor: SCRIM, flex: 1 },
  window: {
    aspectRatio: FRAME_ASPECT_RATIO,
    borderCurve: 'continuous',
    borderRadius: FRAME_CORNER,
    position: 'relative',
    width: '76%',
  },
  glow: {
    borderColor: lavender.lav200,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    borderCurve: 'continuous',
    borderRadius: FRAME_CORNER,
    borderWidth: 1.5,
    boxShadow: '0 0 28px rgba(115, 84, 199, 0.55)',
  },
  corner: {
    borderColor: ON_SCRIM,
    height: 34,
    position: 'absolute',
    width: 34,
  },
  cornerTopLeft: {
    borderLeftWidth: FRAME_STROKE,
    borderTopLeftRadius: FRAME_CORNER,
    borderTopWidth: FRAME_STROKE,
    left: -1,
    top: -1,
  },
  cornerTopRight: {
    borderRightWidth: FRAME_STROKE,
    borderTopRightRadius: FRAME_CORNER,
    borderTopWidth: FRAME_STROKE,
    right: -1,
    top: -1,
  },
  cornerBottomLeft: {
    borderBottomLeftRadius: FRAME_CORNER,
    borderBottomWidth: FRAME_STROKE,
    borderLeftWidth: FRAME_STROKE,
    bottom: -1,
    left: -1,
  },
  cornerBottomRight: {
    borderBottomRightRadius: FRAME_CORNER,
    borderBottomWidth: FRAME_STROKE,
    borderRightWidth: FRAME_STROKE,
    bottom: -1,
    right: -1,
  },
  hint: {
    alignItems: 'center',
    backgroundColor: GLASS,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.base,
  },
  hintText: { color: ON_SCRIM },
  hintSecondary: { color: ON_SCRIM_SOFT },
});

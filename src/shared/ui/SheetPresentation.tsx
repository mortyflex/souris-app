// BeautIzzy — SheetPresentation
//
// The ONE bottom-anchored sheet presentation of BeautIzzy (DESIGN_OVERRIDES.md
// §16, §20), shared by its two hosts:
//
// - `BottomSheet`  hosts it in a React Native Modal (drawers opened by state);
// - `SheetScreen`  hosts it in a transparent-modal ROUTE (content-fit routes:
//                  Appointment details, Product / Service details and
//                  creation).
//
// Both therefore get exactly the same sheet on every iOS version: full width,
// flush with the bottom edge, top corners only, bottom safe area INSIDE the
// surface — never the inset floating card iOS 26 makes of a native sheet below
// its large detent.
//
// It owns everything that must look and behave identically everywhere:
//
// - exactly ONE navy scrim (theme `scrim`) that fades in with the sheet and
//   fades out while the sheet slides down — it never slides itself;
// - the satin overlay material (near-white lavender surface, SurfaceGloss
//   highlight clipped to the rounded top corners, soft upward lift, bottom
//   safe area, grabber);
// - the open transition (slide up + scrim fade in) and the close transition
//   (slide down + scrim fade out, THEN `onCloseTransitionEnd`) — the host
//   unmounts only after it, so a sheet never disappears instantly;
// - the dismissal gestures: backdrop tap and pan-down, each an explicit
//   option. Pan-to-dismiss lives ONLY on the grabber/header zone, so scrolling
//   content never competes with the sheet gesture;
// - a transition for EVERY appearance: the first surface slides up once it is
//   really laid out (never while the UI thread is still mounting the screen),
//   and a change of `contentKey` brings the new content as a new sheet sliding
//   up over the previous one, which slides away beneath it;
// - the bottom safe area INSIDE the surface, as plain padding. A native
//   safe-area view mounted while a modal is still being presented (and inside a
//   surface still translated below the screen) measures 0 and never recomputes:
//   content then sits on the home indicator. The inset therefore comes from the
//   window metrics known at launch (BeautIzzy is portrait-locked), a resting probe
//   only ever raising it;
// - optional canonical header, scrollable body, fixed action area and
//   keyboard-safe layout (the bottom safe-area inset is dropped while the
//   keyboard is up, so no double inset; a tall surface shrinks to the space
//   left above the keyboard, below the detent's top gap). Only the TOP sheet
//   reacts: a sheet covered by another one presented from inside it (a
//   drawer over a sheet route) stays where it is (`sheet-layers.tsx`).
//
// Motion uses the core Animated API on the native driver (transform + opacity
// only) and a PanResponder for the grabber drag: this keeps the shared
// primitive free of worklets, so every consumer screen test stays simple.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';

import { SheetGlassBackdrop, sheetSurfaceStyle, useSheetGlass, type SheetMaterial } from './sheet-material';
import { SheetLayer, useSheetLayer } from './sheet-layers';
import { SurfaceGloss } from './SurfaceGloss';
import {
  duration,
  easing,
  gutter,
  nativeShadows,
  overlayMaterial,
  radii,
  scrim,
  sheet,
  spacing,
} from './theme';
import { useReduceMotion } from './useReduceMotion';

export interface SheetPresentationOptions {
  /** Accessibility label of the outside-tap area. */
  readonly backdropLabel: string;
  readonly dismissOnBackdropPress?: boolean;
  /** Drag down on the grabber/header zone. Disable for long lists and forms. */
  readonly dismissOnPanDown?: boolean;
  /** Lifts the sheet above the keyboard (forms and text entry). */
  readonly keyboardAvoiding?: boolean;
  /**
   * Fixed sheet height (e.g. '88%'): the body then fills the surface below the
   * header, so a long list gets a bounded area with real height. Otherwise the
   * sheet fits its content (up to the detent).
   */
  readonly height?: DimensionValue;
  /** Canonical header, rendered inside the drag zone. */
  readonly header?: ReactNode;
  /** Wraps the body in a keyboard-safe ScrollView. */
  readonly scrollable?: boolean;
  /** Fixed action area anchored below the body (use SheetActionBar). */
  readonly footer?: ReactNode;
  /** Horizontal gutter around the body; disable when children pad themselves. */
  readonly padded?: boolean;
  readonly contentStyle?: StyleProp<ViewStyle>;
  /**
   * Surface material: the approved satin (default) or the EXPERIMENTAL glass of
   * the Glass Sheet Pilot (DESIGN_OVERRIDES.md §40) — explicit opt-in only.
   */
  readonly material?: SheetMaterial;
  readonly testID?: string;
  /**
   * Identity of what the sheet shows. When it changes (details → edit, type
   * chooser → form) the new content arrives as a NEW sheet sliding up over the
   * previous one instead of replacing it in place.
   */
  readonly contentKey?: string;
  /** Test handles of the outside-tap area and of the sized surface. */
  readonly scrimTestID?: string;
  readonly surfaceTestID?: string;
  readonly children: ReactNode;
}

interface SheetPresentationProps extends SheetPresentationOptions {
  /** `false` starts the close transition; the host stays mounted until it ends. */
  readonly visible: boolean;
  /**
   * The host knows the sheet is covered by something outside its React tree
   * (a sheet route under another route): it then ignores the keyboard.
   */
  readonly covered?: boolean;
  /** Every dismissal request: backdrop, pan-down, accessibility escape. */
  readonly onClose: () => void;
  /** The close transition has finished: the host may unmount now. */
  readonly onCloseTransitionEnd: () => void;
}

/** What one sheet surface shows: everything that changes with `contentKey`. */
type SheetSurfaceContent = Pick<
  SheetPresentationOptions,
  | 'height'
  | 'header'
  | 'scrollable'
  | 'footer'
  | 'padded'
  | 'contentStyle'
  | 'material'
  | 'testID'
  | 'surfaceTestID'
  | 'children'
>;

const slideEasing = Easing.bezier(...easing.out);
/** Home-indicator inset of the portrait window, known before any sheet mounts. */
const launchBottomInset: number | undefined = initialWindowMetrics?.insets.bottom;

/**
 * Runs `start` once the view has really been laid out natively. A transition
 * started at mount runs while the UI thread is still busy mounting the screen:
 * its clock advances unseen and the first displayed frame already shows the
 * sheet almost in place — it reads as « appears instantly ». The timer only
 * covers a layout event that never comes.
 */
function useStartAfterFirstLayout(enabled: boolean, start: () => void) {
  const [laidOut, setLaidOut] = useState(false);
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  useEffect(() => {
    if (!enabled || laidOut) return;
    const fallback = setTimeout(() => setLaidOut(true), sheet.layoutWaitFallback);
    return () => clearTimeout(fallback);
  }, [enabled, laidOut]);

  useEffect(() => {
    if (enabled && laidOut) startRef.current();
  }, [enabled, laidOut]);

  return useCallback(() => setLaidOut(true), []);
}

export function SheetPresentation({
  visible,
  onClose,
  onCloseTransitionEnd,
  backdropLabel,
  dismissOnBackdropPress = true,
  dismissOnPanDown = true,
  keyboardAvoiding = false,
  covered = false,
  contentKey,
  scrimTestID = 'bottom-sheet-scrim',
  ...content
}: SheetPresentationProps) {
  const reduceMotion = useReduceMotion();
  // A covered sheet lets the keyboard of the sheet above it pass it by.
  const layer = useSheetLayer(visible);
  const avoidsKeyboard = keyboardAvoiding && !layer.covered && !covered;
  const keyboardVisible = useKeyboardVisible(keyboardAvoiding) && avoidsKeyboard;
  const { height: windowHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(windowHeight);
  // 1 = closed (surface below the screen, scrim clear), 0 = open.
  const [progress] = useState(() => new Animated.Value(1));
  const [opened, setOpened] = useState(false);
  const onCloseTransitionEndRef = useRef(onCloseTransitionEnd);
  useEffect(() => {
    onCloseTransitionEndRef.current = onCloseTransitionEnd;
  }, [onCloseTransitionEnd]);

  // A change of `contentKey` is a NEW sheet: the surface that was showing
  // stays mounted with its last content and slides away while a fresh surface
  // slides up over it — never an instant swap inside the same surface.
  const [stack, setStack] = useState<{
    readonly activeId: number;
    readonly contentKey: string | undefined;
    readonly slidesIn: boolean;
    readonly leavingIds: readonly number[];
  }>({ activeId: 0, contentKey, slidesIn: false, leavingIds: [] });
  if (contentKey !== stack.contentKey) {
    const animated = visible && opened && !reduceMotion;
    setStack({
      activeId: stack.activeId + 1,
      contentKey,
      slidesIn: animated,
      leavingIds: animated ? [...stack.leavingIds, stack.activeId] : stack.leavingIds,
    });
  }

  // The surface whose slide-in has really started: the surfaces it replaces
  // leave at that very moment, not while the new one is still being mounted.
  const [enteredId, setEnteredId] = useState(0);

  // Bottom safe-area inset: the launch metrics, raised by the resting probe.
  const [probedInset, setProbedInset] = useState<number>();
  const bottomInset = Math.max(launchBottomInset ?? 0, probedInset ?? 0);
  const insetKnown = launchBottomInset !== undefined || probedInset !== undefined;
  const [surfaceLaidOut, setSurfaceLaidOut] = useState(false);

  // Open: slide up while the scrim fades in — once the first surface is laid
  // out at its final height (inset known).
  const markLaidOut = useStartAfterFirstLayout(visible && !opened, () => setOpened(true));
  useEffect(() => {
    if (surfaceLaidOut && insetKnown) markLaidOut();
  }, [surfaceLaidOut, insetKnown, markLaidOut]);
  // Close: slide down while the scrim fades out, THEN tell the host.
  useEffect(() => {
    if (visible && !opened) return;
    const animation = Animated.timing(progress, {
      duration: reduceMotion ? 0 : duration.panel,
      easing: slideEasing,
      toValue: visible ? 0 : 1,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) onCloseTransitionEndRef.current();
    });
    return () => animation.stop();
  }, [visible, opened, reduceMotion, progress]);

  // Drag on the grabber/header zone only: the body keeps scrolling freely.
  const panResponder = useMemo(() => {
    const settleBack = () =>
      Animated.timing(progress, {
        duration: duration.state,
        easing: slideEasing,
        toValue: 0,
        useNativeDriver: true,
      }).start();

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        dismissOnPanDown && gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        // Take over the value from any running open/close transition.
        progress.stopAnimation();
      },
      onPanResponderMove: (_event, gesture) => {
        progress.setValue(Math.min(Math.max(gesture.dy, 0) / Math.max(sheetHeight, 1), 1));
      },
      onPanResponderRelease: (_event, gesture) => {
        const dismiss =
          gesture.dy > sheet.dismissThreshold || (gesture.dy > 24 && gesture.vy > 0.8);
        if (dismiss) {
          onClose();
          return;
        }
        settleBack();
      },
      onPanResponderTerminate: settleBack,
    });
  }, [dismissOnPanDown, onClose, progress, sheetHeight]);

  const scrimOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const Anchor = keyboardAvoiding ? KeyboardAvoidingView : View;

  return (
    <SheetLayer cover={layer.cover}>
      <View style={styles.root}>
        <Animated.View pointerEvents="none" style={[styles.scrim, { opacity: scrimOpacity }]} />
        <Pressable
          accessibilityLabel={backdropLabel}
          accessibilityRole="button"
          disabled={!dismissOnBackdropPress}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID={scrimTestID}
        />
        {/* Resting probe: an empty safe-area view is exactly as tall as the inset. */}
        <SafeAreaView
          edges={['bottom']}
          onLayout={(event) => {
            const measured = Math.round(event.nativeEvent.layout.height);
            setProbedInset((current) => (current === measured ? current : measured));
          }}
          pointerEvents="none"
          style={styles.insetProbe}
        />
        <Anchor
          behavior={avoidsKeyboard && Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          // While the keyboard is up the detent's top gap is kept too: a tall
          // surface shrinks above the keyboard (its body scrolls) instead of
          // pushing its header off the top of the screen. Without the keyboard
          // `maxHeight` already bounds it (and percentage heights keep their base).
          style={[styles.anchor, keyboardVisible && { paddingTop: windowHeight * (1 - sheet.detent) }]}
        >
          {/* ONE keyed list: a surface keeps its identity (and its mounted
              content) when it goes from active to leaving. */}
          {[...stack.leavingIds, stack.activeId].map((id) =>
            id === stack.activeId ? (
              <SheetSurface
                key={id}
                content={content}
                bottomInset={keyboardVisible ? 0 : bottomInset}
                onClose={onClose}
                onMeasured={(measured) => {
                  setSheetHeight((current) => (current === measured ? current : measured));
                  setSurfaceLaidOut(true);
                }}
                onSlideInStart={() => setEnteredId(id)}
                panHandlers={panResponder.panHandlers}
                presentationProgress={progress}
                slidesIn={stack.slidesIn}
              />
            ) : (
              <SheetSurface
                key={id}
                bottomInset={keyboardVisible ? 0 : bottomInset}
                leaving
                released={enteredId === stack.activeId}
                onLeft={() =>
                  setStack((current) => ({
                    ...current,
                    leavingIds: current.leavingIds.filter((leavingId) => leavingId !== id),
                  }))
                }
                presentationProgress={progress}
              />
            ),
          )}
        </Anchor>
      </View>
    </SheetLayer>
  );
}

interface SheetSurfaceProps {
  /** Live content of the active surface; a leaving surface keeps its last one. */
  readonly content?: SheetSurfaceContent;
  readonly presentationProgress: Animated.Value;
  /** Bottom safe-area inset to keep inside the surface (0 while the keyboard is up). */
  readonly bottomInset: number;
  /** Mounted by a content change: slides up over the surface it replaces. */
  readonly slidesIn?: boolean;
  /** Replaced by a content change: slides away under the new surface, then `onLeft`. */
  readonly leaving?: boolean;
  /** Leaving only: the replacing surface has started to slide in. */
  readonly released?: boolean;
  readonly onSlideInStart?: () => void;
  readonly onLeft?: () => void;
  readonly onMeasured?: (height: number) => void;
  readonly onClose?: () => void;
  readonly panHandlers?: ReturnType<typeof PanResponder.create>['panHandlers'];
}

/** One sheet surface: material, grabber zone, header, body, action area. */
function SheetSurface({
  content,
  presentationProgress,
  bottomInset,
  slidesIn = false,
  leaving = false,
  released = false,
  onSlideInStart,
  onLeft,
  onMeasured,
  onClose,
  panHandlers,
}: SheetSurfaceProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [ownHeight, setOwnHeight] = useState(windowHeight);
  // 1 = below the screen, 0 = in place. Added to the presentation's progress.
  const [shift] = useState(() => new Animated.Value(slidesIn ? 1 : 0));
  // A leaving surface no longer receives content: it keeps showing its last.
  const [shown, setShown] = useState(content);
  if (content !== undefined && content !== shown) setShown(content);
  const onLeftRef = useRef(onLeft);
  useEffect(() => {
    onLeftRef.current = onLeft;
  }, [onLeft]);

  // In: once this surface is really laid out, like the first opening.
  const markLaidOut = useStartAfterFirstLayout(slidesIn, () => {
    onSlideInStart?.();
    Animated.timing(shift, {
      duration: duration.panel,
      easing: slideEasing,
      toValue: 0,
      useNativeDriver: true,
    }).start();
  });
  // Out: slide away under the new surface, then leave the tree.
  useEffect(() => {
    if (!leaving || !released) return;
    const animation = Animated.timing(shift, {
      duration: duration.panel,
      easing: slideEasing,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onLeftRef.current?.();
    });
    return () => animation.stop();
  }, [leaving, released, shift]);

  const material = shown?.material ?? 'satin';
  const glass = useSheetGlass(material);

  if (!shown) return null;
  const { height, header, scrollable = false, footer, padded = true, contentStyle, testID, surfaceTestID, children } =
    shown;
  // A content-fit sheet is sized by its body, so the shell only shrinks. A
  // fixed-height sheet is the opposite: the shell and the body must GROW into
  // the surface, otherwise a flex child (a FlatList) collapses to zero height.
  const fillsSurface = height !== undefined;
  const bodyStyle = [padded && styles.padded, contentStyle];
  const translateY = Animated.add(presentationProgress, shift).interpolate({
    extrapolate: 'clamp',
    inputRange: [0, 1],
    outputRange: [0, ownHeight],
  });

  return (
    <Animated.View
      // A leaving surface is a picture of the previous sheet: no touches, not
      // announced, out of the layout flow so the new surface sizes itself.
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      onLayout={(event) => {
        const measured = Math.ceil(event.nativeEvent.layout.height);
        setOwnHeight((current) => (current === measured ? current : measured));
        onMeasured?.(measured);
        markLaidOut();
      }}
      pointerEvents={leaving ? 'none' : 'auto'}
      style={[
        styles.sheet,
        sheetSurfaceStyle(glass),
        leaving && styles.leavingSheet,
        { maxHeight: windowHeight * sheet.detent },
        height !== undefined && { height },
        { transform: [{ translateY }] },
      ]}
      testID={surfaceTestID}
    >
      <View
        accessibilityViewIsModal={!leaving}
        onAccessibilityEscape={onClose}
        style={[styles.content, fillsSurface && styles.fill, { paddingBottom: bottomInset }]}
        testID={testID}
      >
        {/* First child, under the content. Absolute, so it spans the whole
            sheet, bottom safe area included. */}
        <SheetGlassBackdrop active={glass} />
        <SurfaceGloss material={material} shape={styles.sheetShape} testID="bottom-sheet-gloss" />
        <View
          accessible={false}
          style={styles.dragZone}
          testID="bottom-sheet-drag-zone"
          {...panHandlers}
        >
          <SheetGrabber />
          {header && <View style={styles.padded}>{header}</View>}
        </View>
        {scrollable ? (
          <ScrollView
            contentContainerStyle={bodyStyle}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={[styles.scroll, fillsSurface && styles.fill]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.body, fillsSurface && styles.fill, bodyStyle]}>{children}</View>
        )}
        {footer}
      </View>
    </Animated.View>
  );
}

/** The BeautIzzy grabber: shared by every sheet shell. */
export function SheetGrabber() {
  return <View accessible={false} style={styles.grabber} />;
}

/** Tracks the software keyboard so the bottom safe-area inset is not doubled. */
function useKeyboardVisible(enabled: boolean): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [enabled]);

  return enabled && visible;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: scrim,
  },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  insetProbe: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  sheet: {
    flexShrink: 1,
    backgroundColor: overlayMaterial.surface,
    borderCurve: 'continuous',
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
    overflow: 'hidden',
    ...nativeShadows.sheet,
  },
  // The gloss follows the sheet's own outline.
  // Out of the flow, still anchored to the bottom edge, under the new surface.
  leavingSheet: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  sheetShape: {
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
  },
  content: { flexShrink: 1 },
  dragZone: { flexShrink: 0 },
  grabber: {
    alignSelf: 'center',
    backgroundColor: overlayMaterial.grabber,
    borderRadius: radii.pill,
    height: sheet.grabberHeight,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
    width: sheet.grabberWidth,
  },
  padded: { paddingHorizontal: horizontalGutter },
  body: { flexShrink: 1 },
  scroll: { flexShrink: 1 },
  fill: { flex: 1 },
});

// Souris — FloatingCreateButton
//
// The ONE floating creation action of screens whose primary action is
// "add / create": a compact violet circle with a white plus, fixed
// bottom-right above the tab bar / home indicator (its own bottom safe-area
// edge, so it works inside a tab and on a pushed screen alike), with a light
// lavender-tinted elevation. Never part of the scrolling content — screens
// keep `bottomClearance` padding under their lists so the last row scrolls
// above it.
//
// Reveal on focus: several screens carry the + in the same place, so a tab
// switch would read as the button sliding from one screen to the next. The
// button therefore starts hidden and unavailable, and a very short settling
// moment after the screen gains focus it fades and rises into place
// (`floatingAction.revealDelay`, `duration.state`, no bounce). Losing focus
// hides it at once, closes any menu and resets the reveal, so the next focus
// gets the same entrance and no stale + lingers. Reduced motion shows the
// button immediately.
//
// Single action  → `onPress` opens the existing flow directly.
// Several actions → `actions` expand into a compact menu anchored above the
// button (fade + rise), each option an icon + label pill on a subtle Souris
// surface. A transparent layer catches outside taps; choosing an option
// closes the menu first, then runs the action. The plus rotates to a cross
// while the menu is open. No scrim, no drawer, no native action sheet.

import { useFocusEffect } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { haptics } from '@/shared/lib/haptics';

import { AppText } from './AppText';
import {
  duration,
  easing,
  floatingAction,
  gutter,
  interaction,
  nativeShadows,
  radii,
  semanticColors,
} from './theme';
import { useReduceMotion } from './useReduceMotion';

export interface FloatingCreateAction {
  readonly label: string;
  readonly icon: SymbolViewProps['name'];
  readonly onPress: () => void;
  readonly testID?: string;
}

interface FloatingCreateButtonProps {
  readonly accessibilityLabel: string;
  /** Direct action (single creation flow). */
  readonly onPress?: () => void;
  /** Menu of creation flows (two or more); ignored when `onPress` is set. */
  readonly actions?: readonly FloatingCreateAction[];
  /** Controlled menu state (lets a screen close the menu when it loses focus). */
  readonly menuOpen?: boolean;
  readonly onMenuOpenChange?: (open: boolean) => void;
  readonly testID?: string;
}

const motionEasing = Easing.bezier(...easing.out);

export function FloatingCreateButton({
  accessibilityLabel,
  onPress,
  actions,
  menuOpen,
  onMenuOpenChange,
  testID = 'floating-create-button',
}: FloatingCreateButtonProps) {
  const reduceMotion = useReduceMotion();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = menuOpen ?? internalOpen;
  // The menu stays mounted while it fades out.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const [progress] = useState(() => new Animated.Value(0));
  const hasMenu = onPress === undefined && (actions?.length ?? 0) > 0;

  // Reveal lifecycle: hidden and unavailable until the screen has settled.
  const [revealed, setRevealed] = useState(false);
  const [reveal] = useState(() => new Animated.Value(0));
  const menuOpenControlled = menuOpen !== undefined;
  const onMenuOpenChangeRef = useRef(onMenuOpenChange);
  useEffect(() => {
    onMenuOpenChangeRef.current = onMenuOpenChange;
  }, [onMenuOpenChange]);

  useFocusEffect(
    useCallback(() => {
      let animation: Animated.CompositeAnimation | undefined;
      const show = () => {
        setRevealed(true);
        if (reduceMotion) {
          reveal.setValue(1);
          return;
        }
        animation = Animated.timing(reveal, {
          duration: duration.state,
          easing: motionEasing,
          toValue: 1,
          useNativeDriver: true,
        });
        animation.start();
      };
      const timer = reduceMotion ? undefined : setTimeout(show, floatingAction.revealDelay);
      if (reduceMotion) show();

      return () => {
        // Blur: hide at once, close any menu, reset for the next entrance.
        if (timer !== undefined) clearTimeout(timer);
        animation?.stop();
        reveal.setValue(0);
        setRevealed(false);
        if (!menuOpenControlled) setInternalOpen(false);
        onMenuOpenChangeRef.current?.(false);
      };
    }, [reduceMotion, reveal, menuOpenControlled]),
  );

  const setOpen = (next: boolean) => {
    if (!menuOpenControlled) setInternalOpen(next);
    onMenuOpenChange?.(next);
  };

  useEffect(() => {
    if (!mounted) return;
    const animation = Animated.timing(progress, {
      duration: reduceMotion ? 0 : duration.disclosure,
      easing: motionEasing,
      toValue: open ? 1 : 0,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
    return () => animation.stop();
  }, [open, mounted, progress, reduceMotion]);

  const press = () => {
    haptics.selection();
    if (hasMenu) {
      setOpen(!open);
      return;
    }
    onPress?.();
  };

  const choose = (action: FloatingCreateAction) => {
    setOpen(false);
    action.onPress();
  };

  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
  const menuStyle = {
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  };
  const revealStyle = {
    opacity: reveal,
    transform: [
      { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [floatingAction.revealRise, 0] }) },
    ],
  };

  return (
    <>
      {mounted && (
        <Pressable
          accessibilityLabel="Fermer le menu"
          accessibilityRole="button"
          onPress={() => setOpen(false)}
          style={StyleSheet.absoluteFill}
          testID={`${testID}-dismiss`}
        />
      )}
      <SafeAreaView
        edges={['bottom']}
        pointerEvents={revealed ? 'box-none' : 'none'}
        style={styles.anchor}
        testID={`${testID}-anchor`}
      >
        {mounted && (
          <Animated.View
            accessibilityRole="menu"
            pointerEvents={open ? 'auto' : 'none'}
            style={[styles.menu, menuStyle]}
            testID={`${testID}-menu`}
          >
            {actions?.map((action) => (
              <Pressable
                accessibilityLabel={action.label}
                accessibilityRole="menuitem"
                key={action.label}
                onPress={() => choose(action)}
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                testID={action.testID}
              >
                <AppText variant="control" style={styles.optionLabel}>
                  {action.label}
                </AppText>
                <View style={styles.optionIcon}>
                  <SymbolView name={action.icon} size={17} tintColor={semanticColors.accent} />
                </View>
              </Pressable>
            ))}
          </Animated.View>
        )}
        <Animated.View
          accessibilityElementsHidden={!revealed}
          importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
          style={revealStyle}
        >
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            accessibilityState={hasMenu ? { expanded: open } : undefined}
            hitSlop={4}
            onPress={press}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            testID={testID}
          >
            <Animated.View style={{ transform: [{ rotate }] }}>
              <SymbolView
                name={{ ios: 'plus', android: 'add' }}
                size={24}
                tintColor={semanticColors.surfaceElevated}
                weight="semibold"
              />
            </Animated.View>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </>
  );
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const styles = StyleSheet.create({
  anchor: {
    alignItems: 'flex-end',
    bottom: floatingAction.inset,
    position: 'absolute',
    right: horizontalGutter,
  },
  button: {
    alignItems: 'center',
    backgroundColor: semanticColors.accent,
    borderRadius: radii.pill,
    height: floatingAction.size,
    justifyContent: 'center',
    width: floatingAction.size,
    ...nativeShadows.floating,
  },
  buttonPressed: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  menu: {
    alignItems: 'flex-end',
    gap: floatingAction.menuGap,
    marginBottom: floatingAction.menuGap,
  },
  option: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingLeft: 18,
    paddingRight: 6,
    ...nativeShadows.raised,
  },
  optionPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  optionLabel: { color: semanticColors.foreground },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});

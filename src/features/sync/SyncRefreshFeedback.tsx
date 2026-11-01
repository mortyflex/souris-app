// BeautIzzy — SyncRefreshFeedback
//
// The ONE visible answer to a manual refresh that could not synchronize: a
// small floating glass capsule — the material of the receipt printer's action
// notice — that appears under the status bar for a moment and leaves. Mounted
// ONCE above the app's screens; it never takes room, never takes touches,
// never stays. It shows nothing on success and nothing for the automatic
// runs: only the line a pull gesture published (refresh-feedback.ts). The
// screen reader hears that same line from the announcement the gesture
// makes; the capsule is therefore hidden from assistive tech, so nothing is
// said twice. A newer line replaces the current one, nothing stacks.
//
// Core Animated (no Reanimated worklet): a short fade and drop in, a fade out
// — and no motion at all under Reduce Motion.

import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/shared/ui/AppText';
import { GlassSurface } from '@/shared/ui/GlassSurface';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';
import { useReduceMotion } from '@/shared/ui/useReduceMotion';

import { subscribeSyncRefreshFeedback } from './refresh-feedback';

export const SYNC_REFRESH_FEEDBACK_TEST_ID = 'sync-refresh-feedback';
/** How long the capsule stays, like the ticket « enregistré » notices. */
export const SYNC_REFRESH_FEEDBACK_DURATION = 2600;
const PRESENCE_MS = 220;
const PRESENCE_TRAVEL = 8;

export function SyncRefreshFeedback() {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReduceMotion();
  const [text, setText] = useState<string | null>(null);
  const [presence] = useState(() => new Animated.Value(0));

  useEffect(() => subscribeSyncRefreshFeedback(setText), []);

  // One hold per line: a newer line restarts it.
  useEffect(() => {
    if (text === null) return;
    const hide = setTimeout(() => setText(null), SYNC_REFRESH_FEEDBACK_DURATION);
    return () => clearTimeout(hide);
  }, [text]);

  useEffect(() => {
    if (reducedMotion) {
      presence.setValue(text === null ? 0 : 1);
      return;
    }
    const animation = Animated.timing(presence, {
      toValue: text === null ? 0 : 1,
      duration: PRESENCE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [presence, reducedMotion, text]);

  if (text === null) return null;

  return (
    <View pointerEvents="none" style={[styles.host, { top: insets.top + spacing.sm }]}>
      <Animated.View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.capsule,
          {
            opacity: presence,
            transform: [
              { translateY: presence.interpolate({ inputRange: [0, 1], outputRange: [-PRESENCE_TRAVEL, 0] }) },
            ],
          },
        ]}
        testID={SYNC_REFRESH_FEEDBACK_TEST_ID}
      >
        <GlassSurface floating shape={styles.capsuleShape} />
        <AppText style={styles.text} testID={`${SYNC_REFRESH_FEEDBACK_TEST_ID}-text`} variant="metadata">
          {text}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above the native screen stack it follows: Android orders elevated siblings by
  // elevation first, so the host carries one (ignored on iOS, where zIndex rules).
  host: {
    alignItems: 'center',
    elevation: 12,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 10,
  },
  // Room for the longest line on one row of a 390 pt phone; narrower screens wrap.
  capsule: {
    borderRadius: radii.pill,
    marginHorizontal: spacing.base,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  capsuleShape: { borderRadius: radii.pill },
  text: { color: semanticColors.foreground, textAlign: 'center' },
});

import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/shared/ui/AppText';
import { colors, easing, foregroundSoft, lavender, radii, spacing } from '@/shared/ui/theme';

import type { AppointmentDetailService } from '../presentation';
import {
  formatAppointmentTime,
  formatDurationMinutes,
  formatPrice,
  isServicePhaseRedundant,
} from '../presentation';
import { AppointmentPhaseRow } from './AppointmentPhaseRow';

const TRANSITION_DURATION_MS = 240;
const TRANSITION_EASING = Easing.bezier(...easing.out);

interface AppointmentServiceSectionProps {
  readonly service: AppointmentDetailService;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

export function AppointmentServiceSection({
  service,
  expanded,
  onToggle,
}: AppointmentServiceSectionProps) {
  const { item, timelineItem } = service;
  const simple = isServicePhaseRedundant(service);
  const reducedMotion = useReducedMotion();
  const chevronProgress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    chevronProgress.set(
      withTiming(expanded ? 1 : 0, {
        duration: reducedMotion ? 0 : TRANSITION_DURATION_MS,
        easing: TRANSITION_EASING,
      }),
    );
  }, [expanded, chevronProgress, reducedMotion]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(chevronProgress.get(), [0, 1], [0, 90])}deg` }],
  }));

  const layoutTransition = useMemo(
    () => LinearTransition.duration(reducedMotion ? 0 : TRANSITION_DURATION_MS).easing(TRANSITION_EASING),
    [reducedMotion],
  );

  const enteringAnimation = useMemo(
    () => (reducedMotion ? undefined : FadeIn.duration(200).easing(TRANSITION_EASING)),
    [reducedMotion],
  );

  const exitingAnimation = useMemo(
    () => (reducedMotion ? undefined : FadeOut.duration(150).easing(TRANSITION_EASING)),
    [reducedMotion],
  );

  const durationLabel = formatDurationMinutes(timelineItem.durationMinutes);
  const phaseCount = timelineItem.phases.length;
  const metaLabel = simple
    ? durationLabel
    : `${durationLabel} · ${phaseCount} phase${phaseCount > 1 ? 's' : ''}`;

  const headerContent = (
    <>
      <View style={styles.timeCapsule}>
        <AppText variant="chip" selectable style={styles.time}>
          {formatAppointmentTime(timelineItem.startAt)}
        </AppText>
      </View>
      <View style={styles.titleBody}>
        <AppText variant="control" numberOfLines={1} selectable style={styles.serviceName}>
          {item.serviceName}
        </AppText>
        <AppText variant="metadata" style={styles.serviceMeta}>
          {metaLabel}
        </AppText>
      </View>
      <AppText variant="metadata" selectable style={styles.price}>
        {formatPrice(item.price)}
      </AppText>
      {!simple && (
        <Animated.View style={[styles.chevronBox, chevronStyle]}>
          <AppText variant="control" style={styles.chevron}>
            ›
          </AppText>
        </Animated.View>
      )}
    </>
  );

  return (
    <Animated.View layout={layoutTransition} style={styles.container}>
      {simple ? (
        <View accessibilityLabel={item.serviceName} style={styles.header}>
          {headerContent}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.serviceName}, commence à ${formatAppointmentTime(timelineItem.startAt)}`}
          accessibilityState={{ expanded }}
          onPress={onToggle}
          style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        >
          {headerContent}
        </Pressable>
      )}
      {!simple && expanded && (
        <Animated.View entering={enteringAnimation} exiting={exitingAnimation}>
          <View style={styles.expandedBody}>
            {timelineItem.phases.map((phase, index) => (
              <AppointmentPhaseRow key={phase.phaseId} phase={phase} isFirst={index === 0} />
            ))}
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: lavender.lav050,
    borderColor: lavender.lav200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: lavender.lav100 },
  timeCapsule: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: lavender.lav200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginRight: spacing.sm,
    minWidth: 48,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  time: { color: lavender.lav700, fontVariant: ['tabular-nums'] },
  titleBody: { flex: 1, gap: 2, minWidth: 0 },
  serviceName: { color: colors.foreground },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  price: { color: foregroundSoft, fontVariant: ['tabular-nums'], marginLeft: spacing.sm },
  chevronBox: {
    alignItems: 'center',
    height: 20,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    width: 20,
  },
  chevron: { color: lavender.lav700, fontSize: 20, lineHeight: 22 },
  expandedBody: {
    borderTopColor: lavender.lav200,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

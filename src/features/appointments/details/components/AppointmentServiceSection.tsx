import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { AppText } from '@/shared/ui/AppText';
import { DisclosureChevron } from '@/shared/ui/DisclosureChevron';
import {
  duration,
  easing,
  foregroundSoft,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { AppointmentDetailService } from '../presentation';
import {
  formatAppointmentTime,
  formatDurationMinutes,
  formatPrice,
  isServicePhaseRedundant,
} from '../presentation';
import { AppointmentPhaseRow } from './AppointmentPhaseRow';

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

  const layoutTransition = useMemo(
    () => LinearTransition.duration(reducedMotion ? 0 : duration.settle).easing(TRANSITION_EASING),
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
      <AppText variant="chip" selectable style={styles.time}>
        {formatAppointmentTime(timelineItem.startAt)}
      </AppText>
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
        <DisclosureChevron expanded={expanded} style={styles.chevron} />
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
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: semanticColors.surfaceLavenderStrong },
  time: {
    color: semanticColors.accent,
    fontVariant: ['tabular-nums'],
    marginRight: spacing.sm,
    minWidth: 40,
  },
  titleBody: { flex: 1, gap: 2, minWidth: 0 },
  serviceName: { color: semanticColors.foreground },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  price: { color: foregroundSoft, fontVariant: ['tabular-nums'], marginLeft: spacing.sm },
  chevron: { marginLeft: spacing.sm },
  expandedBody: {
    backgroundColor: semanticColors.surfaceElevated,
    paddingVertical: spacing.xs,
  },
});

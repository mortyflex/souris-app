import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, lavender, radii, spacing } from '@/shared/ui/theme';

import type { AppointmentDetailService } from '../presentation';
import {
  formatAppointmentTime,
  formatDurationMinutes,
  formatPrice,
  isServicePhaseRedundant,
} from '../presentation';
import { AppointmentPhaseRow } from './AppointmentPhaseRow';

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

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.serviceName}, commence à ${formatAppointmentTime(timelineItem.startAt)}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.startTimeBadge}>
          <AppText variant="chip" selectable style={styles.startTime}>
            {formatAppointmentTime(timelineItem.startAt)}
          </AppText>
        </View>
        <AppText variant="control" numberOfLines={1} selectable style={styles.serviceName}>
          {item.serviceName}
        </AppText>
        <AppText variant="metadata" style={styles.price}>
          {formatPrice(item.price)}
        </AppText>
        <AppText variant="control" style={styles.chevron}>
          {expanded ? '⌃' : '›'}
        </AppText>
      </Pressable>
      {expanded && (
        <View accessibilityLiveRegion="polite">
          {isServicePhaseRedundant(service) ? (
            <View style={styles.simpleMeta}>
              <AppText variant="metadata" selectable style={styles.simpleDuration}>
                {formatDurationMinutes(timelineItem.durationMinutes)}
              </AppText>
            </View>
          ) : (
            timelineItem.phases.map((phase) => (
              <AppointmentPhaseRow key={phase.phaseId} phase={phase} />
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderColor: lavender.lav200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 60,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: lavender.lav025 },
  startTimeBadge: {
    alignItems: 'center',
    backgroundColor: lavender.lav050,
    borderColor: lavender.lav200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    marginRight: spacing.sm,
    minWidth: 52,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  simpleMeta: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  simpleDuration: { color: foregroundSoft, textAlign: 'right' },
  startTime: { color: lavender.lav700 },
  serviceName: { color: colors.foreground, flex: 1, minWidth: 0 },
  price: { color: foregroundSoft, marginLeft: spacing.sm },
  chevron: { color: lavender.lav700, fontSize: 22, marginLeft: spacing.sm, width: 22 },
});

// BeautIzzy — Calendar Block row (Agenda Week)
//
// Same row construction as a Week Appointment — marker, start time, two lines —
// so the list stays one list; the content is what tells it apart: the fixed
// mauve marker, the glyph and « Indisponible » where a client name would be,
// then the reason and the end of the block. Never a client, a service, a
// status or a price.

import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import type { CalendarBlock } from '@/domain/calendar-blocks';
import {
  CALENDAR_BLOCK_TITLE,
  formatBlockTime,
  getCalendarBlockAccessibilityLabel,
} from '@/features/calendar-blocks/presentation';
import { calendarBlockIcon } from '@/shared/icons/calendar-block-icon';
import { AppText } from '@/shared/ui/AppText';
import { calendarBlockColors, foregroundSoft, radii, spacing } from '@/shared/ui/theme';

interface WeekCalendarBlockRowProps {
  readonly calendarBlock: CalendarBlock;
}

export function WeekCalendarBlockRow({ calendarBlock }: WeekCalendarBlockRowProps) {
  const router = useRouter();

  return (
    <Pressable
      accessible
      accessibilityHint="Ouvre le détail du créneau indisponible"
      accessibilityLabel={getCalendarBlockAccessibilityLabel(calendarBlock)}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/calendar-blocks/[calendarBlockId]',
          params: { calendarBlockId: calendarBlock.id },
        })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`week-calendar-block-${calendarBlock.id}`}
    >
      <View style={styles.marker} />
      <AppText variant="metadata" style={styles.time}>
        {formatBlockTime(calendarBlock.startAt)}
      </AppText>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SymbolView name={calendarBlockIcon} size={13} tintColor={calendarBlockColors.accent} />
          </View>
          <AppText variant="rowTitle" numberOfLines={1} style={styles.title}>
            {CALENDAR_BLOCK_TITLE}
          </AppText>
        </View>
        <AppText variant="metadata" numberOfLines={1} style={styles.reason}>
          {`${calendarBlock.reason} · jusqu'à ${formatBlockTime(calendarBlock.endAt)}`}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: radii.medium,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pressed: { backgroundColor: calendarBlockColors.surface },
  marker: {
    backgroundColor: calendarBlockColors.accent,
    borderRadius: 2,
    height: 26,
    marginRight: spacing.sm,
    width: 3,
  },
  time: { color: foregroundSoft, width: 54 },
  body: { flex: 1, minWidth: 0, paddingRight: spacing.sm },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  title: { color: calendarBlockColors.title, flexShrink: 1, lineHeight: 18 },
  reason: { color: calendarBlockColors.subtitle },
});

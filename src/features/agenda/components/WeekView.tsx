import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { TabBarGlassScrollEdge } from '@/shared/ui/TabBarGlassScrollEdge';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import {
  bottomClearance,
  gutter,
  semanticColors,
  spacing,
  touchTarget,
} from '@/shared/ui/theme';

import { groupAppointmentsByLocalDay } from '../calendar/week-appointments';
import { addLocalDays, getWeekDays, getStartOfWeek } from '../calendar/week';
import { WeekDaySection } from './WeekDaySection';

interface WeekViewProps {
  readonly selectedDay: Date;
  readonly today: Date;
  readonly appointments: readonly AppointmentSessionEntry[];
  readonly onSelectDay: (day: Date) => void;
  readonly onShiftWeek: (amount: number) => void;
}

const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const yearFormatter = new Intl.DateTimeFormat('fr-FR', { year: 'numeric' });

function formatWeekRange(date: Date): string {
  const start = getStartOfWeek(date);
  const end = addLocalDays(start, 6);
  const startMonth = monthFormatter.format(start).replace(/\.$/, '');
  const endMonth = monthFormatter.format(end).replace(/\.$/, '');
  const startYear = yearFormatter.format(start);
  const endYear = yearFormatter.format(end);
  const startDay = start.getDate();
  const endDay = end.getDate();

  if (startYear !== endYear) {
    return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
  }
  return `${startDay} – ${endDay} ${endMonth}`;
}

export function WeekView({
  selectedDay,
  today,
  appointments,
  onSelectDay,
  onShiftWeek,
}: WeekViewProps) {
  const days = getWeekDays(selectedDay);
  const groups = groupAppointmentsByLocalDay(appointments, days);
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  const bottomPadding = Platform.OS === 'android' ? bottomClearance.android : bottomClearance.ios;
  const minimumTouchTarget = Platform.OS === 'android' ? touchTarget.android : touchTarget.ios;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.weekHeader,
          { minHeight: minimumTouchTarget, paddingHorizontal: horizontalGutter },
        ]}
      >
        <GlassIconButton
          accessibilityLabel="Semaine précédente"
          icon={glassIcons.previous}
          onPress={() => onShiftWeek(-1)}
        />
        <AppText variant="control" style={styles.range}>
          {formatWeekRange(selectedDay)}
        </AppText>
        <GlassIconButton
          accessibilityLabel="Semaine suivante"
          icon={glassIcons.next}
          onPress={() => onShiftWeek(1)}
        />
      </View>
      <TabBarGlassScrollEdge>
        <ScrollView
          // Native tab bar overlay: system bottom inset, see DayTimeline.
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: horizontalGutter, paddingBottom: bottomPadding },
          ]}
        >
          {groups.map((group) => (
            <WeekDaySection
              key={`${group.day.getFullYear()}-${group.day.getMonth()}-${group.day.getDate()}`}
              appointments={group.appointments}
              day={group.day}
              selectedDay={selectedDay}
              today={today}
              onSelectDay={onSelectDay}
            />
          ))}
        </ScrollView>
      </TabBarGlassScrollEdge>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  weekHeader: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  range: { color: semanticColors.foreground },
  scrollContent: { paddingTop: spacing.sm },
});

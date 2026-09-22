import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import type { CalendarBlock } from '@/domain/calendar-blocks';
import {
  PeriodNavigator,
  PeriodNavigatorCopy,
  PeriodNavigatorNote,
} from '@/shared/ui/PeriodNavigator';
import { TabBarGlassScrollEdge } from '@/shared/ui/TabBarGlassScrollEdge';
import type { AppointmentSessionEntry } from '@/features/appointments/session/types';
import {
  bottomClearance,
  gutter,
  spacing,
} from '@/shared/ui/theme';

import {
  getCalendarBlocksOfLocalDay,
  groupAppointmentsByLocalDay,
} from '../calendar/week-appointments';
import { addLocalDays, getWeekDays, getStartOfWeek } from '../calendar/week';
import { WeekDaySection } from './WeekDaySection';

interface WeekViewProps {
  readonly selectedDay: Date;
  readonly today: Date;
  readonly appointments: readonly AppointmentSessionEntry[];
  readonly calendarBlocks?: readonly CalendarBlock[];
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
  calendarBlocks = [],
  onSelectDay,
  onShiftWeek,
}: WeekViewProps) {
  const days = getWeekDays(selectedDay);
  const groups = groupAppointmentsByLocalDay(appointments, days);
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  const bottomPadding = Platform.OS === 'android' ? bottomClearance.android : bottomClearance.ios;
  // A quiet « Cette semaine » under the range, like « Aujourd’hui » in Jour.
  const isCurrentWeek = getStartOfWeek(selectedDay).getTime() === getStartOfWeek(today).getTime();

  return (
    <View style={styles.container}>
      <PeriodNavigator
        nextLabel="Semaine suivante"
        onNext={() => onShiftWeek(1)}
        onPrevious={() => onShiftWeek(-1)}
        previousLabel="Semaine précédente"
        style={[styles.periodNavigation, { marginHorizontal: horizontalGutter }]}
        testID="agenda-week"
      >
        <PeriodNavigatorCopy
          secondary={
            isCurrentWeek ? (
              <PeriodNavigatorNote testID="agenda-week-current">Cette semaine</PeriodNavigatorNote>
            ) : undefined
          }
          title={formatWeekRange(selectedDay)}
          titleTestID="agenda-week-range"
        />
      </PeriodNavigator>
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
              calendarBlocks={getCalendarBlocksOfLocalDay(calendarBlocks, group.day)}
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
  // Same grouped surface and rhythm as the Jour navigator.
  periodNavigation: { marginBottom: spacing.sm, marginTop: spacing.xs },
  scrollContent: { paddingTop: spacing.sm },
});

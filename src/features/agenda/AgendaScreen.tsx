import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, gutter, lavender, spacing } from '@/shared/ui/theme';

import { AgendaViewSwitcher, type AgendaViewMode } from './components/AgendaViewSwitcher';
import { DayTimeline } from './components/DayTimeline';
import { WeekView } from './components/WeekView';
import { getWeekDays, isSameLocalDay, shiftWeek, startOfLocalDay } from './calendar/week';
import { createAgendaFixtures } from './fixtures/agenda-fixtures';

const dayNames = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
}

export function AgendaScreen() {
  const [today] = useState(() => startOfLocalDay(new Date()));
  const [selectedDay, setSelectedDay] = useState(today);
  const [mode, setMode] = useState<AgendaViewMode>('day');
  const [allAppointments] = useState(() => createAgendaFixtures(today));
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  const selectedDayAppointments = allAppointments.filter(({ appointment }) =>
    isSameLocalDay(appointment.startAt, selectedDay),
  );

  const selectDay = (day: Date) => {
    setSelectedDay(startOfLocalDay(day));
    setMode('day');
  };

  const shiftSelectedWeek = (amount: number) => {
    setSelectedDay(shiftWeek(selectedDay, amount));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: horizontalGutter }]}>
        <AppText variant="eyebrow">{mode === 'day' ? formatDate(selectedDay) : 'Vue semaine'}</AppText>
        <AppText variant="screenTitle" accessibilityRole="header">
          {mode === 'day' && isSameLocalDay(selectedDay, today) ? "Aujourd'hui" : 'Agenda'}
        </AppText>
        <AgendaViewSwitcher mode={mode} onChange={setMode} />
      </View>
      {mode === 'day' ? (
        <>
          <View style={[styles.dayStrip, { paddingHorizontal: horizontalGutter }]}>
            {getWeekDays(selectedDay).map((day, index) => {
              const selected = isSameLocalDay(day, selectedDay);
              const hasAppointments = allAppointments.some(({ appointment }) =>
                isSameLocalDay(appointment.startAt, day),
              );
              return (
                <View key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}>
                  <AgendaDayButton
                    day={day}
                    dayName={dayNames[index]}
                    hasAppointments={hasAppointments}
                    selected={selected}
                    onPress={selectDay}
                  />
                </View>
              );
            })}
          </View>
          <DayTimeline day={selectedDay} appointments={selectedDayAppointments} />
        </>
      ) : (
        <WeekView
          appointments={allAppointments}
          selectedDay={selectedDay}
          today={today}
          onSelectDay={selectDay}
          onShiftWeek={shiftSelectedWeek}
        />
      )}
    </SafeAreaView>
  );
}

interface AgendaDayButtonProps {
  readonly day: Date;
  readonly dayName: string;
  readonly hasAppointments: boolean;
  readonly selected: boolean;
  readonly onPress: (day: Date) => void;
}

function AgendaDayButton({ day, dayName, hasAppointments, selected, onPress }: AgendaDayButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${dayName} ${day.getDate()}`}
      onPress={() => onPress(day)}
      style={[styles.dayCell, selected && styles.selectedDayCell]}
    >
      <AppText variant="metadata" style={[styles.dayName, selected && styles.selectedText]}>
        {dayName}
      </AppText>
      <AppText variant="rowTitle" style={[styles.dayNumber, selected && styles.selectedText]}>
        {day.getDate()}
      </AppText>
      <View style={[styles.loadDot, hasAppointments && styles.activeLoadDot]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.md },
  dayStrip: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  dayCell: {
    alignItems: 'center',
    borderRadius: 18,
    minHeight: 58,
    paddingHorizontal: 8,
    paddingVertical: 5,
    width: 44,
  },
  selectedDayCell: { backgroundColor: lavender.lav100 },
  dayName: { color: foregroundSoft, fontSize: 10, lineHeight: 14, textTransform: 'capitalize' },
  dayNumber: { fontSize: 15, lineHeight: 20 },
  selectedText: { color: lavender.lav700 },
  loadDot: { backgroundColor: colors.border, borderRadius: 2.5, height: 5, marginTop: 3, width: 5 },
  activeLoadDot: { backgroundColor: lavender.lav700 },
});

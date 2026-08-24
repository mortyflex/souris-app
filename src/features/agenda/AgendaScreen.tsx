import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/ui/AppText';
import { colors, foregroundSoft, gutter, lavender, spacing } from '@/shared/ui/theme';

import { DayTimeline } from './components/DayTimeline';
import { createAgendaFixtures } from './fixtures/agenda-fixtures';

const dayNames = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
}

export function AgendaScreen() {
  const [today] = useState(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState(today);
  const weekStart = addDays(today, -((today.getDay() + 6) % 7));
  const appointments = isSameDay(selectedDay, today) ? createAgendaFixtures(selectedDay) : [];
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: horizontalGutter }]}>
        <AppText variant="eyebrow">{formatDate(selectedDay)}</AppText>
        <AppText variant="screenTitle" accessibilityRole="header">
          {isSameDay(selectedDay, today) ? "Aujourd'hui" : 'Agenda'}
        </AppText>
      </View>
      <View style={[styles.dayStrip, { paddingHorizontal: horizontalGutter }]}>
        {Array.from({ length: 7 }, (_, index) => {
          const day = addDays(weekStart, index);
          const selected = isSameDay(day, selectedDay);
          const hasAppointments = isSameDay(day, today);
          return (
            <Pressable
              key={dayKey(day)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${dayNames[index]} ${day.getDate()}`}
              onPress={() => setSelectedDay(day)}
              style={[styles.dayCell, selected && styles.selectedDayCell]}
            >
              <AppText variant="metadata" style={[styles.dayName, selected && styles.selectedText]}>
                {dayNames[index]}
              </AppText>
              <AppText variant="rowTitle" style={[styles.dayNumber, selected && styles.selectedText]}>
                {day.getDate()}
              </AppText>
              <View style={[styles.loadDot, hasAppointments && styles.activeLoadDot]} />
            </Pressable>
          );
        })}
      </View>
      <DayTimeline day={selectedDay} appointments={appointments} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  header: { gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.md },
  dayStrip: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: spacing.sm },
  dayCell: { alignItems: 'center', borderRadius: 18, minHeight: 58, paddingHorizontal: 8, paddingVertical: 5, width: 44 },
  selectedDayCell: { backgroundColor: lavender.lav100 },
  dayName: { color: foregroundSoft, fontSize: 10, lineHeight: 14, textTransform: 'capitalize' },
  dayNumber: { fontSize: 15, lineHeight: 20 },
  selectedText: { color: lavender.lav700 },
  loadDot: { backgroundColor: colors.border, borderRadius: 2.5, height: 5, marginTop: 3, width: 5 },
  activeLoadDot: { backgroundColor: lavender.lav700 },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { useFocusEffect } from 'expo-router';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/shared/ui/AppText';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { AgendaViewSwitcher, type AgendaViewMode } from './components/AgendaViewSwitcher';
import { DayTimeline } from './components/DayTimeline';
import { WeekView } from './components/WeekView';
import {
  addLocalDays,
  followTodayChange,
  getStartOfWeek,
  getWeekDays,
  isSameLocalDay,
  shiftWeek,
  startOfLocalDay,
} from './calendar/week';
import { useAppointmentSession } from '@/features/appointments/session/AppointmentSessionProvider';
import { getOperationalAgendaEntries } from './operational-visibility';

const dayNames = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const yearFormatter = new Intl.DateTimeFormat('fr-FR', { year: 'numeric' });

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
}

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

export function AgendaScreen() {
  // Today is always derived from the device clock; it is refreshed on focus,
  // on return from background, and on a rollover check, never frozen at mount.
  const [today, setToday] = useState<Date>(() => startOfLocalDay(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [mode, setMode] = useState<AgendaViewMode>('day');
  const { appointments: allAppointments } = useAppointmentSession();
  const operationalAppointments = getOperationalAgendaEntries(allAppointments);
  const previousTodayRef = useRef(today);
  const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
  const selectedDayAppointments = operationalAppointments.filter(({ appointment }) =>
    isSameLocalDay(appointment.startAt, selectedDay),
  );

  const refreshToday = useCallback(() => {
    const current = startOfLocalDay(new Date());
    setToday((previous) => (isSameLocalDay(previous, current) ? previous : current));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshToday();
    }, [refreshToday]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshToday();
      }
    });
    const rolloverTimer = setInterval(refreshToday, 60_000);
    return () => {
      subscription.remove();
      clearInterval(rolloverTimer);
    };
  }, [refreshToday]);

  useEffect(() => {
    const previousToday = previousTodayRef.current;
    if (isSameLocalDay(previousToday, today)) return;
    previousTodayRef.current = today;
    setSelectedDay((selected) => followTodayChange(selected, previousToday, today));
  }, [today]);

  const selectDay = (day: Date) => {
    setSelectedDay(startOfLocalDay(day));
    setMode('day');
  };

  const shiftSelectedWeek = (amount: number) => {
    setSelectedDay(shiftWeek(selectedDay, amount));
  };

  const goToToday = () => {
    const current = startOfLocalDay(new Date());
    setToday(current);
    setSelectedDay(current);
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
          <View style={[styles.dayNavigation, { paddingHorizontal: horizontalGutter }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Semaine précédente"
              hitSlop={6}
              onPress={() => shiftSelectedWeek(-1)}
              style={({ pressed }) => [styles.navControl, pressed && styles.pressedControl]}
            >
              <SymbolView
                name={{ ios: 'chevron.left', android: 'chevron_left' }}
                size={16}
                tintColor={semanticColors.foreground}
              />
            </Pressable>
            <AppText variant="control" style={styles.weekRange}>
              {formatWeekRange(selectedDay)}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Semaine suivante"
              hitSlop={6}
              onPress={() => shiftSelectedWeek(1)}
              style={({ pressed }) => [styles.navControl, pressed && styles.pressedControl]}
            >
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right' }}
                size={16}
                tintColor={semanticColors.foreground}
              />
            </Pressable>
          </View>
          {!isSameLocalDay(selectedDay, today) && (
            <View style={[styles.todayRow, { paddingHorizontal: horizontalGutter }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Aujourd'hui"
                onPress={goToToday}
                style={({ pressed }) => [styles.todayButton, pressed && styles.pressedControl]}
              >
                <AppText variant="metadata" style={styles.todayText}>
                  Aujourd&apos;hui
                </AppText>
              </Pressable>
            </View>
          )}
          <View style={[styles.dayStrip, { paddingHorizontal: horizontalGutter }]}>
            {getWeekDays(selectedDay).map((day, index) => {
              const selected = isSameLocalDay(day, selectedDay);
              const hasAppointments = operationalAppointments.some(({ appointment }) =>
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
          appointments={operationalAppointments}
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
      style={({ pressed }) => [
        styles.dayCell,
        selected && styles.selectedDayCell,
        pressed && styles.pressedDayCell,
      ]}
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
  safeArea: { backgroundColor: semanticColors.screen, flex: 1 },
  header: { gap: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.md },
  dayNavigation: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  navControl: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressedControl: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  weekRange: { color: semanticColors.foreground, flex: 1, textAlign: 'center' },
  todayRow: {
    alignItems: 'flex-end',
    paddingBottom: spacing.xs,
  },
  todayButton: {
    borderRadius: radii.small,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  todayText: { color: semanticColors.accent },
  dayStrip: {
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  dayCell: {
    alignItems: 'center',
    borderRadius: radii.large,
    minHeight: 58,
    paddingHorizontal: 8,
    paddingVertical: 5,
    width: 44,
  },
  selectedDayCell: { backgroundColor: semanticColors.surfaceLavenderStrong },
  pressedDayCell: {
    opacity: interaction.pressedOpacity,
    transform: [{ scale: interaction.pressedScale }],
  },
  dayName: { color: foregroundSoft, fontSize: 10, lineHeight: 14, textTransform: 'capitalize' },
  dayNumber: { fontSize: 15, lineHeight: 20 },
  selectedText: { color: semanticColors.accent },
  loadDot: { backgroundColor: semanticColors.borderSubtle, borderRadius: 2.5, height: 5, marginTop: 3, width: 5 },
  activeLoadDot: { backgroundColor: semanticColors.accent },
});

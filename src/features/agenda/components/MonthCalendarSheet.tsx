// Souris — MonthCalendarSheet
//
// The date picker of Agenda Jour: the month of the selected day as a French
// calendar (Monday first), one quiet dot on the days holding appointments,
// and a direct tap on a day to open it — no « Valider ».
//
//   ╭────────────────────────────────────────╮
//   │ ( ‹ )        Septembre 2026        ( › )│
//   ╰────────────────────────────────────────╯
//     Lun  Mar  Mer  Jeu  Ven  Sam  Dim
//      31    1    2    3    4    5    6
//                     •
//
// The month row IS the shared PeriodNavigator — the same glass arrows,
// surface and press state as the day navigator above the timeline — so the
// calendar belongs to the same date-navigation system. The browsed month is
// presentation state only: the caller owns the ONE selected day, which
// changes only when a day is tapped. Every presentation reopens on the month
// of the selected day.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { navigatorDateMaxFontScale } from '@/shared/ui/DateNavigator';
import { PeriodNavigator } from '@/shared/ui/PeriodNavigator';
import { interaction, semanticColors, spacing } from '@/shared/ui/theme';

import { addLocalMonths, getMonthGridDays, isSameLocalMonth, startOfLocalMonth } from '../calendar/month';
import { getLocalDateKey, isSameLocalDay, startOfLocalDay } from '../calendar/week';

interface MonthCalendarSheetProps {
  readonly visible: boolean;
  /** The Agenda's selected day: the month opened, and the marked day. */
  readonly day: Date;
  readonly today: Date;
  /** Local day keys (`getLocalDateKey`) holding at least one appointment. */
  readonly appointmentDayKeys: ReadonlySet<string>;
  readonly onClose: () => void;
  /** Receives the tapped day at local midnight. */
  readonly onSelect: (day: Date) => void;
  readonly testID?: string;
}

// Spelled out rather than asked from Intl, like the DateNavigator, so the
// wording never varies with the device's ICU data.
const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
/** Indexed by Date#getDay(). */
const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
/** Column headers, Monday first. */
export const MONTH_CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

/** `Septembre 2026`. */
export function formatCalendarMonth(month: Date): string {
  return `${MONTHS[month.getMonth()]} ${month.getFullYear()}`;
}

/** `2026-09-23`: the stable handle of one day cell. */
export function formatCalendarDayId(day: Date): string {
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

/** `Mercredi 23 septembre, aujourd’hui, rendez-vous prévus`. */
export function getCalendarDayAccessibilityLabel(day: Date, isToday: boolean, hasAppointments: boolean): string {
  const parts = [`${WEEKDAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()].toLowerCase()}`];
  if (isToday) parts.push('aujourd’hui');
  if (hasAppointments) parts.push('rendez-vous prévus');
  return parts.join(', ');
}

export function MonthCalendarSheet({
  visible,
  day,
  today,
  appointmentDayKeys,
  onClose,
  onSelect,
  testID = 'month-calendar',
}: MonthCalendarSheetProps) {
  const [month, setMonth] = useState(() => startOfLocalMonth(day));
  // Every presentation opens on the month of the selected day (derived
  // during render, not in an effect), never on a previously browsed one.
  const [presentedVisible, setPresentedVisible] = useState(visible);
  if (visible !== presentedVisible) {
    setPresentedVisible(visible);
    if (visible) setMonth(startOfLocalMonth(day));
  }

  const days = getMonthGridDays(month);
  const weeks = Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7));

  return (
    <BottomSheet backdropLabel="Fermer le calendrier" onClose={onClose} testID={testID} visible={visible}>
      <PeriodNavigator
        nextLabel="Mois suivant"
        onNext={() => setMonth((current) => addLocalMonths(current, 1))}
        onPrevious={() => setMonth((current) => addLocalMonths(current, -1))}
        previousLabel="Mois précédent"
        style={styles.navigation}
        testID={`${testID}-navigation`}
      >
        <AppText
          accessibilityRole="header"
          maxFontSizeMultiplier={navigatorDateMaxFontScale}
          numberOfLines={1}
          style={styles.month}
          testID={`${testID}-month`}
          variant="sectionTitle"
        >
          {formatCalendarMonth(month)}
        </AppText>
      </PeriodNavigator>

      <View style={styles.week} testID={`${testID}-weekdays`}>
        {MONTH_CALENDAR_WEEKDAYS.map((weekday) => (
          <AppText
            key={weekday}
            maxFontSizeMultiplier={navigatorDateMaxFontScale}
            style={styles.weekday}
            variant="metadata"
          >
            {weekday}
          </AppText>
        ))}
      </View>

      <View style={styles.grid}>
        {weeks.map((week) => (
          <View key={getLocalDateKey(week[0]!)} style={styles.week}>
            {week.map((cellDay) => {
              const isSelected = isSameLocalDay(cellDay, day);
              const isToday = isSameLocalDay(cellDay, today);
              const isOutside = !isSameLocalMonth(cellDay, month);
              const hasAppointments = appointmentDayKeys.has(getLocalDateKey(cellDay));
              const cellTestID = `${testID}-day-${formatCalendarDayId(cellDay)}`;
              return (
                <Pressable
                  accessibilityLabel={getCalendarDayAccessibilityLabel(cellDay, isToday, hasAppointments)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={getLocalDateKey(cellDay)}
                  onPress={() => onSelect(startOfLocalDay(cellDay))}
                  style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                  testID={cellTestID}
                >
                  <View
                    style={[styles.mark, isSelected && styles.markSelected, isToday && styles.markToday]}
                    testID={`${cellTestID}-mark`}
                  >
                    <AppText
                      maxFontSizeMultiplier={navigatorDateMaxFontScale}
                      style={[
                        styles.number,
                        isOutside && styles.numberOutside,
                        (isSelected || isToday) && styles.numberAccent,
                      ]}
                      variant={isSelected ? 'rowTitle' : 'body'}
                    >
                      {cellDay.getDate()}
                    </AppText>
                  </View>
                  {/* The dot's place is always kept: rows never shift. */}
                  <View style={styles.dotSlot}>
                    {hasAppointments && (
                      <View style={[styles.dot, isOutside && styles.dotOutside]} testID={`${cellTestID}-dot`} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const MARK_SIZE = 36;
const DOT_SIZE = 5;

const styles = StyleSheet.create({
  navigation: { marginTop: spacing.sm },
  month: { alignSelf: 'stretch', color: semanticColors.foreground, textAlign: 'center' },
  grid: { paddingBottom: spacing.base },
  week: { flexDirection: 'row' },
  weekday: {
    color: semanticColors.foregroundMuted,
    flex: 1,
    paddingBottom: spacing.xs,
    paddingTop: spacing.base,
    textAlign: 'center',
  },
  // A ≥ 44 pt tap target per day, the mark and the dot inside it.
  cell: { alignItems: 'center', flex: 1, minHeight: 48, paddingTop: spacing.xs },
  pressed: { opacity: interaction.pressedOpacity },
  mark: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: MARK_SIZE / 2,
    borderWidth: 1.5,
    height: MARK_SIZE,
    justifyContent: 'center',
    width: MARK_SIZE,
  },
  // Selected: the soft lavender fill of Souris selections.
  markSelected: { backgroundColor: semanticColors.surfaceLavenderStrong },
  // Today: a violet ring; on the selected day it simply rings the same fill.
  markToday: { borderColor: semanticColors.accent },
  number: { color: semanticColors.foreground, textAlign: 'center' },
  numberOutside: { color: semanticColors.foregroundMuted },
  numberAccent: { color: semanticColors.accent },
  dotSlot: { alignItems: 'center', height: DOT_SIZE + 3, justifyContent: 'flex-end' },
  dot: { backgroundColor: semanticColors.accent, borderRadius: DOT_SIZE / 2, height: DOT_SIZE, width: DOT_SIZE },
  dotOutside: { opacity: 0.5 },
});

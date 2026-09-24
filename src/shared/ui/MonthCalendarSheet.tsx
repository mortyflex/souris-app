// Souris — MonthCalendarSheet
//
// The ONE month date picker of Souris (Agenda Jour, Caisse Jour): the month
// of the selected day as a French calendar (Monday first), and a direct tap
// on a day to open it — no « Valider ».
//
//   ╭────────────────────────────────────────╮
//   │ ( ‹ )        Septembre 2026        ( › )│
//   ╰────────────────────────────────────────╯
//     Lun  Mar  Mer  Jeu  Ven  Sam  Dim
//      31    1    2    3    4    5    6
//                     •
//
// The month row IS the shared PeriodNavigator — the same glass arrows,
// surface and press state as the day navigator above — so the calendar
// belongs to the same date-navigation system. The browsed month is
// presentation state only: the caller owns the ONE selected day, which
// changes only when a day is tapped. Every presentation reopens on the month
// of the selected day.
//
// Domain-agnostic: a caller decorates the days of the displayed month with
// presentation data only (`decorateMonth`) — a quiet dot (Agenda:
// appointments), a soft intensity halo (Caisse: money received) and the
// words that say it aloud. The calendar never knows what they mean.
//
// Three states nest without competing, strongest first:
//   selected  — the soft lavender fill and a violet number (always obvious)
//   today     — a violet ring around the number
//   intensity — a larger soft violet halo behind both, three strengths
//
// A caller may add its own content without the calendar knowing it: a
// `footer` row under the grid, and a `gridOverlay` floating over the lower
// part of the days (anchored to their bottom, growing upward) — the month
// navigation always stays uncovered. `MonthCalendarIntensitySwatch` draws the
// very halo of a level, for a caller's legend.

import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { navigatorDateMaxFontScale } from './DateNavigator';
import { PeriodNavigator } from './PeriodNavigator';
import {
  addLocalMonths,
  getMonthGridDays,
  isSameLocalDate,
  isSameLocalMonth,
  startOfLocalMonth,
} from './month-grid';
import { calendarIntensity, interaction, semanticColors, spacing } from './theme';

export type MonthCalendarIntensity = keyof typeof calendarIntensity;

/** How one shown day is presented, beyond its date, today and selection. */
export interface MonthCalendarDayDecoration {
  /** ONE quiet dot under the number. */
  readonly dot?: boolean;
  /** A soft halo behind the number: low, medium or high. */
  readonly intensity?: MonthCalendarIntensity;
  /** Spoken after the date, so nothing relies on the colour alone. */
  readonly accessibilityDetail?: string;
}

/** Decorates the shown days of ONE displayed month. */
export type MonthCalendarDecorator = (day: Date) => MonthCalendarDayDecoration | undefined;

interface MonthCalendarSheetProps {
  readonly visible: boolean;
  /** The caller's selected day: the month opened, and the marked day. */
  readonly day: Date;
  readonly today: Date;
  /**
   * Called once per displayed month; the returned decorator is asked for
   * every shown day of it, adjacent-month days included. Absent = plain days.
   */
  readonly decorateMonth?: (month: Date) => MonthCalendarDecorator;
  readonly onClose: () => void;
  /** Receives the tapped day at local midnight. */
  readonly onSelect: (day: Date) => void;
  /** A row under the grid (Caisse: its discreet info control). */
  readonly footer?: ReactNode;
  /** Floats over the lower part of the days, never over the month navigation. */
  readonly gridOverlay?: ReactNode;
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
export function getCalendarDayAccessibilityLabel(day: Date, isToday: boolean, detail?: string): string {
  const parts = [`${WEEKDAYS[day.getDay()]} ${day.getDate()} ${MONTHS[day.getMonth()].toLowerCase()}`];
  if (isToday) parts.push('aujourd’hui');
  if (detail) parts.push(detail);
  return parts.join(', ');
}

const undecorated: MonthCalendarDecorator = () => undefined;

/** The halo of one intensity level, as a standalone sample for a legend. */
export function MonthCalendarIntensitySwatch({
  intensity,
  testID,
}: {
  readonly intensity: MonthCalendarIntensity;
  readonly testID?: string;
}) {
  return <View style={[styles.swatch, intensityStyles[intensity]]} testID={testID} />;
}

export function MonthCalendarSheet({
  visible,
  day,
  today,
  decorateMonth,
  onClose,
  onSelect,
  footer,
  gridOverlay,
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

  const decorate = useMemo(() => decorateMonth?.(month) ?? undecorated, [decorateMonth, month]);
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

      {/* The days, and what may float over their lower part. */}
      <View>
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
            <View key={formatCalendarDayId(week[0]!)} style={styles.week}>
              {week.map((cellDay) => {
                const isSelected = isSameLocalDate(cellDay, day);
                const isToday = isSameLocalDate(cellDay, today);
                const isOutside = !isSameLocalMonth(cellDay, month);
                const decoration = decorate(cellDay);
                const intensity = decoration?.intensity;
                const cellID = formatCalendarDayId(cellDay);
                const cellTestID = `${testID}-day-${cellID}`;
                return (
                  <Pressable
                    accessibilityLabel={getCalendarDayAccessibilityLabel(
                      cellDay,
                      isToday,
                      decoration?.accessibilityDetail,
                    )}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    key={cellID}
                    onPress={() => onSelect(new Date(cellDay.getFullYear(), cellDay.getMonth(), cellDay.getDate()))}
                    style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                    testID={cellTestID}
                  >
                    <View style={styles.markFrame}>
                      {/* Behind the mark: the selected fill always reads inside it. */}
                      {intensity && (
                        <View
                          style={[styles.halo, intensityStyles[intensity]]}
                          testID={`${cellTestID}-intensity-${intensity}`}
                        />
                      )}
                      <View
                        style={[styles.mark, isSelected && styles.markSelected, isToday && styles.markToday]}
                        testID={`${cellTestID}-mark`}
                      >
                        <AppText
                          maxFontSizeMultiplier={navigatorDateMaxFontScale}
                          style={[
                            styles.number,
                            isOutside && styles.numberOutside,
                            // A violet number on a violet halo would lose its
                            // contrast: an unselected today keeps its ring alone.
                            (isSelected || (isToday && !intensity)) && styles.numberAccent,
                          ]}
                          variant={isSelected ? 'rowTitle' : 'body'}
                        >
                          {cellDay.getDate()}
                        </AppText>
                      </View>
                    </View>
                    {/* The dot's place is always kept: rows never shift. */}
                    <View style={styles.dotSlot}>
                      {decoration?.dot && (
                        <View style={[styles.dot, isOutside && styles.dotOutside]} testID={`${cellTestID}-dot`} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        {gridOverlay && (
          <View pointerEvents="box-none" style={styles.gridOverlay} testID={`${testID}-overlay`}>
            {gridOverlay}
          </View>
        )}
      </View>
      {footer}
    </BottomSheet>
  );
}

const MARK_SIZE = 36;
/** The halo overflows the mark by this much on every side (44 pt across). */
const HALO_OUTSET = 4;
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
  markFrame: { height: MARK_SIZE, width: MARK_SIZE },
  gridOverlay: { bottom: spacing.base, left: 0, position: 'absolute', right: 0 },
  swatch: { borderRadius: 8, height: 16, width: 16 },
  halo: {
    borderRadius: (MARK_SIZE + HALO_OUTSET * 2) / 2,
    bottom: -HALO_OUTSET,
    left: -HALO_OUTSET,
    position: 'absolute',
    right: -HALO_OUTSET,
    top: -HALO_OUTSET,
  },
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

/** ONE style per level: the calendar halo and the legend swatch share it. */
const intensityStyles = StyleSheet.create({
  low: { backgroundColor: calendarIntensity.low },
  medium: { backgroundColor: calendarIntensity.medium },
  high: { backgroundColor: calendarIntensity.high },
} satisfies Record<MonthCalendarIntensity, { backgroundColor: string }>);

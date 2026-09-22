// Souris — DateNavigator
//
// The ONE single-day navigation of Souris (Agenda Jour, Caisse Jour):
//
//   ╭────────────────────────────────────────────────╮
//   │ ( ‹ )   Mercredi 16 sept.   ( calendar ) ( › ) │
//   │           Aujourd’hui                          │
//   ╰────────────────────────────────────────────────╯
//
// Built on the grouped PeriodNavigator surface, like Agenda Semaine and
// Caisse Mois, so every period control reads as one module.
// One selected date on ONE line, large enough to be read at a glance, between
// the shared glass controls (GlassIconButton): previous day, choose a date,
// next day. No year, an abbreviated month; when the space between the controls
// is genuinely too narrow the weekday shortens (« Mer. 16 sept. ») — the text
// never wraps and is NEVER scaled down: full and compact share the very same
// `sectionTitle` size. Width problems are solved by the wording, not the font.
// Presentation only — the caller owns the selected day and what each control
// does. « Aujourd’hui » is a quiet violet indication shown only on today;
// elsewhere the same line offers the way back when the caller provides one.

import { useState } from 'react';
import { StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { GlassIconButton, glassIcons } from './GlassIconButton';
import { PeriodNavigator, PeriodNavigatorLink, PeriodNavigatorNote } from './PeriodNavigator';
import { semanticColors, typography } from './theme';

interface DateNavigatorProps {
  readonly date: Date;
  readonly isToday: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onOpenCalendar: () => void;
  /** Way back to today, offered only while another day is selected. */
  readonly onGoToToday?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  /** Prefix of the control test IDs: `-previous`, `-date`, `-calendar`, `-next`, `-today`, `-go-to-today`. */
  readonly testID?: string;
}

// Indexed by Date#getDay() / Date#getMonth(). Spelled out rather than asked
// from Intl so the abbreviations never vary with the device's ICU data.
const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const COMPACT_WEEKDAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export type NavigatorDateFormat = 'full' | 'compact';

/** `Mercredi 16 sept.` — or `Mer. 16 sept.` in the compact format. */
export function formatNavigatorDate(date: Date, format: NavigatorDateFormat = 'full'): string {
  const weekday = (format === 'compact' ? COMPACT_WEEKDAYS : WEEKDAYS)[date.getDay()];
  return `${weekday} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

// Average glyph advance of the bold date, as a share of its font size
// (« Mercredi 16 sept. » measures ≈ 0.47). A deliberate over-estimate: the
// date shortens slightly early rather than clip.
const DATE_GLYPH_RATIO = 0.52;

/**
 * The date follows the reader's text size up to this multiplier and stops
 * there: beyond it even « Mer. 16 sept. » would no longer fit between the
 * controls of a 375 pt phone. Growth is capped — the date is never shrunk.
 */
export const navigatorDateMaxFontScale = 1.4;

/**
 * Whether the full date fits the width left between the controls. Pure and
 * deterministic: same width, same text scale, same answer.
 */
export function navigatorDateFits(text: string, availableWidth: number, fontScale: number): boolean {
  const appliedScale = Math.min(fontScale, navigatorDateMaxFontScale);
  return text.length * typography.sectionTitle.fontSize * DATE_GLYPH_RATIO * appliedScale <= availableWidth;
}

export function DateNavigator({
  date,
  isToday,
  onPrevious,
  onNext,
  onOpenCalendar,
  onGoToToday,
  style,
  testID = 'date-navigator',
}: DateNavigatorProps) {
  const { fontScale } = useWindowDimensions();
  // Width actually left between the controls, measured on this screen.
  const [copyWidth, setCopyWidth] = useState<number>();
  const fullDate = formatNavigatorDate(date);
  const fits = copyWidth === undefined || navigatorDateFits(fullDate, copyWidth, fontScale);
  const shownDate = fits ? fullDate : formatNavigatorDate(date, 'compact');

  return (
    <PeriodNavigator
      nextLabel="Jour suivant"
      onCopyLayout={(event) => setCopyWidth(event.nativeEvent.layout.width)}
      onNext={onNext}
      onPrevious={onPrevious}
      previousLabel="Jour précédent"
      style={style}
      testID={testID}
      trailing={
        <GlassIconButton
          accessibilityLabel="Choisir une date"
          icon={glassIcons.calendar}
          onPress={onOpenCalendar}
          testID={`${testID}-calendar`}
        />
      }
    >
      {/* Read aloud in full whatever the visible format. */}
      <AppText
        accessibilityLabel={fullDate}
        // No `adjustsFontSizeToFit`: it shrank a date that fitted (see
        // DESIGN_OVERRIDES.md §21). The size is fixed; only growth is capped.
        maxFontSizeMultiplier={navigatorDateMaxFontScale}
        numberOfLines={1}
        style={styles.date}
        testID={`${testID}-date`}
        variant="sectionTitle"
      >
        {shownDate}
      </AppText>
      {isToday ? (
        <PeriodNavigatorNote testID={`${testID}-today`}>Aujourd’hui</PeriodNavigatorNote>
      ) : (
        onGoToToday && (
          <PeriodNavigatorLink
            label="Revenir à aujourd’hui"
            onPress={onGoToToday}
            testID={`${testID}-go-to-today`}
          />
        )
      )}
    </PeriodNavigator>
  );
}

const styles = StyleSheet.create({
  // Stretched to the measured width between the controls: the text is centred
  // inside a definite box instead of being sized by its own content.
  date: { alignSelf: 'stretch', color: semanticColors.foreground, textAlign: 'center' },
});

// Souris — DateNavigator
//
// The ONE single-day navigation of Souris (Agenda Jour, Caisse Jour):
//
//     ( ‹ )     Mercredi 16 sept.     ( calendar ) ( › )
//                  Aujourd’hui
//
// One selected date on ONE line, large enough to be read at a glance, between
// the shared glass controls (GlassIconButton): previous day, choose a date,
// next day. No year, an abbreviated month; when the space between the controls
// is genuinely too narrow the weekday shortens (« Mer. 16 sept. ») — the text
// never wraps and never shrinks into metadata.
// Presentation only — the caller owns the selected day and what each control
// does. « Aujourd’hui » is a quiet violet indication shown only on today;
// elsewhere the same line offers the way back when the caller provides one.

import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from './AppText';
import { GlassIconButton, glassIcons } from './GlassIconButton';
import { interaction, semanticColors, spacing, typography } from './theme';

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
 * Whether the full date fits the width left between the controls. Pure and
 * deterministic: same width, same text scale, same answer.
 */
export function navigatorDateFits(text: string, availableWidth: number, fontScale: number): boolean {
  return text.length * typography.sectionTitle.fontSize * DATE_GLYPH_RATIO * fontScale <= availableWidth;
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
    <View style={[styles.navigator, style]} testID={testID}>
      <GlassIconButton
        accessibilityLabel="Jour précédent"
        icon={glassIcons.previous}
        onPress={onPrevious}
        testID={`${testID}-previous`}
      />
      <View onLayout={(event) => setCopyWidth(event.nativeEvent.layout.width)} style={styles.copy}>
        {/* Read aloud in full whatever the visible format. */}
        <AppText
          accessibilityLabel={fullDate}
          // Last resort under very large accessibility text: a slight fit, never an ellipsis.
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          numberOfLines={1}
          style={styles.date}
          testID={`${testID}-date`}
          variant="sectionTitle"
        >
          {shownDate}
        </AppText>
        {isToday ? (
          <AppText variant="metadata" style={styles.secondary} testID={`${testID}-today`}>
            Aujourd’hui
          </AppText>
        ) : (
          onGoToToday && (
            <Pressable
              accessibilityLabel="Revenir à aujourd’hui"
              accessibilityRole="button"
              hitSlop={spacing.sm}
              onPress={onGoToToday}
              style={({ pressed }) => pressed && styles.pressed}
              testID={`${testID}-go-to-today`}
            >
              <AppText variant="metadata" style={styles.secondary}>
                Revenir à aujourd’hui
              </AppText>
            </Pressable>
          )
        )}
      </View>
      <GlassIconButton
        accessibilityLabel="Choisir une date"
        icon={glassIcons.calendar}
        onPress={onOpenCalendar}
        testID={`${testID}-calendar`}
      />
      <GlassIconButton
        accessibilityLabel="Jour suivant"
        icon={glassIcons.next}
        onPress={onNext}
        testID={`${testID}-next`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  navigator: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  copy: { alignItems: 'center', flex: 1, minWidth: 0 },
  date: { color: semanticColors.foreground, textAlign: 'center' },
  secondary: { color: semanticColors.accent, textAlign: 'center' },
  pressed: { opacity: interaction.pressedOpacity },
});

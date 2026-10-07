// BeautIzzy — schedule conflict notice
//
// The ONE inline message shown when a save would run into personal
// unavailability (or when a Calendar Block would cover a client Appointment):
// calm but obvious — the unavailability surface, its glyph, a strong sentence
// and a quieter line naming what is in the way. Never a dialog, never red:
// nothing went wrong, the slot is simply taken. The save action stays disabled
// by the caller until the conflict is resolved.
//
// Accessibility: ONE element, announced politely when it appears; the glyph is
// decorative and the message never relies on colour.

import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { calendarBlockIcon } from '@/shared/icons/calendar-block-icon';
import { AppText } from '@/shared/ui/AppText';
import { calendarBlockColors, radii, spacing } from '@/shared/ui/theme';

import type { ScheduleConflictMessage } from '../presentation';

interface ScheduleConflictNoticeProps {
  readonly conflict: ScheduleConflictMessage;
  readonly testID?: string;
}

export function ScheduleConflictNotice({ conflict, testID }: ScheduleConflictNoticeProps) {
  return (
    <View
      accessible
      accessibilityLabel={`${conflict.message} ${conflict.detail}`}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={styles.notice}
      testID={testID}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.badge}
      >
        <SymbolView name={calendarBlockIcon} size={16} tintColor={calendarBlockColors.accent} />
      </View>
      <View style={styles.copy}>
        <AppText variant="control" style={styles.message}>
          {conflict.message}
        </AppText>
        <AppText variant="metadata" style={styles.detail}>
          {conflict.detail}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    alignItems: 'flex-start',
    backgroundColor: calendarBlockColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: calendarBlockColors.background,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  message: { color: calendarBlockColors.title },
  detail: { color: calendarBlockColors.subtitle },
});

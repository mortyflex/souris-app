// BeautIzzy — missing client email warning (appointment creation / editing)
//
// Shown ONLY while everything else would send a reminder (global preference
// on, appointment toggle on) but the selected Client has no usable email.
// A lightweight inline notice in the family of ScheduleConflictNotice /
// BirthdayNotice — informative lavender, never red, never a modal, and it
// never blocks the Appointment: the action simply opens the existing Client
// editing flow.

import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, lavender, radii, semanticColors, spacing } from '@/shared/ui/theme';

import {
  MISSING_EMAIL_ACTION,
  MISSING_EMAIL_MESSAGE,
  MISSING_EMAIL_TITLE,
} from '../presentation';

interface MissingEmailNoticeProps {
  readonly onAddEmail: () => void;
  readonly testID?: string;
}

export function MissingEmailNotice({ onAddEmail, testID }: MissingEmailNoticeProps) {
  return (
    <View style={styles.card} testID={testID}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${MISSING_EMAIL_TITLE}. ${MISSING_EMAIL_MESSAGE}`}
        style={styles.reminder}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.badge}
        >
          <SymbolView
            name={{ ios: 'envelope.badge', android: 'mark_email_unread' }}
            size={14}
            tintColor={lavender.lav700}
          />
        </View>
        <View style={styles.copy}>
          <AppText variant="control" style={styles.title}>
            {MISSING_EMAIL_TITLE}
          </AppText>
          <AppText variant="metadata" style={styles.message}>
            {MISSING_EMAIL_MESSAGE}
          </AppText>
        </View>
      </View>
      <AppButton
        accessibilityLabel={MISSING_EMAIL_ACTION}
        onPress={onAddEmail}
        style={styles.action}
        testID={testID ? `${testID}-add-email` : undefined}
        title={MISSING_EMAIL_ACTION}
        variant="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  reminder: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  badge: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  title: { color: lavender.lav700 },
  message: { color: foregroundSoft },
  action: { backgroundColor: semanticColors.surfaceElevated },
});

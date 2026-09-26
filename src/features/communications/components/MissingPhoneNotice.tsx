// Souris — missing / invalid client phone warning (appointment creation /
// editing, Lot C1)
//
// The SMS sibling of MissingEmailNotice. Shown ONLY while SMS reminders are
// globally enabled, the appointment toggle is on, and the selected Client
// has no usable SMS destination — which in Lot C1 means it stays invisible
// for every real user (SMS cannot be enabled from the app). Two variants:
// no number at all, or a number that cannot become an SMS destination (for
// example a landline). Informative lavender, never red, never a modal, and
// it never blocks the Appointment: the action opens the existing Client
// editing flow.

import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, lavender, radii, semanticColors, spacing } from '@/shared/ui/theme';

import {
  INVALID_PHONE_ACTION,
  INVALID_PHONE_MESSAGE,
  INVALID_PHONE_TITLE,
  MISSING_PHONE_ACTION,
  MISSING_PHONE_MESSAGE,
  MISSING_PHONE_TITLE,
} from '../presentation';

interface MissingPhoneNoticeProps {
  /** 'missing': no number at all; 'invalid': a number SMS cannot reach. */
  readonly variant: 'missing' | 'invalid';
  readonly onEditPhone: () => void;
  readonly testID?: string;
}

export function MissingPhoneNotice({ variant, onEditPhone, testID }: MissingPhoneNoticeProps) {
  const title = variant === 'missing' ? MISSING_PHONE_TITLE : INVALID_PHONE_TITLE;
  const message = variant === 'missing' ? MISSING_PHONE_MESSAGE : INVALID_PHONE_MESSAGE;
  const action = variant === 'missing' ? MISSING_PHONE_ACTION : INVALID_PHONE_ACTION;
  return (
    <View style={styles.card} testID={testID}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${title}. ${message}`}
        style={styles.reminder}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.badge}
        >
          <SymbolView
            name={{ ios: 'phone.badge.plus', android: 'add_call' }}
            size={14}
            tintColor={lavender.lav700}
          />
        </View>
        <View style={styles.copy}>
          <AppText variant="control" style={styles.title}>
            {title}
          </AppText>
          <AppText variant="metadata" style={styles.message}>
            {message}
          </AppText>
        </View>
      </View>
      <AppButton
        accessibilityLabel={action}
        onPress={onEditPhone}
        style={styles.action}
        testID={testID ? `${testID}-edit-phone` : undefined}
        title={action}
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

// Souris — deposit shortfall / financial conflict notice
//
// `shortfall` (default): the inline message shown when a change would take the
// expected total of an Appointment below the deposits already received
// (Details quick edits, « Modifier le rendez-vous », the checkout discount).
// Calm and financial — the lavender surface, never red: nothing went wrong, the
// change simply cannot be saved as is. The caller keeps its save disabled, or
// wrote nothing.
//
// `conflict`: the state itself is inconsistent (deposits above the expected
// total, after two devices edited offline). That IS a problem to resolve, so it
// takes the restrained rose of the exception statuses — with the same
// structure, and the reason always written out.
//
// Accessibility: ONE element, announced politely; the glyph is decorative and
// the message never relies on colour.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { paymentMethodIcons } from '@/shared/icons/payment-method-icons';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, lavender, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import type { DepositShortfallMessage } from './presentation';

interface DepositShortfallNoticeProps {
  readonly shortfall: DepositShortfallMessage;
  readonly tone?: 'shortfall' | 'conflict';
  readonly testID?: string;
}

export function DepositShortfallNotice({
  shortfall,
  tone = 'shortfall',
  testID,
}: DepositShortfallNoticeProps) {
  const conflict = tone === 'conflict';
  return (
    <View
      accessible
      accessibilityLabel={`${shortfall.message} ${shortfall.detail}`}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.notice, conflict && styles.noticeConflict]}
      testID={testID}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.badge, conflict && styles.badgeConflict]}
      >
        <SymbolView
          name={paymentMethodIcons.CASH}
          size={15}
          tintColor={conflict ? rose.rose600 : semanticColors.accent}
        />
      </View>
      <View style={styles.copy}>
        <AppText variant="control" style={conflict ? styles.messageConflict : styles.message}>
          {shortfall.message}
        </AppText>
        <AppText variant="metadata" style={styles.detail}>
          {shortfall.detail}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    alignItems: 'flex-start',
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  noticeConflict: { backgroundColor: semanticColors.surfaceRose },
  badgeConflict: { backgroundColor: semanticColors.surfaceElevated },
  messageConflict: { color: rose.rose700 },
  badge: {
    alignItems: 'center',
    backgroundColor: lavender.lav100,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  message: { color: lavender.lav700 },
  detail: { color: foregroundSoft },
});

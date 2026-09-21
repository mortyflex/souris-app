// Souris — birthday reminder card
//
// The ONE visual of a birthday reminder, shared by the Client Profile
// (« Joyeux anniversaire ») and the Appointment editors (« Anniversaire de
// la cliente »). A pleasant contextual reminder: soft lavender surface, a
// blush badge with the shared cake glyph, a strong title and readable
// supporting text. Never an alert, an error or a marketing popup, and never
// animated — the information must not depend on the confetti.
//
// Accessibility: the copy is ONE element read through `accessibilityLabel`;
// the glyph is decorative. The optional action stays a separate, proper
// button so VoiceOver / TalkBack can reach it.
//
// `compact` is the lighter presentation of the Appointment creation Cliente
// step: same identity, tighter padding and badge, a sentence-weight title —
// it sits above a list and must not turn the step into a promotion.

import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { birthdayIcon } from '@/shared/icons/birthday-icon';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, lavender, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

interface BirthdayNoticeAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

interface BirthdayNoticeProps {
  readonly title: string;
  /** Supporting lines, one paragraph each. */
  readonly messages: readonly string[];
  /** The whole reminder as one spoken sentence. */
  readonly accessibilityLabel: string;
  readonly action?: BirthdayNoticeAction;
  readonly compact?: boolean;
  readonly testID?: string;
}

export function BirthdayNotice({
  title,
  messages,
  accessibilityLabel,
  action,
  compact = false,
  testID,
}: BirthdayNoticeProps) {
  return (
    <View style={[styles.card, compact && styles.compactCard]} testID={testID}>
      <View accessible accessibilityLabel={accessibilityLabel} style={styles.reminder}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.badge, compact && styles.compactBadge]}
        >
          <SymbolView name={birthdayIcon} size={compact ? 14 : 18} tintColor={rose.rose700} />
        </View>
        <View style={styles.copy}>
          <AppText variant={compact ? 'control' : 'rowTitle'} style={styles.title}>
            {title}
          </AppText>
          {messages.map((message) => (
            <AppText key={message} variant="metadata" style={styles.message}>
              {message}
            </AppText>
          ))}
        </View>
      </View>
      {action && (
        <AppButton
          accessibilityLabel={action.label}
          onPress={action.onPress}
          style={styles.action}
          testID={action.testID}
          title={action.label}
          variant="secondary"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.borderLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.base,
  },
  compactCard: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  reminder: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  badge: {
    alignItems: 'center',
    backgroundColor: rose.rose100,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  compactBadge: { height: 28, width: 28 },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  title: { color: lavender.lav700 },
  message: { color: foregroundSoft },
  action: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderLavender,
    borderWidth: 1,
  },
});

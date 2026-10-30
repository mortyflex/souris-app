// BeautIzzy — the calm lavender notice of an email just sent
//
// The envelope glyph, one lead line and the address, read as ONE
// accessibility element. Shared by the email confirmation and the password
// recovery screens: nothing went wrong, the next step is in the mailbox.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

interface EmailSentNoticeProps {
  /** Reads before the address, e.g. « Nous vous avons envoyé un lien à ». */
  readonly lead: string;
  readonly email: string;
  readonly emailTestID?: string;
}

export function EmailSentNotice({ lead, email, emailTestID }: EmailSentNoticeProps) {
  return (
    <View accessible accessibilityLabel={`${lead} ${email}`} style={styles.notice}>
      <View style={styles.glyph}>
        <SymbolView name={{ ios: 'envelope', android: 'mail' }} size={20} tintColor={semanticColors.accent} />
      </View>
      <View style={styles.copy}>
        <AppText variant="metadata" style={styles.lead}>
          {lead}
        </AppText>
        <AppText variant="rowTitle" testID={emailTestID}>
          {email}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The same calm lavender notice as the setup steps: nothing went wrong.
  notice: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  lead: { color: semanticColors.foregroundSoft },
});

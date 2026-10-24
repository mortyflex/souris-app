// BeautIzzy — no-show warning notice
//
// The compact banner of the Appointment creation FOOTER: while a Client with
// no-shows is chosen it sits right above « Continuer » on the Client step and
// above « Créer le rendez-vous » on the Résumé — always on screen, whatever
// the list or the summary scrolled to. A white card with a thin caution
// outline (amber, orange or red by severity), the crossed-out person glyph on
// a quiet disc of the same hue, a title and ONE supporting line. Informative
// only: never a dialog, never a blocker, no action (the deposit hint is a
// sentence, not a button), no animation. The words carry the meaning; the
// colour only grades it.
//
// Accessibility: ONE element, announced politely when it appears; the glyph
// is decorative. The copy wraps freely for large text sizes.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { noShowIcon } from '@/shared/icons/no-show-icon';
import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { getNoShowWarningColors, type ClientNoShowWarning } from './presentation';

interface NoShowWarningNoticeProps {
  readonly warning: ClientNoShowWarning;
  readonly testID?: string;
}

const OUTLINE_WIDTH = 1.5;

export function NoShowWarningNotice({ warning, testID }: NoShowWarningNoticeProps) {
  const colors = getNoShowWarningColors(warning.severity);

  return (
    <View
      accessible
      accessibilityLabel={warning.accessibilityLabel}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { borderColor: colors.accent }]}
      testID={testID}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.badge, { backgroundColor: colors.badge }]}
      >
        <SymbolView name={noShowIcon} size={14} tintColor={colors.accent} />
      </View>
      <View style={styles.copy}>
        <AppText variant="control" style={styles.title}>
          {warning.title}
        </AppText>
        <AppText variant="metadata" style={styles.summary}>
          {warning.summary}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: OUTLINE_WIDTH,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md - OUTLINE_WIDTH,
    paddingVertical: spacing.sm + (spacing.xs - OUTLINE_WIDTH),
  },
  badge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  title: { color: semanticColors.foreground },
  summary: { color: foregroundSoft },
});

// BeautIzzy — the contextual notice of the paywall
//
// One quiet white card: a title and one or more lines. Two tones, neither
// of them an alert: `reassuring` (an accent glyph: data is kept) and
// `pending` (a small spinner: the verification or the offers are on their
// way). Never red, never a warning icon.

import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';
import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

interface PaywallNoticeProps {
  readonly tone: 'reassuring' | 'pending';
  readonly title: string;
  readonly lines: readonly string[];
  readonly testID?: string;
}

const REASSURING_ICON: PlatformSymbolName = { ios: 'checkmark.shield', android: 'verified_user' };

export function PaywallNotice({ tone, title, lines, testID }: PaywallNoticeProps) {
  return (
    <View accessible accessibilityLabel={[title, ...lines].join(' ')} style={styles.card} testID={testID}>
      <View style={styles.glyph}>
        {tone === 'pending' ? (
          <ActivityIndicator color={semanticColors.accent} size="small" testID={testID && `${testID}-pending`} />
        ) : (
          <SymbolView name={REASSURING_ICON} size={18} tintColor={semanticColors.accent} />
        )}
      </View>
      <View style={styles.copy}>
        <AppText style={styles.title} variant="rowTitle">
          {title}
        </AppText>
        {lines.map((line) => (
          <AppText key={line} style={styles.line} variant="metadata">
            {line}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.base,
  },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  title: { color: semanticColors.foreground },
  line: { color: semanticColors.foregroundSoft },
});

// BeautIzzy — the read-only status of Accueil (BeautIzzy Plus)
//
// A subtle white card under the top area of Accueil, shown ONLY while the
// actual access policy reports read-only with enforcement enabled — it reads
// `useBusinessAccess`, never a parallel subscription state. With enforcement
// disabled (the shipped state) it renders nothing, so no existing user ever
// sees it.
//
// Reassuring, informative, never alarmist: the same white surface and
// accent glyph as every other card of the page, no red, no warning icon, no
// modal, no button. It says four things — reading still works, the reason
// the policy knows, data is kept and modifications need Plus — and that the
// subscription will be managed in the app once integrated.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import {
  READ_ONLY_DATA_PRESERVED,
  READ_ONLY_MANAGEMENT_PENDING,
  READ_ONLY_REQUIRES_PLUS,
  READ_ONLY_STATUS_DETAIL,
  READ_ONLY_STATUS_TITLE,
  describeReadOnlyReason,
} from '../read-only-copy';
import { useBusinessAccess } from '../session/BusinessAccessProvider';

interface ReadOnlyStatusCardProps {
  readonly style?: StyleProp<ViewStyle>;
}

export function ReadOnlyStatusCard({ style }: ReadOnlyStatusCardProps) {
  const { access, enforcement } = useBusinessAccess();
  if (enforcement !== 'enabled' || access.mode !== 'read-only') return null;

  const lines = [
    READ_ONLY_STATUS_DETAIL,
    describeReadOnlyReason(access.reason),
    `${READ_ONLY_DATA_PRESERVED} ${READ_ONLY_REQUIRES_PLUS}`,
    READ_ONLY_MANAGEMENT_PENDING,
  ];

  return (
    <View
      accessible
      accessibilityLabel={[READ_ONLY_STATUS_TITLE, ...lines].join(' ')}
      style={[styles.card, style]}
      testID="read-only-status"
    >
      <View style={styles.glyph}>
        <SymbolView name={{ ios: 'eye', android: 'visibility' }} size={18} tintColor={semanticColors.accent} />
      </View>
      <View style={styles.copy}>
        <AppText style={styles.title} variant="rowTitle">
          {READ_ONLY_STATUS_TITLE}
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
    padding: spacing.md,
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

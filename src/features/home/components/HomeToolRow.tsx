// Souris — Accueil « Pilotage » row
//
// One existing business tool, as a compact navigation row inside the grouped
// Pilotage surface: a quiet accent glyph, a title, one short line saying what
// the tool does, an accent chevron (every navigation chevron of Accueil is). Deliberately NOT a quick action — a quick
// action creates, a tool is consulted. Pressing only reports.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface HomeToolRowProps {
  readonly title: string;
  readonly description: string;
  readonly icon: SymbolViewProps['name'];
  readonly onPress: () => void;
  readonly testID: string;
}

export function HomeToolRow({ title, description, icon, onPress, testID }: HomeToolRowProps) {
  return (
    <Pressable
      accessibilityLabel={`${title}, ${description}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={testID}
    >
      <View style={styles.glyph}>
        <SymbolView name={icon} size={18} tintColor={semanticColors.accent} />
      </View>
      <View style={styles.copy}>
        <AppText variant="rowTitle" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
        <AppText variant="metadata" numberOfLines={1} style={styles.description}>
          {description}
        </AppText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right' }}
        size={14}
        tintColor={semanticColors.accent}
      />
    </Pressable>
  );
}

/** Leading indent of the hairline between two rows: it starts under the titles. */
export const HOME_TOOL_ROW_SEPARATOR_INSET = spacing.base + 36 + spacing.md;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 64,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: semanticColors.foreground },
  description: { color: foregroundSoft },
});

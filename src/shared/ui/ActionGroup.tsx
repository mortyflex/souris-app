// BeautIzzy — ActionGroup
//
// ONE white rounded surface of stacked action rows: accent glyph, navy label,
// hairline separators aligned on the labels; destructive actions in rose.
// The row language of every BeautIzzy action list — the « ••• » drawer of detail
// screens (DetailActionsSheet) and the operational actions of the Client
// Profile. Choosing a row only reports its key; behaviour stays with the
// caller.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { radii, rose, semanticColors, spacing, touchTarget } from './theme';

export interface DetailAction<Key extends string> {
  readonly key: Key;
  readonly label: string;
  readonly icon: SymbolViewProps['name'];
  readonly tone: 'normal' | 'destructive';
  readonly testID: string;
  readonly accessibilityHint?: string;
}

interface ActionGroupProps<Key extends string> {
  readonly actions: readonly DetailAction<Key>[];
  readonly onSelect: (key: Key) => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

const toneColors = {
  normal: { text: semanticColors.foreground, icon: semanticColors.accent },
  destructive: { text: rose.rose600, icon: rose.rose600 },
} as const;

export function ActionGroup<Key extends string>({
  actions,
  onSelect,
  style,
  testID,
}: ActionGroupProps<Key>) {
  return (
    <View style={[styles.group, style]} testID={testID}>
      {actions.map((action, index) => (
        <View key={action.key}>
          {index > 0 && <View style={styles.separator} />}
          <ActionRow action={action} onPress={() => onSelect(action.key)} />
        </View>
      ))}
    </View>
  );
}

function ActionRow<Key extends string>({
  action,
  onPress,
}: {
  readonly action: DetailAction<Key>;
  readonly onPress: () => void;
}) {
  const colors = toneColors[action.tone];

  return (
    <Pressable
      accessibilityHint={action.accessibilityHint}
      accessibilityLabel={action.label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={action.testID}
    >
      <SymbolView name={action.icon} size={ICON_SIZE} tintColor={colors.icon} />
      <AppText variant="control" numberOfLines={1} style={[styles.label, { color: colors.text }]}>
        {action.label}
      </AppText>
    </Pressable>
  );
}

const ICON_SIZE = 20;

const styles = StyleSheet.create({
  group: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: touchTarget[Platform.OS === 'android' ? 'android' : 'ios'] + spacing.sm,
    paddingHorizontal: spacing.base,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  label: { flex: 1 },
  separator: {
    backgroundColor: semanticColors.borderSubtle,
    height: StyleSheet.hairlineWidth,
    marginLeft: spacing.base + ICON_SIZE + spacing.md,
  },
});

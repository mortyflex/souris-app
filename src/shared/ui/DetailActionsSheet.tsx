// Souris — DetailActionsSheet
//
// The « ••• » secondary actions of a DETAIL sheet (Product, Prestation), on
// the canonical Souris drawer (BottomSheet) like Appointment Details: groups
// of action rows, each group its own white surface, destructive actions in
// rose. The groups and their order are the caller's.
//
// Choosing an action only reports it: the screen closes the list and runs it
// once the list is gone (`onDismissed`), so a confirmation dialog or a
// navigation never races the closing drawer. Confirmations and business rules
// stay the screen's.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { BottomSheet } from './BottomSheet';
import { SheetHeader } from './SheetHeader';
import { radii, rose, semanticColors, spacing, touchTarget } from './theme';

export interface DetailAction<Key extends string> {
  readonly key: Key;
  readonly label: string;
  readonly icon: SymbolViewProps['name'];
  readonly tone: 'normal' | 'destructive';
  readonly testID: string;
  readonly accessibilityHint?: string;
}

interface DetailActionsSheetProps<Key extends string> {
  /** The object's name, repeated as the drawer title. */
  readonly title: string;
  readonly groups: readonly (readonly DetailAction<Key>[])[];
  readonly visible: boolean;
  readonly onSelect: (key: Key) => void;
  readonly onClose: () => void;
  readonly onDismissed: () => void;
  readonly testID?: string;
}

const toneColors = {
  normal: { text: semanticColors.foreground, icon: semanticColors.accent },
  destructive: { text: rose.rose600, icon: rose.rose600 },
} as const;

export function DetailActionsSheet<Key extends string>({
  title,
  groups,
  visible,
  onSelect,
  onClose,
  onDismissed,
  testID,
}: DetailActionsSheetProps<Key>) {
  return (
    <BottomSheet
      backdropLabel="Fermer les actions"
      header={<SheetHeader title={title} titleNumberOfLines={1} />}
      onClose={onClose}
      onDismissed={onDismissed}
      testID={testID}
      visible={visible}
    >
      <View style={styles.body}>
        {groups.map((group) => (
          <View key={group.map((action) => action.key).join('|')} style={styles.group}>
            {group.map((action, index) => (
              <View key={action.key}>
                {index > 0 && <View style={styles.separator} />}
                <ActionRow action={action} onPress={() => onSelect(action.key)} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </BottomSheet>
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
      <SymbolView name={action.icon} size={20} tintColor={colors.icon} />
      <AppText variant="control" numberOfLines={1} style={[styles.label, { color: colors.text }]}>
        {action.label}
      </AppText>
    </Pressable>
  );
}

const ICON_SIZE = 20;

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.base, paddingTop: spacing.sm },
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

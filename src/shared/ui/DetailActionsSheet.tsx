// BeautIzzy — DetailActionsSheet
//
// The « ••• » secondary actions of a DETAIL sheet (Product, Prestation), on
// the canonical BeautIzzy drawer (BottomSheet) like Appointment Details: groups
// of action rows, each group its own white surface (the shared ActionGroup),
// destructive actions in rose. The groups and their order are the caller's.
//
// Choosing an action only reports it: the screen closes the list and runs it
// once the list is gone (`onDismissed`), so a confirmation dialog or a
// navigation never races the closing drawer. Confirmations and business rules
// stay the screen's.

import { StyleSheet, View } from 'react-native';

import { ActionGroup, type DetailAction } from './ActionGroup';
import { BottomSheet } from './BottomSheet';
import { SheetHeader } from './SheetHeader';
import { spacing } from './theme';

export type { DetailAction } from './ActionGroup';

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
          <ActionGroup
            actions={group}
            key={group.map((action) => action.key).join('|')}
            onSelect={onSelect}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md, paddingBottom: spacing.base, paddingTop: spacing.sm },
});

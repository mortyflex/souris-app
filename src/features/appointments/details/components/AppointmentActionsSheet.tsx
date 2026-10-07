// BeautIzzy — « ••• » secondary actions of Appointment Details
//
// The lifecycle and maintenance actions leave the main sheet for ONE action
// list on the canonical BeautIzzy drawer (BottomSheet, DESIGN_OVERRIDES.md §16):
//
//   Modifier                     normal
//   Annuler                      status-changing (rose text)
//   Marquer comme absente        status-changing (rose text)
//   ─────────────────────────
//   Supprimer                    destructive, in its own group
//
// Each action is offered only when the screen passes its handler, so the
// existing eligibility rules stay the screen's. Choosing an action only
// reports it: the screen closes the list and runs it once the list is gone
// (`onDismissed`), so a second drawer, a dialog or a navigation never races
// the closing one.
//
// Header: the shared SheetEditingHeader (« Fermer » leading, « Actions du
// rendez-vous » centered). The title already names the object, so the visible
// labels stay short; each keeps a full spoken label.

import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Fragment } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
import { radii, rose, semanticColors, spacing, touchTarget } from '@/shared/ui/theme';

export type AppointmentSecondaryAction = 'modify' | 'no-show' | 'cancel' | 'delete';

interface ActionDefinition {
  readonly action: AppointmentSecondaryAction;
  readonly label: string;
  /** Spoken label: the visible one alone would be ambiguous out of context. */
  readonly accessibilityLabel: string;
  readonly icon: SymbolViewProps['name'];
  readonly tone: 'normal' | 'warning' | 'destructive';
  readonly testID: string;
}

const actionDefinitions: readonly ActionDefinition[] = [
  {
    action: 'modify',
    label: 'Modifier',
    accessibilityLabel: 'Modifier le rendez-vous',
    icon: { ios: 'pencil', android: 'edit' },
    tone: 'normal',
    testID: 'modify-appointment',
  },
  {
    action: 'cancel',
    label: 'Annuler',
    accessibilityLabel: 'Annuler le rendez-vous',
    icon: { ios: 'calendar.badge.minus', android: 'event_busy' },
    tone: 'warning',
    testID: 'open-cancellation',
  },
  {
    action: 'no-show',
    label: 'Marquer comme absente',
    accessibilityLabel: 'Marquer comme absente',
    icon: { ios: 'person.crop.circle.badge.xmark', android: 'person_off' },
    tone: 'warning',
    testID: 'open-no-show',
  },
];

const deleteDefinition: ActionDefinition = {
  action: 'delete',
  label: 'Supprimer',
  accessibilityLabel: 'Supprimer le rendez-vous',
  icon: { ios: 'trash', android: 'delete' },
  tone: 'destructive',
  testID: 'open-permanent-deletion',
};

const toneColors = {
  normal: { text: semanticColors.foreground, icon: semanticColors.accent },
  warning: { text: rose.rose700, icon: rose.rose700 },
  destructive: { text: rose.rose600, icon: rose.rose600 },
} as const;

interface AppointmentActionsSheetProps {
  readonly visible: boolean;
  /** The actions currently allowed; « Supprimer » is always offered. */
  readonly available: ReadonlySet<AppointmentSecondaryAction>;
  readonly onSelect: (action: AppointmentSecondaryAction) => void;
  readonly onClose: () => void;
  readonly onDismissed: () => void;
}

export function AppointmentActionsSheet({
  visible,
  available,
  onSelect,
  onClose,
  onDismissed,
}: AppointmentActionsSheetProps) {
  const lifecycleActions = actionDefinitions.filter(({ action }) => available.has(action));

  return (
    <BottomSheet
      backdropLabel="Fermer les actions"
      header={
        <SheetEditingHeader
          cancelLabel="Fermer"
          cancelTestID="close-appointment-actions"
          onCancel={onClose}
          title="Actions du rendez-vous"
        />
      }
      onClose={onClose}
      onDismissed={onDismissed}
      testID="appointment-actions-sheet"
      visible={visible}
    >
      <View style={styles.body}>
        {lifecycleActions.length > 0 && (
          <View style={styles.group}>
            {lifecycleActions.map((definition, index) => (
              <Fragment key={definition.action}>
                {index > 0 && <View style={styles.separator} />}
                <ActionRow definition={definition} onPress={() => onSelect(definition.action)} />
              </Fragment>
            ))}
          </View>
        )}
        <View style={styles.group}>
          <ActionRow
            accessibilityHint="Supprime le rendez-vous de l’agenda et de l’historique"
            definition={deleteDefinition}
            onPress={() => onSelect('delete')}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

function ActionRow({
  definition,
  onPress,
  accessibilityHint,
}: {
  readonly definition: ActionDefinition;
  readonly onPress: () => void;
  readonly accessibilityHint?: string;
}) {
  const colors = toneColors[definition.tone];

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={definition.accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      testID={definition.testID}
    >
      <SymbolView name={definition.icon} size={20} tintColor={colors.icon} />
      <AppText variant="control" numberOfLines={1} style={[styles.label, { color: colors.text }]}>
        {definition.label}
      </AppText>
    </Pressable>
  );
}

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
    marginLeft: spacing.base + 20 + spacing.md,
  },
});

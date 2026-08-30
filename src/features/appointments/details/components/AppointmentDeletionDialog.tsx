import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import {
  gutter,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

interface AppointmentDeletionDialogProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function AppointmentDeletionDialog({
  visible,
  onClose,
  onConfirm,
}: AppointmentDeletionDialogProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <SafeAreaView style={styles.modalRoot} edges={['top', 'bottom']}>
        <Pressable
          accessibilityLabel="Fermer la confirmation de suppression"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={styles.dialog}
          testID="permanent-deletion-dialog"
        >
          <AppText variant="eyebrow" style={styles.eyebrow}>
            SUPPRESSION
          </AppText>
          <AppText accessibilityRole="header" variant="sheetTitle">
            Supprimer définitivement ce rendez-vous ?
          </AppText>
          <AppText variant="body" style={styles.description}>
            Il sera supprimé de l’agenda et de l’historique de la cliente. Cette action est
            irréversible.
          </AppText>
          <View style={styles.actions}>
            <AppButton
              onPress={onClose}
              testID="cancel-permanent-deletion"
              title="Retour"
              variant="secondary"
            />
            <AppButton
              onPress={onConfirm}
              testID="confirm-permanent-deletion"
              title="Supprimer définitivement"
              variant="danger"
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const styles = StyleSheet.create({
  modalRoot: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: horizontalGutter,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(25, 22, 63, 0.28)',
  },
  dialog: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: rose.rose200,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    maxWidth: 360,
    padding: spacing.lg,
    width: '100%',
  },
  eyebrow: { color: rose.rose600 },
  description: { color: semanticColors.foregroundSoft },
  actions: { gap: spacing.sm, paddingTop: spacing.xs },
});

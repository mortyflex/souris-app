// Souris — permanent Client deletion dialog
//
// Reached only from an ARCHIVED Client profile, after the database-backed
// eligibility check. Two shapes, never both:
//
//   confirm  → irreversible confirmation (Retour / Supprimer)
//   blocked  → concise explanation: history exists, keep the Client
//              archived. No destructive control, no cascade option.

import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { gutter, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

export type ClientDeletionDialogMode = 'confirm' | 'blocked';

interface ClientDeletionDialogProps {
  readonly mode: ClientDeletionDialogMode | undefined;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function ClientDeletionDialog({ mode, onClose, onConfirm }: ClientDeletionDialogProps) {
  const blocked = mode === 'blocked';

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={mode !== undefined}>
      <SafeAreaView style={styles.modalRoot} edges={['top', 'bottom']}>
        <Pressable accessibilityLabel="Fermer" onPress={onClose} style={styles.backdrop} />
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={[styles.dialog, blocked && styles.blockedDialog]}
          testID={blocked ? 'client-deletion-blocked' : 'client-deletion-dialog'}
        >
          <AppText variant="eyebrow" style={blocked ? styles.blockedEyebrow : styles.eyebrow}>
            SUPPRESSION
          </AppText>
          <AppText accessibilityRole="header" variant="sheetTitle">
            {blocked ? 'Suppression impossible' : 'Supprimer définitivement cette cliente ?'}
          </AppText>
          <AppText variant="body" style={styles.description}>
            {blocked
              ? 'Cette cliente possède un historique de rendez-vous ou de ventes. Conservez-la archivée pour préserver cet historique.'
              : 'Cette action est irréversible.'}
          </AppText>
          <View style={styles.actions}>
            {blocked ? (
              <AppButton
                onPress={onClose}
                testID="close-client-deletion-blocked"
                title="Compris"
                variant="secondary"
              />
            ) : (
              <>
                <AppButton
                  onPress={onClose}
                  testID="cancel-client-deletion"
                  title="Retour"
                  variant="secondary"
                />
                <AppButton
                  onPress={onConfirm}
                  testID="confirm-client-deletion"
                  title="Supprimer"
                  variant="danger"
                />
              </>
            )}
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
  blockedDialog: { borderColor: semanticColors.borderSubtle },
  eyebrow: { color: rose.rose600 },
  blockedEyebrow: { color: semanticColors.foregroundSoft },
  description: { color: semanticColors.foregroundSoft },
  actions: { gap: spacing.sm, paddingTop: spacing.xs },
});

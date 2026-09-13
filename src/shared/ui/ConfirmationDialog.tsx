// Souris — ConfirmationDialog
//
// The ONE Souris-owned confirmation surface (reference: the permanent Client
// deletion dialog). A near-full-width centered card on the canonical navy
// scrim: uppercase eyebrow, large navy title, body, then full-width stacked
// actions — a soft lavender secondary (« Retour » / « Annuler ») above the
// confirm. `tone="destructive"` gives the rose eyebrow and the restrained
// rose confirm; `tone="neutral"` (sign-out, deactivation) keeps the accent
// eyebrow and a primary confirm. Without `confirmLabel` the dialog is an
// explanation with a single secondary action.
//
// Wording is feature-owned: nothing here names a Client, a Product or any
// other entity. Never used for operating-system permission prompts.

import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from './AppButton';
import { AppText } from './AppText';
import { dialog, gutter, radii, rose, scrim, semanticColors, spacing } from './theme';

interface ConfirmationDialogProps {
  readonly visible: boolean;
  readonly eyebrow?: string;
  readonly title: string;
  readonly body?: string;
  readonly tone?: 'destructive' | 'neutral';
  /** Secondary action label (« Retour », « Annuler », « Compris »). */
  readonly cancelLabel: string;
  /** Confirm action label; omit for an explanation-only dialog. */
  readonly confirmLabel?: string;
  /** Disables both actions while the confirmed operation runs. */
  readonly busy?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm?: () => void;
  readonly testID?: string;
  readonly cancelTestID?: string;
  readonly confirmTestID?: string;
}

export function ConfirmationDialog({
  visible,
  eyebrow,
  title,
  body,
  tone = 'destructive',
  cancelLabel,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
  testID,
  cancelTestID,
  confirmTestID,
}: ConfirmationDialogProps) {
  const cancel = () => {
    if (!busy) onCancel();
  };

  return (
    <Modal animationType="fade" onRequestClose={cancel} transparent visible={visible}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
        <Pressable accessibilityLabel="Fermer" onPress={cancel} style={styles.scrim} />
        <View
          accessibilityRole="alert"
          accessibilityState={{ busy }}
          accessibilityViewIsModal
          style={[styles.card, tone === 'destructive' && styles.destructiveCard]}
          testID={testID}
        >
          {eyebrow && (
            <AppText
              variant="eyebrow"
              style={tone === 'destructive' ? styles.destructiveEyebrow : styles.eyebrow}
            >
              {eyebrow}
            </AppText>
          )}
          <AppText accessibilityRole="header" variant="sheetTitle">
            {title}
          </AppText>
          {body && (
            <AppText variant="body" style={styles.body}>
              {body}
            </AppText>
          )}
          <View style={styles.actions}>
            <AppButton
              disabled={busy}
              onPress={onCancel}
              testID={cancelTestID}
              title={cancelLabel}
              variant="secondary"
            />
            {confirmLabel && onConfirm && (
              <View style={styles.confirm}>
                <AppButton
                  accessibilityState={{ busy }}
                  disabled={busy}
                  onPress={onConfirm}
                  testID={confirmTestID}
                  title={confirmLabel}
                  variant={tone === 'destructive' ? 'danger' : 'primary'}
                />
                {busy && (
                  <View pointerEvents="none" style={styles.busy}>
                    <ActivityIndicator
                      color={tone === 'destructive' ? rose.rose600 : semanticColors.accent}
                      size="small"
                    />
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: horizontalGutter,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: scrim,
  },
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    maxWidth: dialog.maxWidth,
    padding: spacing.lg,
    width: '100%',
  },
  destructiveCard: { borderColor: rose.rose200 },
  eyebrow: { color: semanticColors.accent },
  destructiveEyebrow: { color: rose.rose600 },
  body: { color: semanticColors.foregroundSoft },
  actions: { gap: spacing.sm, paddingTop: spacing.xs },
  confirm: { justifyContent: 'center' },
  busy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
});

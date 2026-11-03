// BeautIzzy — account sheet (Plus › Compte)
//
// Business identity, the signed-in email, and the sign-out action. This
// sheet is the canonical BeautIzzy drawer reference (docs/design/
// DESIGN_OVERRIDES.md §16): shared shell, header and close transition.
// Signing out is consequential but not destructive, so its confirmation is
// the neutral variant of the shared dialog. It ends THIS device's session
// only (the account's other devices stay signed in) and never touches local
// data. Wording rule: local data stays on the device and is NOT described as
// backed up — sign-out neither uploads nor removes anything.
//
// Unsent changes: the outbox is read once, when the professional asks to
// sign out. When it holds entries, the dialog says so — they stay on this
// device and leave at the next connection of the SAME account here (another
// account meets DEVICE_ACCOUNT_CONFLICT and never receives them). Nothing is
// blocked, sent or discarded by this read.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/session/AuthProvider';
import { formatBusinessActivityType, formatBusinessOwnerName } from '@/features/business/presentation';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import type { SourisDatabase } from '@/persistence/database';
import { hasPendingSyncOutbox } from '@/persistence/sync/outbox';
import { usePersistence } from '@/providers/PersistenceProvider';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { semanticColors, spacing } from '@/shared/ui/theme';

interface AccountSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export const SIGN_OUT_MESSAGE =
  'Vous devrez vous reconnecter pour accéder à BeautIzzy. Les données restent enregistrées sur cet appareil.';

export const SIGN_OUT_WITH_UNSENT_CHANGES_MESSAGE =
  'Certaines modifications n’ont pas encore été envoyées. Elles restent enregistrées sur cet appareil et seront envoyées à votre prochaine connexion avec ce compte.';

/** A failed read says nothing special: the dialog then keeps its ordinary wording. */
function hasUnsentChanges(database: SourisDatabase, businessId: string): boolean {
  try {
    return hasPendingSyncOutbox(database, businessId);
  } catch {
    return false;
  }
}

export function AccountSheet({ visible, onClose }: AccountSheetProps) {
  const business = useCurrentBusiness();
  const { database } = usePersistence();
  const { state, signOut } = useAuth();
  /** `unsentChanges`: what the outbox held when the confirmation was asked for (kept while it closes). */
  const [signOutDialog, setSignOutDialog] = useState({ visible: false, unsentChanges: false });
  const email = state.status === 'authenticated' ? state.user.email : undefined;

  const requestSignOut = () => setSignOutDialog({ visible: true, unsentChanges: hasUnsentChanges(database, business.id) });

  const confirmSignOut = () => {
    setSignOutDialog((current) => ({ ...current, visible: false }));
    void signOut();
  };

  return (
    <BottomSheet
      backdropLabel="Fermer le compte"
      header={
        <SheetHeader action={{ label: 'Fermer', onPress: onClose }} eyebrow="COMPTE" title={business.name} />
      }
      onClose={onClose}
      testID="account-sheet"
      visible={visible}
    >
      <View style={styles.details}>
        <DetailRow label="Activité" value={formatBusinessActivityType(business.activityType)} />
        <DetailRow label="Responsable" value={formatBusinessOwnerName(business)} />
        {email && <DetailRow label="Email" value={email} />}
        {business.phone && <DetailRow label="Téléphone" value={business.phone} />}
      </View>

      <View style={styles.footer}>
        <AppButton
          onPress={requestSignOut}
          testID="sign-out"
          title="Se déconnecter"
          variant="dangerSoft"
        />
      </View>

      <ConfirmationDialog
        body={signOutDialog.unsentChanges ? SIGN_OUT_WITH_UNSENT_CHANGES_MESSAGE : SIGN_OUT_MESSAGE}
        cancelLabel="Annuler"
        cancelTestID="cancel-sign-out"
        confirmLabel="Se déconnecter"
        confirmTestID="confirm-sign-out"
        eyebrow="COMPTE"
        onCancel={() => setSignOutDialog((current) => ({ ...current, visible: false }))}
        onConfirm={confirmSignOut}
        testID="sign-out-dialog"
        title="Se déconnecter ?"
        tone="neutral"
        visible={signOutDialog.visible}
      />
    </BottomSheet>
  );
}

function DetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="metadata" style={styles.detailLabel}>
        {label}
      </AppText>
      <AppText variant="body" numberOfLines={1} style={styles.detailValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  details: { gap: spacing.sm, paddingBottom: spacing.base, paddingTop: spacing.xs },
  detailRow: {
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
    paddingVertical: spacing.sm,
  },
  detailLabel: { color: semanticColors.foregroundSoft },
  detailValue: { color: semanticColors.foreground },
  footer: { paddingBottom: spacing.base, paddingTop: spacing.sm },
});

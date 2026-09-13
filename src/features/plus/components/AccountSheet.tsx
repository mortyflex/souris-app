// Souris — account sheet (Plus › Compte)
//
// Business identity, the signed-in email, and the sign-out action. This
// sheet is the canonical Souris drawer reference (docs/design/
// DESIGN_OVERRIDES.md §16): shared shell, header and close transition.
// Signing out is consequential but not destructive, so its confirmation is
// the neutral variant of the shared dialog. Wording rule: local data stays on
// the device and is NOT described as backed up or synchronized — operational
// cloud sync does not exist yet.

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/session/AuthProvider';
import { formatBusinessActivityType, formatBusinessOwnerName } from '@/features/business/presentation';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
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

export function AccountSheet({ visible, onClose }: AccountSheetProps) {
  const business = useCurrentBusiness();
  const { state, signOut } = useAuth();
  const [signOutRequested, setSignOutRequested] = useState(false);
  const email = state.status === 'authenticated' ? state.user.email : undefined;

  const confirmSignOut = () => {
    setSignOutRequested(false);
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
          onPress={() => setSignOutRequested(true)}
          testID="sign-out"
          title="Se déconnecter"
          variant="dangerSoft"
        />
      </View>

      <ConfirmationDialog
        body="Vous devrez vous reconnecter pour accéder à Souris. Les données restent enregistrées sur cet appareil."
        cancelLabel="Annuler"
        cancelTestID="cancel-sign-out"
        confirmLabel="Se déconnecter"
        confirmTestID="confirm-sign-out"
        eyebrow="COMPTE"
        onCancel={() => setSignOutRequested(false)}
        onConfirm={confirmSignOut}
        testID="sign-out-dialog"
        title="Se déconnecter ?"
        tone="neutral"
        visible={signOutRequested}
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

// Souris — account sheet (Plus › Compte)
//
// Business identity, the signed-in email, and the sign-out action. Wording
// rule: local data stays on the device and is NOT described as backed up or
// synchronized — operational cloud sync does not exist yet.

import { Alert, StyleSheet, View } from 'react-native';

import { useAuth } from '@/features/auth/session/AuthProvider';
import { formatBusinessActivityType, formatBusinessOwnerName } from '@/features/business/presentation';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { semanticColors, spacing } from '@/shared/ui/theme';

interface AccountSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function AccountSheet({ visible, onClose }: AccountSheetProps) {
  const business = useCurrentBusiness();
  const { state, signOut } = useAuth();
  const email = state.status === 'authenticated' ? state.user.email : undefined;

  const requestSignOut = () => {
    Alert.alert(
      'Se déconnecter ?',
      'Vous devrez vous reconnecter pour accéder à Souris. Les données restent enregistrées sur cet appareil.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se déconnecter', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  return (
    <BottomSheet backdropLabel="Fermer le compte" onClose={onClose} testID="account-sheet" visible={visible}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AppText variant="eyebrow" style={styles.eyebrow}>
            COMPTE
          </AppText>
          <AppText variant="sheetTitle" accessibilityRole="header" numberOfLines={2}>
            {business.name}
          </AppText>
        </View>
        <AppButton accessibilityLabel="Fermer" onPress={onClose} style={styles.closeButton} title="Fermer" variant="tertiary" />
      </View>

      <View style={styles.details}>
        <DetailRow label="Activité" value={formatBusinessActivityType(business.activityType)} />
        <DetailRow label="Responsable" value={formatBusinessOwnerName(business)} />
        {email && <DetailRow label="Email" value={email} />}
        {business.phone && <DetailRow label="Téléphone" value={business.phone} />}
      </View>

      <View style={styles.footer}>
        <AppButton onPress={requestSignOut} testID="sign-out" title="Se déconnecter" variant="dangerSoft" />
      </View>
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.base,
  },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: semanticColors.accent },
  closeButton: { paddingHorizontal: spacing.md },
  details: { gap: spacing.sm, paddingBottom: spacing.base, paddingTop: spacing.sm },
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

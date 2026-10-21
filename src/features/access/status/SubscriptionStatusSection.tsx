// BeautIzzy — « Mon abonnement » (Plus)
//
// The one place of the product that shows the professional her BeautIzzy
// Plus status: the section header and the status card, from `useBusinessAccess`
// ONLY — its `verification` (what the store confirmed for this session) and
// the enforcement switch (for the quiet "everything stays available" line).
// It never reads `canMutate` or the access mode: with enforcement disabled
// every account has full access, which proves no subscription.
//
// No action: purchase, restore and management arrive in later phases, and an
// inert « Gérer mon abonnement » would mislead. No navigation, nothing
// persisted, nothing fetched here — the provider already verifies.

import { StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/shared/ui/SectionHeader';
import { spacing } from '@/shared/ui/theme';

import { useBusinessAccess } from '../session/BusinessAccessProvider';
import { SubscriptionStatusCard } from './SubscriptionStatusCard';
import { SUBSCRIPTION_SECTION_TITLE, describeSubscriptionStatus } from './subscription-status-presentation';

interface SubscriptionStatusSectionProps {
  /** Injected for deterministic tests; the application uses the system clock. */
  readonly clock?: () => Date;
}

const defaultClock = () => new Date();

export function SubscriptionStatusSection({ clock = defaultClock }: SubscriptionStatusSectionProps) {
  const { verification, enforcement } = useBusinessAccess();
  const model = describeSubscriptionStatus({ verification, now: clock(), enforcement });

  return (
    <View style={styles.section} testID="subscription-section">
      <SectionHeader title={SUBSCRIPTION_SECTION_TITLE} />
      <SubscriptionStatusCard model={model} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, paddingTop: spacing['2xl'] },
});

// BeautIzzy — the subscription status card (Plus › Mon abonnement)
//
// One white card, the shape of every card of the app: a small « BeautIzzy
// Plus » brand label (the 24 pt `label` capsule) when a verified entitlement
// exists, then what the card is about — the status line in `rowTitle`, the
// plan in accent `metadata`, the dated detail in soft `metadata`.
// Restrained: no banner, no button, no red, no icon beyond the brand label. Read-only —
// purchase, restore and management are later phases, so no action is drawn
// at all rather than an inert one.
//
// Presentation only: it draws the model `describeSubscriptionStatus`
// produced and decides nothing. One accessible element, spoken as the
// model's label.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { PlusBrandBadge } from '../paywall/components/PlusBrandBadge';
import type { SubscriptionStatusModel } from './subscription-status-presentation';

interface SubscriptionStatusCardProps {
  readonly model: SubscriptionStatusModel;
  readonly testID?: string;
}

export function SubscriptionStatusCard({ model, testID = 'subscription-status' }: SubscriptionStatusCardProps) {
  return (
    <View accessible accessibilityLabel={model.accessibilityLabel} style={styles.card} testID={testID}>
      {model.plus && <PlusBrandBadge align="start" testID={`${testID}-badge`} variant="label" />}
      <View style={styles.copy}>
        <AppText style={styles.title} variant="rowTitle" testID={`${testID}-title`}>
          {model.title}
        </AppText>
        {model.plan !== undefined && (
          <AppText style={styles.plan} variant="metadata" testID={`${testID}-plan`}>
            {model.plan}
          </AppText>
        )}
        {model.details.map((line) => (
          <AppText key={line} style={styles.detail} variant="metadata">
            {line}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm + 2,
    padding: spacing.base,
  },
  copy: { gap: 2 },
  title: { color: semanticColors.foreground },
  plan: { color: semanticColors.accent },
  detail: { color: semanticColors.foregroundSoft },
});

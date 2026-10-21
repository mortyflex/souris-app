// BeautIzzy — subscription status preview (__DEV__ ONLY)
//
// A design test bench for the « Mon abonnement » card on a real device: every
// status the store could confirm, drawn by the SAME card the product uses,
// from the deterministic fixtures of `../testing/subscription-status-fixtures`.
// It is NOT product UI:
//
//   * reachable only from the « Développement » section of Plus, which exists
//     only under `__DEV__`; this module is `require`d inside a `__DEV__`
//     branch (PlusScreen), so Metro drops it — and the fixtures only it pulls
//     in — from release bundles; it renders nothing outside `__DEV__`;
//   * it reads no access state and writes none: the fixtures never reach
//     BusinessAccessProvider, no entitlement is granted, nothing is verified;
//   * ONE native modal: a single BottomSheet, nothing presented over it; the
//     eleven cards exceed the sheet's detent, so its body is the shell's
//     `scrollable` one (pan-to-dismiss stays on the grabber/header zone).

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { semanticColors, spacing } from '@/shared/ui/theme';

import { SubscriptionStatusCard } from '../SubscriptionStatusCard';
import { describeSubscriptionStatus } from '../subscription-status-presentation';
import { STATUS_FIXTURE_NOW, subscriptionStatusScenarios } from '../testing/subscription-status-fixtures';

interface SubscriptionStatusPreviewSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

export function SubscriptionStatusPreviewSheet({ visible, onClose }: SubscriptionStatusPreviewSheetProps) {
  if (!__DEV__) return null;

  return (
    <BottomSheet
      backdropLabel="Fermer l’aperçu du statut"
      header={
        <SheetHeader
          action={{ label: 'Fermer', onPress: onClose }}
          eyebrow="DÉVELOPPEMENT"
          title="Statut BeautIzzy Plus"
        />
      }
      onClose={onClose}
      scrollable
      testID="subscription-status-preview-sheet"
      visible={visible}
    >
      <AppText style={styles.hint} variant="metadata">
        Données fictives. Aucun abonnement réel, aucun changement d’accès.
      </AppText>
      <View style={styles.list}>
        {subscriptionStatusScenarios.map((scenario) => (
          <View key={scenario.key} style={styles.entry} testID={`subscription-status-preview-${scenario.key}`}>
            <AppText style={styles.entryTitle} variant="eyebrow">
              {scenario.title}
            </AppText>
            <SubscriptionStatusCard
              model={describeSubscriptionStatus({
                verification: scenario.verification,
                now: STATUS_FIXTURE_NOW,
                enforcement: 'disabled',
              })}
              testID={`subscription-status-preview-${scenario.key}-card`}
            />
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: { color: semanticColors.foregroundSoft, paddingBottom: spacing.md },
  list: { gap: spacing.base, paddingBottom: spacing.lg },
  entry: { gap: spacing.xs },
  entryTitle: { color: semanticColors.foregroundSoft },
});

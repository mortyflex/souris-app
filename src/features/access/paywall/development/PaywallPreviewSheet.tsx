// BeautIzzy — BeautIzzy Plus paywall preview (__DEV__ ONLY)
//
// A design test bench for the paywall presentation on a real device or
// simulator: every screen state, with the deterministic fixtures of
// `../testing/paywall-fixtures` (the intended French prices and the 14-day
// trial, as a store adapter would hand them). It is NOT product UI:
//
//   * reachable only from the « Développement » section of Plus, which exists
//     only under `__DEV__`; this module is `require`d inside a `__DEV__`
//     branch (PlusScreen), so Metro drops it — and the fixtures only it pulls
//     in — from release bundles; it renders nothing outside `__DEV__`;
//   * it enables nothing: it reads no access state, writes no subscription
//     state, and cannot touch the enforcement switch;
//   * its purchase action buys nothing: it says so in an alert. Nothing is
//     ever shown as purchased.
//
// One native modal at a time, never stacked (the PhotoSourceFlow rule): the
// scenario list is a BottomSheet, i.e. a React Native Modal, and the paywall
// is a second, full-screen Modal. iOS refuses to present a modal from a view
// controller that is already presenting one, so:
//
//   tap a scenario → the list slides down → (dismissed) → the paywall
//   close the paywall → the paywall slides down → (dismissed) → the list
//
// Each step waits for the REAL native dismissal (`onDismissed` of the sheet,
// `onDismiss` of the paywall Modal on iOS). Android dismisses its dialog
// synchronously and never refuses a presentation, so the list simply comes
// back as the paywall hides. No timer coordinates the two.

import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { interaction, semanticColors, spacing } from '@/shared/ui/theme';

import { PaywallScreen } from '../PaywallScreen';
import { paywallPreviewScenarios, type PaywallPreviewScenario } from '../testing/paywall-fixtures';

interface PaywallPreviewSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

/**
 * Where the preview stands. The list and the paywall are never presented at
 * the same time: `opening` and `returning` are the transitions in between.
 */
type PreviewStage =
  | { readonly kind: 'list' }
  | { readonly kind: 'opening'; readonly scenario: PaywallPreviewScenario }
  | { readonly kind: 'paywall'; readonly scenario: PaywallPreviewScenario }
  | { readonly kind: 'returning'; readonly scenario: PaywallPreviewScenario };

const LIST: PreviewStage = { kind: 'list' };

export function PaywallPreviewSheet({ visible, onClose }: PaywallPreviewSheetProps) {
  const [stage, setStage] = useState<PreviewStage>(LIST);

  // The caller withdrew the preview altogether: nothing stays in flight.
  if (!visible && stage.kind !== 'list') setStage(LIST);

  if (!__DEV__) return null;

  const handleListDismissed = () => {
    if (stage.kind === 'opening') setStage({ kind: 'paywall', scenario: stage.scenario });
  };
  const closePreview = () => {
    if (stage.kind !== 'paywall') return;
    // iOS reports the real dismissal through the Modal; Android hides at once.
    setStage(Platform.OS === 'ios' ? { kind: 'returning', scenario: stage.scenario } : LIST);
  };
  const handlePaywallDismissed = () => {
    if (stage.kind === 'returning') setStage(LIST);
  };
  const explainNoPurchase = () =>
    Alert.alert('Aperçu de développement', 'Aucun achat n’est effectué dans cet aperçu.');
  const explainNoStore = () =>
    Alert.alert('Aperçu de développement', 'Aucun magasin n’est interrogé dans cet aperçu.');

  return (
    <>
      <BottomSheet
        backdropLabel="Fermer l’aperçu BeautIzzy Plus"
        header={
          <SheetHeader
            action={{ label: 'Fermer', onPress: onClose }}
            eyebrow="DÉVELOPPEMENT"
            title="Aperçu BeautIzzy Plus"
          />
        }
        onClose={onClose}
        onDismissed={handleListDismissed}
        testID="paywall-preview-sheet"
        visible={visible && stage.kind === 'list'}
      >
        <AppText style={styles.hint} variant="metadata">
          Données fictives. Aucun achat, aucun changement d’accès.
        </AppText>
        <View style={styles.list}>
          {paywallPreviewScenarios.map((entry) => (
            <Pressable
              accessibilityRole="button"
              key={entry.key}
              onPress={() => setStage({ kind: 'opening', scenario: entry })}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              testID={`paywall-preview-${entry.key}`}
            >
              <AppText style={styles.rowTitle} variant="rowTitle">
                {entry.title}
              </AppText>
              <NavigationChevron />
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <Modal
        animationType="slide"
        onDismiss={Platform.OS === 'ios' ? handlePaywallDismissed : undefined}
        onRequestClose={closePreview}
        presentationStyle="fullScreen"
        visible={visible && stage.kind === 'paywall'}
      >
        {stage.kind !== 'list' && (
          <PaywallScreen
            context={stage.scenario.context}
            key={stage.scenario.key}
            offering={stage.scenario.offering}
            onClose={closePreview}
            onContinueReadOnly={closePreview}
            onRetryOffering={stage.scenario.offering.status === 'unavailable' ? explainNoStore : undefined}
            onSubscribe={explainNoPurchase}
            testID="paywall-preview-screen"
          />
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hint: { color: semanticColors.foregroundSoft, paddingBottom: spacing.md },
  list: { paddingBottom: spacing.lg },
  row: {
    alignItems: 'center',
    borderBottomColor: semanticColors.borderSubtle,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  rowPressed: { opacity: interaction.pressedOpacity },
  rowTitle: { color: semanticColors.foreground, flex: 1 },
});

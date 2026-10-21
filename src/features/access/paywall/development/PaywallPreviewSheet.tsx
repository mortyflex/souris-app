// BeautIzzy — BeautIzzy Plus paywall preview (__DEV__ ONLY)
//
// A design test bench for the paywall presentation on a real device or
// simulator: every screen state, with the deterministic fixtures of
// `../testing/paywall-fixtures` (the intended French prices and the 14-day
// trial, as a store adapter would hand them) — and, since Phase 6.2, ONE
// live entry, « Offre RevenueCat actuelle », which draws the same screen
// over the REAL offering of the signed-in account (`usePaywallOffering`: the
// current RevenueCat offering, its store prices and this account's trial
// eligibility; the Test Store in a debug build, so its prices may differ
// from Apple's). It is NOT product UI:
//
//   * reachable only from the « Développement » section of Plus, which exists
//     only under `__DEV__`; this module is `require`d inside a `__DEV__`
//     branch (PlusScreen), so Metro drops it — and the fixtures only it pulls
//     in — from release bundles; it renders nothing outside `__DEV__`;
//   * it enables nothing: it reads no access state, writes no subscription
//     state, and cannot touch the enforcement switch;
//   * its purchase action buys nothing: it says so in an alert. Nothing is
//     ever shown as purchased, and no purchase API exists to call.
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
// back as the paywall hides. No timer coordinates the two. The live entry
// follows exactly the same lifecycle: its loader mounts with the paywall and
// unmounts with it, so a late store answer lands nowhere.
//
// The scenario list is longer than the sheet's detent, so the body is the
// shell's `scrollable` one: the sheet keeps its content-fit height up to the
// detent and the list scrolls inside it. Pan-to-dismiss lives on the
// grabber/header zone only, so scrolling never competes with it.

import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { interaction, semanticColors, spacing } from '@/shared/ui/theme';

import { usePaywallOffering } from '../../session/use-paywall-offering';
import { PaywallScreen } from '../PaywallScreen';
import { paywallContextFixtures, paywallPreviewScenarios, type PaywallPreviewScenario } from '../testing/paywall-fixtures';

interface PaywallPreviewSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

/** What the preview draws: a fixture scenario, or the real offering of the signed-in account. */
type PreviewSelection =
  | { readonly source: 'fixture'; readonly scenario: PaywallPreviewScenario }
  | { readonly source: 'revenuecat' };

export const LIVE_OFFERING_PREVIEW_KEY = 'revenuecat-current';
export const LIVE_OFFERING_PREVIEW_TITLE = 'Offre RevenueCat actuelle';
export const LIVE_OFFERING_PREVIEW_DETAIL = 'Offre réelle du compte connecté (Test Store en debug). Aucun achat.';
export const PURCHASES_NOT_ENABLED_MESSAGE = 'Les achats ne sont pas encore activés dans cette version.';

/**
 * Where the preview stands. The list and the paywall are never presented at
 * the same time: `opening` and `returning` are the transitions in between.
 */
type PreviewStage =
  | { readonly kind: 'list' }
  | { readonly kind: 'opening'; readonly selection: PreviewSelection }
  | { readonly kind: 'paywall'; readonly selection: PreviewSelection }
  | { readonly kind: 'returning'; readonly selection: PreviewSelection };

const LIST: PreviewStage = { kind: 'list' };

const explainPreview = (message: string) => Alert.alert('Aperçu de développement', message);

export function PaywallPreviewSheet({ visible, onClose }: PaywallPreviewSheetProps) {
  const [stage, setStage] = useState<PreviewStage>(LIST);

  // The caller withdrew the preview altogether: nothing stays in flight.
  if (!visible && stage.kind !== 'list') setStage(LIST);

  if (!__DEV__) return null;

  const handleListDismissed = () => {
    if (stage.kind === 'opening') setStage({ kind: 'paywall', selection: stage.selection });
  };
  const closePreview = () => {
    if (stage.kind !== 'paywall') return;
    // iOS reports the real dismissal through the Modal; Android hides at once.
    setStage(Platform.OS === 'ios' ? { kind: 'returning', selection: stage.selection } : LIST);
  };
  const handlePaywallDismissed = () => {
    if (stage.kind === 'returning') setStage(LIST);
  };
  const explainNoPurchase = () => explainPreview('Aucun achat n’est effectué dans cet aperçu.');
  const explainNoStore = () => explainPreview('Aucun magasin n’est interrogé dans cet aperçu.');

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
        scrollable
        testID="paywall-preview-sheet"
        visible={visible && stage.kind === 'list'}
      >
        <AppText style={styles.hint} variant="metadata">
          Données fictives. Aucun achat, aucun changement d’accès.
        </AppText>
        <View style={styles.list}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${LIVE_OFFERING_PREVIEW_TITLE}, ${LIVE_OFFERING_PREVIEW_DETAIL}`}
            onPress={() => setStage({ kind: 'opening', selection: { source: 'revenuecat' } })}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            testID={`paywall-preview-${LIVE_OFFERING_PREVIEW_KEY}`}
          >
            <View style={styles.rowCopy}>
              <AppText style={styles.rowTitle} variant="rowTitle">
                {LIVE_OFFERING_PREVIEW_TITLE}
              </AppText>
              <AppText style={styles.rowDetail} variant="metadata">
                {LIVE_OFFERING_PREVIEW_DETAIL}
              </AppText>
            </View>
            <NavigationChevron />
          </Pressable>
          {paywallPreviewScenarios.map((entry) => (
            <Pressable
              accessibilityRole="button"
              key={entry.key}
              onPress={() => setStage({ kind: 'opening', selection: { source: 'fixture', scenario: entry } })}
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
        {stage.kind !== 'list' && stage.selection.source === 'fixture' && (
          <PaywallScreen
            context={stage.selection.scenario.context}
            key={stage.selection.scenario.key}
            offering={stage.selection.scenario.offering}
            onClose={closePreview}
            onContinueReadOnly={closePreview}
            onRetryOffering={stage.selection.scenario.offering.status === 'unavailable' ? explainNoStore : undefined}
            onSubscribe={explainNoPurchase}
            testID="paywall-preview-screen"
          />
        )}
        {stage.kind !== 'list' && stage.selection.source === 'revenuecat' && (
          <LiveOfferingPaywall key={LIVE_OFFERING_PREVIEW_KEY} onClose={closePreview} />
        )}
      </Modal>
    </>
  );
}

/**
 * The paywall over the real offering of the signed-in account. Mounted only
 * while the paywall stage shows it: the loader starts with it and is dropped
 * with it. Its primary action explains that purchases are not enabled yet.
 */
function LiveOfferingPaywall({ onClose }: { readonly onClose: () => void }) {
  const { offering, retry } = usePaywallOffering();
  return (
    <PaywallScreen
      context={paywallContextFixtures.initialOffer}
      offering={offering}
      onClose={onClose}
      onContinueReadOnly={onClose}
      onRetryOffering={retry}
      onSubscribe={() => explainPreview(PURCHASES_NOT_ENABLED_MESSAGE)}
      testID="paywall-preview-screen"
    />
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
  rowCopy: { flex: 1, gap: 2, minWidth: 0 },
  rowTitle: { color: semanticColors.foreground, flex: 1 },
  rowDetail: { color: semanticColors.foregroundSoft },
});

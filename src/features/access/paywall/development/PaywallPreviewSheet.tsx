// BeautIzzy — BeautIzzy Plus paywall preview (__DEV__ ONLY)
//
// A design test bench for the paywall presentation on a real device or
// simulator: every screen state, with the deterministic fixtures of
// `../testing/paywall-fixtures` (the intended French prices and the 14-day
// trial, as a store adapter would hand them) — and ONE live entry, « Offre
// RevenueCat actuelle », which draws the same screen over the REAL offering
// of the signed-in account (`usePaywallOffering`: the current RevenueCat
// offering, its store prices and this account's trial eligibility; the Test
// Store in a debug build, so its prices may differ from Apple's). It is NOT
// product UI:
//
//   * reachable only from the « Développement » section of Plus, which exists
//     only under `__DEV__`; this module is `require`d inside a `__DEV__`
//     branch (PlusScreen), so Metro drops it — and the fixtures only it pulls
//     in — from release bundles; it renders nothing outside `__DEV__`;
//   * it enables nothing: it writes no subscription state and cannot touch
//     the enforcement switch, which stays disabled whatever is bought;
//   * the FIXTURE scenarios buy nothing, ever: their purchase action only
//     says so in an alert. A fixture offering carries no store reference, so
//     no purchase API can even be asked for it.
//
// Since Phase 6.3 the LIVE entry is the ONLY purchase entry point of the
// application: a deliberate RevenueCat TEST STORE purchase of the selected
// plan (« Achat de test — aucun paiement réel »), through `usePlusCheckout`
// — the provider's `purchase`, the same source and identity as the
// verification, never a store SDK from here. Every condition of
// `test-store-purchase.ts` must hold (a development bundle, a source bound to
// the Test Store, an authenticated account, the store's own offering, the
// plan it sells, nothing in flight) and the professional confirms first, in
// an alert that names the plan and the exact store price. The outcome is
// worded by `checkout-presentation.ts`: « Abonnement activé » only for a
// verified entitlement; an inconclusive answer offers « Vérifier à nouveau »
// (a re-verification, never a second purchase). Once the account holds a
// verified entitlement, the live entry draws the ENTITLED context — nothing
// to sell, nothing to buy twice. The restore link runs the user-initiated
// restore in place (the Test Store presents nothing for it); the Test Store
// keeps no real store history, so the alert says what that test can and
// cannot prove.
//
// The SDK's purchase dialog is a native presentation of its own. On iOS the
// Test Store purchase is a UIAlertController the SDK presents on the key
// window's top-most presented view controller at the instant the purchase
// call runs; React Native's `Alert` lives in a window of its own hidden as
// its button callback is dispatched, and the paywall is a presented Modal.
// Started from inside the confirmation alert's callback, over the paywall
// Modal, the SDK dialog ended up drawn but unreachable (Phase 6.3, iPhone 17
// simulator). So the purchase is a stage of this coordinator, which stays
// mounted whatever is presented:
//
//   confirm → `checkout-closing`: the paywall Modal slides down, the plan and
//             the store offering (its reference) captured in the stage;
//          → (iOS: the Modal's real `onDismiss`; Android: at once, the dialog
//             is gone with the prop) `checkout`: NOTHING of ours is presented,
//             the purchase starts from an effect of this component — never
//             from a callback of the unmounted paywall —, the SDK presents
//             its dialog alone;
//          → the outcome is alerted, and « OK » presents the live paywall
//             again (its loader starts afresh, so an activated account meets
//             the entitled context).
//
// No timer coordinates anything: the Modal's dismissal lifecycle does. The
// preview withdrawn during a checkout (Plus closed it) drops the alert; the
// provider has still applied the outcome.
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

import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import type { SubscriptionPlan } from '@/domain/access';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { NavigationChevron } from '@/shared/ui/NavigationChevron';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { interaction, semanticColors, spacing } from '@/shared/ui/theme';

import { usePaywallOffering } from '../../session/use-paywall-offering';
import { usePlusCheckout, type PlusCheckoutResult, type PlusCheckoutSession } from '../../session/use-plus-checkout';
import { PaywallScreen } from '../PaywallScreen';
import { CHECKOUT_VERIFY_AGAIN_TITLE, describeCheckoutResult } from '../checkout-presentation';
import type { PaywallOffering } from '../paywall-offering';
import { buildPaywallPlans } from '../paywall-presentation';
import { paywallContextFixtures, paywallPreviewScenarios, type PaywallPreviewScenario } from '../testing/paywall-fixtures';
import { TEST_PURCHASE_REFUSALS, resolveTestPurchaseRefusal } from './test-store-purchase';

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
export const LIVE_OFFERING_PREVIEW_DETAIL =
  'Offre réelle du compte connecté. Achat de test sur le RevenueCat Test Store — aucun paiement réel.';
export const TEST_PURCHASE_TITLE = 'Achat de test — aucun paiement réel';
export const TEST_PURCHASE_NOTICE_LINES = [
  'RevenueCat Test Store, compte connecté. Aucun paiement réel.',
  'L’essai gratuit Apple n’existe pas dans le Test Store.',
] as const;
export const TEST_PURCHASE_CONFIRM_TITLE = 'Acheter (test)';
export const TEST_PURCHASE_CANCEL_TITLE = 'Annuler';
export const TEST_RESTORE_TITLE = 'Restauration (Test Store)';
export const TEST_RESTORE_MESSAGE =
  'Le Test Store ne restaure pas un historique d’achats réel : ce test vérifie uniquement l’appel SDK et la mise à jour du statut. La restauration réelle sera validée en Sandbox Apple / TestFlight.';
export const TEST_RESTORE_CONFIRM_TITLE = 'Restaurer (test)';
export const TEST_PURCHASE_REFUSED_TITLE = 'Achat de test refusé';

/** A confirmed Test Store purchase: the store offering (its reference) and the plan, captured at confirmation. */
interface CheckoutRequest {
  readonly offering: PaywallOffering;
  readonly plan: SubscriptionPlan;
}

/**
 * Where the preview stands. The list, the paywall and the SDK's purchase
 * dialog are never presented at the same time: `opening`, `returning` and
 * `checkout-closing` are the transitions in between, `checkout` the stage
 * where nothing of ours is presented.
 */
type PreviewStage =
  | { readonly kind: 'list' }
  | { readonly kind: 'opening'; readonly selection: PreviewSelection }
  | { readonly kind: 'paywall'; readonly selection: PreviewSelection }
  | { readonly kind: 'returning'; readonly selection: PreviewSelection }
  /** The paywall Modal is sliding down before the purchase. */
  | { readonly kind: 'checkout-closing'; readonly request: CheckoutRequest }
  /** Nothing presented: the purchase runs and the SDK owns the screen. */
  | { readonly kind: 'checkout'; readonly request: CheckoutRequest };

const LIST: PreviewStage = { kind: 'list' };
const LIVE_PAYWALL: PreviewStage = { kind: 'paywall', selection: { source: 'revenuecat' } };

const explainPreview = (message: string) => Alert.alert('Aperçu de développement', message);

export function PaywallPreviewSheet({ visible, onClose }: PaywallPreviewSheetProps) {
  const [stage, setStage] = useState<PreviewStage>(LIST);
  // The checkout belongs to this always-mounted coordinator, never to the paywall it presents.
  const checkout = usePlusCheckout();

  // The caller withdrew the preview altogether: nothing stays in flight.
  if (!visible && stage.kind !== 'list') setStage(LIST);

  // What the checkout effect reads later, without re-running: the current
  // stage and checkout. Synced after each commit, before any result lands.
  const stageRef = useRef(stage);
  const checkoutRef = useRef(checkout);
  useEffect(() => {
    stageRef.current = stage;
    checkoutRef.current = checkout;
  }, [stage, checkout]);

  // The purchase starts ONCE per `checkout` stage, after that stage was
  // committed — i.e. after the paywall Modal was really dismissed on iOS, and
  // after its prop dropped on Android — from this component, mounted whatever
  // happens on screen.
  const startedRequest = useRef<CheckoutRequest | undefined>(undefined);
  useEffect(() => {
    if (!__DEV__ || stage.kind !== 'checkout' || startedRequest.current === stage.request) return;
    const { request } = stage;
    startedRequest.current = request;
    const stillThisCheckout = () => {
      const current = stageRef.current;
      return current.kind === 'checkout' && current.request === request;
    };
    const returnToPaywall = () => {
      if (stillThisCheckout()) setStage(LIVE_PAYWALL);
    };
    const showResult = (result: PlusCheckoutResult | undefined) => {
      // The preview was withdrawn meanwhile: the provider applied the outcome, nothing to draw.
      if (result === undefined || !stillThisCheckout()) return;
      const model = describeCheckoutResult(result);
      Alert.alert(model.title, model.message, [
        ...(model.offersVerification
          ? [{ text: CHECKOUT_VERIFY_AGAIN_TITLE, onPress: () => void checkoutRef.current.retryVerification().then(showResult) }]
          : []),
        { text: 'OK', style: 'cancel' as const, onPress: returnToPaywall },
      ]);
    };
    void checkoutRef.current.purchase(request.offering, request.plan).then(showResult);
  }, [stage]);

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
    if (stage.kind === 'checkout-closing') setStage({ kind: 'checkout', request: stage.request });
  };
  /** The purchase was confirmed on the live paywall: let the Modal go first, then buy. */
  const startCheckout = (request: CheckoutRequest) => {
    if (stage.kind !== 'paywall' || stage.selection.source !== 'revenuecat') return;
    setStage(Platform.OS === 'ios' ? { kind: 'checkout-closing', request } : { kind: 'checkout', request });
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
        {(stage.kind === 'opening' || stage.kind === 'paywall' || stage.kind === 'returning') && stage.selection.source === 'fixture' && (
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
        {(stage.kind === 'opening' || stage.kind === 'paywall' || stage.kind === 'returning') && stage.selection.source === 'revenuecat' && (
          <LiveOfferingPaywall checkout={checkout} key={LIVE_OFFERING_PREVIEW_KEY} onClose={closePreview} onPurchase={startCheckout} />
        )}
      </Modal>
    </>
  );
}

/** « Formule annuelle · $49.99 par an », from the SAME presentation the cards draw. */
export function describeTestPurchase(offering: PaywallOffering, plan: SubscriptionPlan): string | undefined {
  const plans = buildPaywallPlans(offering);
  if (plans.status !== 'available') return undefined;
  const card = plans.cards.find((candidate) => candidate.plan === plan);
  return card === undefined ? undefined : `${card.title} · ${card.price} ${card.period}`;
}

interface LiveOfferingPaywallProps {
  readonly checkout: PlusCheckoutSession;
  readonly onClose: () => void;
  /** A confirmed purchase: the coordinator dismisses this paywall, then buys. */
  readonly onPurchase: (request: CheckoutRequest) => void;
}

/**
 * The paywall over the real offering of the signed-in account. Mounted only
 * while the paywall stage shows it: the loader starts with it and is dropped
 * with it. Its primary action guards and confirms a Test Store purchase,
 * then hands it to the coordinator; its restore link runs a confirmed
 * restore in place; an entitled account meets the entitled context and no
 * purchase action at all.
 */
function LiveOfferingPaywall({ checkout, onClose, onPurchase }: LiveOfferingPaywallProps) {
  const { offering, retry } = usePaywallOffering();

  const showResult = (result: PlusCheckoutResult | undefined) => {
    if (result === undefined) return;
    const model = describeCheckoutResult(result);
    Alert.alert(
      model.title,
      model.message,
      model.offersVerification
        ? [
            { text: 'OK', style: 'cancel' },
            { text: CHECKOUT_VERIFY_AGAIN_TITLE, onPress: () => void checkout.retryVerification().then(showResult) },
          ]
        : undefined,
    );
  };

  const requestTestPurchase = (plan: SubscriptionPlan) => {
    const refusal = resolveTestPurchaseRefusal({
      development: __DEV__,
      store: checkout.store,
      authenticated: checkout.authenticated,
      offering,
      plan,
      activity: checkout.activity,
    });
    if (refusal !== undefined) {
      Alert.alert(TEST_PURCHASE_REFUSED_TITLE, TEST_PURCHASE_REFUSALS[refusal]);
      return;
    }
    const described = describeTestPurchase(offering, plan);
    if (described === undefined) {
      Alert.alert(TEST_PURCHASE_REFUSED_TITLE, TEST_PURCHASE_REFUSALS['plan-not-offered']);
      return;
    }
    Alert.alert(TEST_PURCHASE_TITLE, `${described}\n${TEST_PURCHASE_NOTICE_LINES.join('\n')}`, [
      { text: TEST_PURCHASE_CANCEL_TITLE, style: 'cancel' },
      { text: TEST_PURCHASE_CONFIRM_TITLE, onPress: () => onPurchase({ offering, plan }) },
    ]);
  };

  const requestTestRestore = () => {
    if (checkout.activity !== undefined) {
      Alert.alert(TEST_PURCHASE_REFUSED_TITLE, TEST_PURCHASE_REFUSALS['operation-in-progress']);
      return;
    }
    Alert.alert(TEST_RESTORE_TITLE, TEST_RESTORE_MESSAGE, [
      { text: TEST_PURCHASE_CANCEL_TITLE, style: 'cancel' },
      { text: TEST_RESTORE_CONFIRM_TITLE, onPress: () => void checkout.restore().then(showResult) },
    ]);
  };

  return (
    <PaywallScreen
      activity={checkout.activity}
      context={checkout.entitled ? paywallContextFixtures.entitled : paywallContextFixtures.initialOffer}
      environmentNotice={{ title: TEST_PURCHASE_TITLE, lines: TEST_PURCHASE_NOTICE_LINES }}
      offering={offering}
      onClose={onClose}
      onContinueReadOnly={onClose}
      onRestorePurchases={requestTestRestore}
      onRetryOffering={retry}
      onSubscribe={requestTestPurchase}
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

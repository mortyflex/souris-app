// BeautIzzy — the BeautIzzy Plus paywall (presentation only)
//
// The commercial screen of BeautIzzy Plus, drawn inside the first-run frame
// (OnboardingStepLayout: safe areas, the quiet top bar, a scrolling body and
// a fixed footer), so it reads as a continuation of Discovery and setup:
//
//   top bar      the glass back and / or close, when the caller provides one;
//   body         a compact hero — the « BeautIzzy Plus » badge, the growth
//                illustration (an accent, about 15 % of the window), the
//                approved headline (navy, screen title) and one short lead —
//                or, for an existing account, the contextual notice; THEN the
//                offer: one card per plan the store offers — annual first,
//                preselected and « Recommandé » when both are offered — so
//                the choice reaches the first viewport of a regular phone;
//                the three approved benefits follow, under the cards;
//   footer       the primary action, its footnote (the price or « Puis … »),
//                the secondary way out (« Explorer sans abonnement », with
//                the read-only limit as its quiet caption / « Revenir à mes
//                données » / « Continuer ») and the restore / terms / privacy
//                links once their integrations provide them.
//
// Presentation ONLY. The screen fetches nothing, initializes no billing SDK,
// purchases nothing, restores nothing, writes no subscription state and
// knows no price: it draws the `PaywallOffering` it is given, through the
// pure presentation rules (`paywall-presentation.ts`), and reports the
// professional's intent through callbacks. A callback that is not provided
// renders no control: no button ever does nothing. Without a purchase entry
// point the primary action is disabled and says so; with an unavailable
// offering there is none at all.
//
// Nothing here is persisted, and no navigation happens of its own: the
// account-scoped paywall routing belongs to a later phase.

import { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import type { SubscriptionPlan } from '@/domain/access';
import type { PlatformSymbolName } from '@/shared/icons/payment-method-icons';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { interaction, semanticColors, spacing } from '@/shared/ui/theme';

import { PaywallBenefitRow } from './components/PaywallBenefitRow';
import { PaywallNotice } from './components/PaywallNotice';
import { PaywallPlanCard } from './components/PaywallPlanCard';
import { PlusBrandBadge } from './components/PlusBrandBadge';
import {
  PAYWALL_BENEFITS,
  PAYWALL_CLOSE_LABEL,
  PAYWALL_LOADING_TITLE,
  PAYWALL_OFFERS_UNAVAILABLE,
  PAYWALL_PRIVACY_TITLE,
  PAYWALL_RESTORE_TITLE,
  PAYWALL_RETRY_OFFERS_TITLE,
  PAYWALL_TERMS_TITLE,
} from './paywall-copy';
import { paywallIllustration } from './paywall-illustration';
import type { PaywallOffering } from './paywall-offering';
import {
  PAYWALL_DEFAULT_LOCALE,
  PAYWALL_SMALL_WINDOW_HEIGHT,
  buildPaywallPlans,
  describePaywallContext,
  resolvePaywallAction,
  resolvePaywallIllustrationSide,
  resolveSelectedPaywallPlan,
  type PaywallContext,
} from './paywall-presentation';

const BENEFIT_ICONS: readonly PlatformSymbolName[] = [
  { ios: 'calendar', android: 'calendar_today' },
  { ios: 'chart.bar', android: 'bar_chart' },
  { ios: 'clock', android: 'schedule' },
];

export interface PaywallScreenProps {
  readonly context: PaywallContext;
  readonly offering: PaywallOffering;
  /** BCP 47 tag for local price formatting when the store gives no string. */
  readonly locale?: string;
  /** Opening selection (tests and previews); the product preselects the annual plan. */
  readonly initialPlan?: SubscriptionPlan;
  /** The purchase entry point of the future store integration. Absent: the action is disabled and says so. */
  readonly onSubscribe?: (plan: SubscriptionPlan) => void;
  /** « Explorer sans abonnement » / « Revenir à mes données »: the caller enters, or returns to, read-only use. */
  readonly onContinueReadOnly?: () => void;
  /** The close control, and « Continuer » of the entitled and verifying states. */
  readonly onClose?: () => void;
  readonly onBack?: () => void;
  readonly onRestorePurchases?: () => void;
  readonly onOpenTerms?: () => void;
  readonly onOpenPrivacy?: () => void;
  /** Asks the adapter for the offering again when the store could not be reached. */
  readonly onRetryOffering?: () => void;
  readonly testID?: string;
}

export function PaywallScreen({
  context,
  offering,
  locale = PAYWALL_DEFAULT_LOCALE,
  initialPlan,
  onSubscribe,
  onContinueReadOnly,
  onClose,
  onBack,
  onRestorePurchases,
  onOpenTerms,
  onOpenPrivacy,
  onRetryOffering,
  testID = 'paywall-screen',
}: PaywallScreenProps) {
  const { height } = useWindowDimensions();
  const [requestedPlan, setRequestedPlan] = useState<SubscriptionPlan | undefined>(initialPlan);

  const presentation = describePaywallContext(context);
  const plans = presentation.showsOffer ? buildPaywallPlans(offering, locale) : undefined;
  const selectedPlan = plans ? resolveSelectedPaywallPlan(plans, requestedPlan) : undefined;
  const action = plans ? resolvePaywallAction(plans, selectedPlan, onSubscribe !== undefined) : { kind: 'none' as const };
  const side = resolvePaywallIllustrationSide(height);
  const small = height <= PAYWALL_SMALL_WINDOW_HEIGHT;

  const selectPlan = (plan: SubscriptionPlan) => {
    if (plan === selectedPlan) return;
    haptics.selection();
    setRequestedPlan(plan);
  };

  const subscribe = () => {
    if (action.kind !== 'subscribe' || onSubscribe === undefined) return;
    haptics.action();
    onSubscribe(action.plan);
  };

  const secondary = presentation.secondaryAction;
  const onSecondary = secondary.kind === 'continue' ? onClose : onContinueReadOnly;
  const links = [
    onRestorePurchases && { key: 'restore', title: PAYWALL_RESTORE_TITLE, onPress: onRestorePurchases },
    onOpenTerms && { key: 'terms', title: PAYWALL_TERMS_TITLE, onPress: onOpenTerms },
    onOpenPrivacy && { key: 'privacy', title: PAYWALL_PRIVACY_TITLE, onPress: onOpenPrivacy },
  ].filter((link): link is { key: string; title: string; onPress: () => void } => Boolean(link));

  return (
    <OnboardingStepLayout
      footer={
        <>
          {action.kind !== 'none' && (
            <View style={styles.primary}>
              <AppButton
                disabled={action.kind !== 'subscribe'}
                onPress={subscribe}
                testID="paywall-subscribe"
                title={action.title}
              />
              {action.kind !== 'loading' && (
                <AppText style={styles.footnote} variant="metadata" testID="paywall-subscribe-footnote">
                  {action.footnote}
                </AppText>
              )}
            </View>
          )}
          {onSecondary !== undefined && (
            <AppButton
              accessibilityLabel={secondary.accessibilityLabel}
              caption={secondary.caption}
              onPress={onSecondary}
              testID={`paywall-${secondary.kind}`}
              title={secondary.title}
              variant={presentation.showsOffer ? 'tertiary' : 'primary'}
            />
          )}
          {links.length > 0 && (
            <View style={styles.links} testID="paywall-links">
              {links.map((link) => (
                <Pressable
                  accessibilityRole="link"
                  hitSlop={spacing.sm}
                  key={link.key}
                  onPress={link.onPress}
                  style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
                  testID={`paywall-link-${link.key}`}
                >
                  <AppText style={styles.linkText} variant="metadata">
                    {link.title}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}
        </>
      }
      bodySpacing="compact"
      onBack={onBack}
      testID={testID}
      topBarEnd={
        onClose === undefined ? undefined : (
          <GlassIconButton
            accessibilityLabel={PAYWALL_CLOSE_LABEL}
            icon={glassIcons.close}
            onPress={onClose}
            testID="paywall-close"
          />
        )
      }
    >
      <View style={[styles.hero, small && styles.heroSmall]} testID="paywall-hero">
        <PlusBrandBadge />
        <Image
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          resizeMode="contain"
          source={paywallIllustration}
          style={{ width: side, height: side }}
          testID="paywall-illustration"
        />
        <AppText accessibilityRole="header" style={styles.title} variant="screenTitle" testID="paywall-title">
          {presentation.title}
        </AppText>
        {presentation.lead !== undefined && (
          <AppText style={styles.lead} variant="body" testID="paywall-lead">
            {presentation.lead}
          </AppText>
        )}
      </View>

      {presentation.notice !== undefined && (
        <PaywallNotice
          lines={presentation.notice.lines}
          testID="paywall-notice"
          title={presentation.notice.title}
          tone={presentation.notice.tone}
        />
      )}

      {plans?.status === 'available' && (
        <View accessibilityRole="radiogroup" style={styles.plans} testID="paywall-plans">
          {plans.cards.map((card) => (
            <PaywallPlanCard
              card={card}
              key={card.plan}
              onSelect={() => selectPlan(card.plan)}
              selected={card.plan === selectedPlan}
            />
          ))}
        </View>
      )}
      {plans?.status === 'loading' && (
        <PaywallNotice lines={[]} testID="paywall-plans-loading" title={PAYWALL_LOADING_TITLE} tone="pending" />
      )}
      {plans?.status === 'unavailable' && (
        <View style={styles.unavailable}>
          <PaywallNotice
            lines={[PAYWALL_OFFERS_UNAVAILABLE[plans.reason].detail]}
            testID="paywall-plans-unavailable"
            title={PAYWALL_OFFERS_UNAVAILABLE[plans.reason].title}
            tone="reassuring"
          />
          {onRetryOffering !== undefined && plans.reason !== 'not-configured' && (
            <AppButton
              onPress={onRetryOffering}
              style={styles.retry}
              testID="paywall-retry-offering"
              title={PAYWALL_RETRY_OFFERS_TITLE}
              variant="secondary"
            />
          )}
        </View>
      )}

      {presentation.showsBenefits && (
        <View style={styles.benefits} testID="paywall-benefits">
          {PAYWALL_BENEFITS.map((benefit, index) => (
            <PaywallBenefitRow
              icon={BENEFIT_ICONS[index]!}
              key={benefit}
              testID={`paywall-benefit-${index}`}
              text={benefit}
            />
          ))}
        </View>
      )}
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  // Tight vertical rhythm: the hero is an introduction, the plans the decision.
  hero: { alignItems: 'center', gap: spacing.sm },
  heroSmall: { gap: spacing.xs },
  title: { color: semanticColors.foreground, textAlign: 'center' },
  lead: { color: semanticColors.foregroundSoft, maxWidth: 360, textAlign: 'center' },
  benefits: { gap: spacing.sm, paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  plans: { gap: spacing.sm },
  unavailable: { gap: spacing.sm },
  retry: { alignSelf: 'center', minWidth: 160 },
  primary: { gap: spacing.xs },
  footnote: { color: semanticColors.foregroundSoft, textAlign: 'center' },
  links: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.base,
    justifyContent: 'center',
    paddingTop: spacing.xs,
  },
  link: { minHeight: Platform.OS === 'android' ? 32 : 28, justifyContent: 'center' },
  linkPressed: { opacity: interaction.pressedOpacity },
  linkText: { color: semanticColors.accent },
});

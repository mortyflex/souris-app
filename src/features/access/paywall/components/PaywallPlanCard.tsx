// BeautIzzy — a BeautIzzy Plus plan card
//
// One white card per plan the store offers, the shape of the onboarding
// option card: a selection ring on the left, the plan name and its price,
// then the store-derived facts as quiet lavender chips (« Économisez 17 % »,
// « n jours gratuits ») and the « Recommandé » badge on the annual plan
// when both are offered. Selected: the lavender tint and the accent border,
// and the ring fills. A radio for assistive technology: the whole card is
// the control, its label says everything the chips show. Every figure comes
// from the presentation model — nothing is computed here.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { PAYWALL_RECOMMENDED_LABEL } from '../paywall-copy';
import type { PaywallPlanCardModel } from '../paywall-presentation';

interface PaywallPlanCardProps {
  readonly card: PaywallPlanCardModel;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

export function PaywallPlanCard({ card, selected, onSelect }: PaywallPlanCardProps) {
  const chips = [card.savings, card.trial].filter((chip): chip is string => chip !== undefined);

  return (
    <Pressable
      accessibilityLabel={card.accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      onPress={onSelect}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.cardPressed]}
      testID={`paywall-plan-${card.plan}`}
    >
      <SelectionRing selected={selected} testID={`paywall-plan-${card.plan}-ring`} />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <AppText style={styles.title} variant="rowTitle">
            {card.title}
          </AppText>
          {card.recommended && (
            <View style={styles.recommended} testID={`paywall-plan-${card.plan}-recommended`}>
              <AppText style={styles.recommendedText} variant="chip">
                {PAYWALL_RECOMMENDED_LABEL}
              </AppText>
            </View>
          )}
        </View>
        <View style={styles.priceRow}>
          <AppText style={styles.price} variant="summaryValue" testID={`paywall-plan-${card.plan}-price`}>
            {card.price}
          </AppText>
          <AppText style={styles.period} variant="metadata">
            {card.period}
          </AppText>
        </View>
        {card.equivalent !== undefined && (
          <AppText style={styles.equivalent} variant="metadata" testID={`paywall-plan-${card.plan}-equivalent`}>
            {card.equivalent}
          </AppText>
        )}
        {chips.length > 0 && (
          <View style={styles.chips}>
            {chips.map((chip) => (
              <View key={chip} style={styles.chip}>
                <AppText style={styles.chipText} variant="chip">
                  {chip}
                </AppText>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** The selection mark: a hairline ring at rest, the accent fill with a white check once selected. Decorative. */
function SelectionRing({ selected, testID }: { readonly selected: boolean; readonly testID: string }) {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.ring, selected && styles.ringSelected]}
      testID={testID}
    >
      {selected && (
        <SymbolView
          name={{ ios: 'checkmark', android: 'check' }}
          size={13}
          tintColor={semanticColors.onAccent}
          weight="bold"
        />
      )}
    </View>
  );
}

const RING_SIZE = 24;

const styles = StyleSheet.create({
  card: {
    alignItems: 'flex-start',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.base,
  },
  cardSelected: { backgroundColor: semanticColors.surfaceLavender, borderColor: semanticColors.accent },
  cardPressed: { opacity: interaction.pressedOpacity, transform: [{ scale: interaction.cardPressedScale }] },
  ring: {
    alignItems: 'center',
    borderColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: RING_SIZE,
    justifyContent: 'center',
    // Centred on the first line of the title.
    marginTop: 1,
    width: RING_SIZE,
  },
  ringSelected: { backgroundColor: semanticColors.accent, borderColor: semanticColors.accent },
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  titleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  title: { color: semanticColors.foreground, flexShrink: 1 },
  recommended: {
    backgroundColor: semanticColors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  recommendedText: { color: semanticColors.onAccent },
  priceRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  price: { color: semanticColors.foreground, fontVariant: ['tabular-nums'] },
  period: { color: semanticColors.foregroundSoft },
  equivalent: { color: semanticColors.foregroundSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
  chip: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  chipText: { color: semanticColors.accent },
});

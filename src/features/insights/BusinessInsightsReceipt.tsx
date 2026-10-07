// BeautIzzy — BusinessInsightsReceipt
//
// The paper of « Tops & tendances » (DESIGN_OVERRIDES.md §34), the same warm
// torn slip as « Résumé du jour », but visual and comparative rather than a
// list — read top to bottom:
//
//   header     glyph, « Tops & tendances »
//   controls   Jour | Sem. | Mois | Année · ‹ Septembre 2026 ›
//   summary    « ENCAISSÉ » (THE strongest value) · rendez-vous réalisés ·
//              Panier moyen · optional notes                       compact
//   rankings   ONE horizontally paged carousel, one category per page, each
//              a Top 3 podium (`InsightsPodium`)
//   pagination four short pills, the current one plum/lilac; tappable, and
//              ONE adjustable element for VoiceOver / TalkBack
//   footer     the BeautIzzy wordmark, clear of the torn edge
//
// Horizontal paging is THE interaction. Nothing scrolls vertically while the
// content fits; only an unusually tall layout (the largest text sizes on a
// small phone) falls back to a quiet vertical scroll. The gaps between the
// sections are deliberately compact so that the whole paper — two-line podium
// names, pagination, wordmark and torn edge included — fits at once on a
// standard 6.1" iPhone.
//
// It renders the receipt model as is and computes nothing. The carousel page
// is local presentation state: it survives period changes and is forgotten
// when the ticket closes. A settled page change gives ONE selection haptic and
// is reported (`onCategoryChange`), so « Partager » shares the category on
// screen.

import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { InsightsPeriodKind } from '@/domain/insights';
import { insightsIcon } from '@/shared/icons/insights-icon';
import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { BrandMark } from '@/shared/ui/BrandMark';
import { PeriodNavigator, PeriodNavigatorCopy } from '@/shared/ui/PeriodNavigator';
import { ReceiptPaper, ReceiptTearLine } from '@/shared/ui/ReceiptPaper';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { useReduceMotion } from '@/shared/ui/useReduceMotion';
import {
  foregroundSoft,
  lavender,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { InsightsPodium } from './components/InsightsPodium';
import type { InsightsRankingKey, InsightsReceiptModel } from './insights-receipt';

// « Sem. » keeps the four options readable in the paper width; it is spoken
// in full.
const PERIOD_OPTIONS = [
  { value: 'DAY', label: 'Jour', testID: 'business-insights-period-day' },
  {
    value: 'WEEK',
    label: 'Sem.',
    accessibilityLabel: 'Semaine',
    testID: 'business-insights-period-week',
  },
  { value: 'MONTH', label: 'Mois', testID: 'business-insights-period-month' },
  { value: 'YEAR', label: 'Année', testID: 'business-insights-period-year' },
] as const;

/** The paper's own side padding, bled through by the carousel so pages slide edge to edge. */
const PAPER_SIDE_PADDING = spacing.lg;

interface BusinessInsightsReceiptProps {
  readonly model: InsightsReceiptModel;
  readonly width: number;
  readonly maxHeight: number;
  readonly periodKind: InsightsPeriodKind;
  readonly periodLabel: string;
  readonly previousLabel: string;
  readonly nextLabel: string;
  readonly onPeriodKindChange: (kind: InsightsPeriodKind) => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  /** The settled carousel category, after each real change. */
  readonly onCategoryChange?: (category: InsightsRankingKey) => void;
}

export function BusinessInsightsReceipt({
  model,
  width,
  maxHeight,
  periodKind,
  periodLabel,
  previousLabel,
  nextLabel,
  onPeriodKindChange,
  onPrevious,
  onNext,
  onCategoryChange,
}: BusinessInsightsReceiptProps) {
  const reduceMotion = useReduceMotion();
  const carousel = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const pageCount = model.sections.length;
  const current = model.sections[page] ?? model.sections[0]!;

  const settleOn = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), pageCount - 1);
    if (clamped === page) return;
    haptics.selection();
    setPage(clamped);
    const settled = model.sections[clamped];
    if (settled) onCategoryChange?.(settled.key);
  };

  // A swipe settles here once, after the snap — never while the finger moves.
  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    settleOn(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), pageCount - 1);
    carousel.current?.scrollTo({ x: clamped * width, animated: !reduceMotion });
    settleOn(clamped);
  };

  return (
    <ReceiptPaper maxHeight={maxHeight} testID="business-insights-receipt" width={width}>
      <ScrollView
        alwaysBounceVertical={false}
        bounces={false}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="business-insights-content"
      >
        <View style={styles.header}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.badge}
          >
            <SymbolView name={insightsIcon} size={18} tintColor={semanticColors.accent} />
          </View>
          <AppText accessibilityRole="header" variant="sheetTitle">
            Tops & tendances
          </AppText>
        </View>

        <View style={styles.controls}>
          <SegmentedControl
            onChange={onPeriodKindChange}
            options={PERIOD_OPTIONS}
            stretch
            testID="business-insights-period"
            value={periodKind}
          />
          <PeriodNavigator
            nextLabel={nextLabel}
            onNext={onNext}
            onPrevious={onPrevious}
            previousLabel={previousLabel}
            style={styles.navigator}
            testID="business-insights-navigator"
          >
            <PeriodNavigatorCopy title={periodLabel} titleTestID="business-insights-period-label" />
          </PeriodNavigator>
        </View>

        <View style={styles.summary}>
          <View
            accessible
            accessibilityLabel={`Encaissé, ${model.cashCollected}`}
            style={styles.total}
            testID="business-insights-cash"
          >
            <AppText variant="eyebrow" style={styles.totalLabel}>
              Encaissé
            </AppText>
            <AppText adjustsFontSizeToFit numberOfLines={1} variant="display" style={styles.totalValue}>
              {model.cashCollected}
            </AppText>
          </View>
          <View style={styles.metrics}>
            <View
              accessible
              accessibilityLabel={model.completedAppointments}
              style={styles.metric}
              testID="business-insights-completed"
            >
              <AppText variant="metadata" style={styles.metricLabel}>
                {model.completedAppointments}
              </AppText>
            </View>
            <View
              accessible
              accessibilityLabel={`Panier moyen, ${model.averageAppointmentValue}`}
              style={[styles.metric, styles.metricEnd]}
              testID="business-insights-average"
            >
              <AppText variant="metadata" style={styles.metricLabel}>
                Panier moyen
              </AppText>
              <AppText variant="control" style={styles.tabular}>
                {model.averageAppointmentValue}
              </AppText>
            </View>
          </View>
          {model.activityNote !== undefined && (
            <AppText variant="metadata" style={styles.note} testID="business-insights-activity-note">
              {model.activityNote}
            </AppText>
          )}
          {model.conflictNote !== undefined && (
            <AppText variant="metadata" style={styles.note} testID="business-insights-conflict-note">
              {model.conflictNote}
            </AppText>
          )}
        </View>

        <ReceiptTearLine style={styles.tearLine} />

        <ScrollView
          decelerationRate="fast"
          horizontal
          onMomentumScrollEnd={onMomentumScrollEnd}
          pagingEnabled
          ref={carousel}
          showsHorizontalScrollIndicator={false}
          style={styles.carousel}
          testID="business-insights-rankings"
        >
          {model.sections.map((section, index) => {
            const active = index === page;
            return (
              // Only the settled page is exposed to VoiceOver / TalkBack; the
              // pagination below moves between categories.
              <View
                accessibilityElementsHidden={!active}
                importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
                key={section.key}
                style={[styles.page, { width }]}
                testID={`business-insights-page-${section.key}`}
              >
                <InsightsPodium section={section} testID={`business-insights-podium-${section.key}`} />
              </View>
            );
          })}
        </ScrollView>

        <View
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          accessibilityLabel={`${current.title}, ${page + 1} sur ${pageCount}`}
          accessibilityRole="adjustable"
          accessible
          onAccessibilityAction={(event) =>
            goTo(event.nativeEvent.actionName === 'increment' ? page + 1 : page - 1)
          }
          style={styles.pagination}
          testID="business-insights-pagination"
        >
          {model.sections.map((section, index) => (
            <Pressable
              hitSlop={{ bottom: spacing.md, left: spacing.xs, right: spacing.xs, top: spacing.md }}
              key={section.key}
              onPress={() => goTo(index)}
              testID={`business-insights-page-indicator-${section.key}`}
            >
              <View style={[styles.pill, index === page && styles.pillActive]} />
            </Pressable>
          ))}
        </View>

        <BrandMark decorative size={67} style={styles.brand} variant="editorial" />
      </ScrollView>
    </ReceiptPaper>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1 },
  // The paper's own bottom padding keeps the wordmark clear of the torn edge.
  content: { paddingBottom: 0 },
  header: { alignItems: 'center', gap: 2 },
  badge: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 36,
    justifyContent: 'center',
    marginBottom: spacing.xs,
    width: 36,
  },
  controls: { gap: spacing.xs, marginTop: spacing.sm },
  // On paper the navigator is only its controls and copy: no second surface.
  navigator: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, paddingVertical: 0 },
  summary: { gap: spacing.xs, marginTop: spacing.sm },
  total: {
    alignItems: 'center',
    backgroundColor: lavender.lav050,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  totalLabel: { color: semanticColors.accent },
  totalValue: {
    color: semanticColors.brandForeground,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  metrics: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  metric: { flexShrink: 1 },
  metricEnd: { alignItems: 'flex-end' },
  metricLabel: { color: foregroundSoft },
  tabular: { fontVariant: ['tabular-nums'] },
  note: { textAlign: 'center' },
  carousel: { flexGrow: 0, marginHorizontal: -PAPER_SIDE_PADDING },
  page: { paddingHorizontal: PAPER_SIDE_PADDING },
  pagination: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  pill: { backgroundColor: lavender.lav200, borderRadius: radii.pill, height: 5, width: 5 },
  pillActive: { backgroundColor: semanticColors.accent, width: 16 },
  tearLine: { marginVertical: spacing.md },
  // The wordmark PNG carries its own transparent padding: a short margin
  // already reads as breathing room under the pagination.
  brand: { alignSelf: 'center', marginTop: spacing.md, opacity: 0.85 },
});

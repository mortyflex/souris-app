// Souris — Selected services composer (Appointment service editor)
//
// Sticky composition zone kept permanently visible under the search field so
// the professional always sees what is being composed.
//
// - 1 to 2 drafts: every card is visible.
// - more than 2 drafts: the zone collapses to the first two cards plus a
//   "+N autre(s) prestation(s)" row; expanding reveals all cards inside a
//   height-capped scroll area so the composer never owns the whole screen.
//
// Drag & drop, expansion, price/processing editing and removal stay fully
// available in both states.

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import { AppText } from '@/shared/ui/AppText';
import { SectionHeader } from '@/shared/ui/SectionHeader';
import {
  duration,
  easing,
  foregroundSoft,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import { SortableDraftList, type SortableDraftEntry } from './SortableDraftList';

interface SelectedServicesComposerProps {
  readonly entries: readonly SortableDraftEntry[];
  readonly expandedDraftId: string | null;
  readonly canRemove: boolean;
  readonly onToggleExpanded: (draftKey: string) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
  readonly onUpdatePrice: (draftKey: string, price: number) => void;
  readonly onUpdatePhaseDuration: (
    draftKey: string,
    phaseId: string,
    durationMinutes: number,
  ) => void;
  readonly onRemove: (draftKey: string) => void;
}

const COLLAPSE_THRESHOLD = 2;
const COLLAPSED_VISIBLE_COUNT = 2;
const EXPANDED_MAX_HEIGHT = 296;

const TRANSITION_EASING = Easing.bezier(...easing.out);

export function SelectedServicesComposer({
  entries,
  expandedDraftId,
  canRemove,
  onToggleExpanded,
  onReorder,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onRemove,
}: SelectedServicesComposerProps) {
  const [showAll, setShowAll] = useState(false);
  const reducedMotion = useReducedMotion();

  const layoutTransition = useMemo(
    () =>
      LinearTransition.duration(reducedMotion ? 0 : duration.disclosure).easing(
        TRANSITION_EASING,
      ),
    [reducedMotion],
  );

  const moreRowEntering = useMemo(
    () => (reducedMotion ? undefined : FadeIn.duration(160).easing(TRANSITION_EASING)),
    [reducedMotion],
  );

  const moreRowExiting = useMemo(
    () => (reducedMotion ? undefined : FadeOut.duration(140).easing(TRANSITION_EASING)),
    [reducedMotion],
  );

  const count = entries.length;
  const collapsible = count > COLLAPSE_THRESHOLD;
  const collapsed = collapsible && !showAll;
  const visibleEntries = collapsed ? entries.slice(0, COLLAPSED_VISIBLE_COUNT) : entries;
  const hiddenCount = count - visibleEntries.length;

  const sortableList = (
    <SortableDraftList
      canRemove={canRemove}
      entries={visibleEntries}
      expandedDraftId={expandedDraftId}
      onRemove={onRemove}
      onReorder={onReorder}
      onToggleExpanded={onToggleExpanded}
      onUpdatePhaseDuration={onUpdatePhaseDuration}
      onUpdatePrice={onUpdatePrice}
    />
  );

  return (
    <Animated.View layout={layoutTransition} style={styles.composer}>
      <View style={styles.headerRow}>
        <SectionHeader count={count} title="Sélectionnées" />
        {collapsible && showAll && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Réduire la liste des prestations sélectionnées"
            hitSlop={spacing.sm}
            onPress={() => setShowAll(false)}
            style={({ pressed }) => [styles.collapseAction, pressed && styles.collapseActionPressed]}
          >
            <AppText variant="metadata" style={styles.collapseText}>
              Réduire
            </AppText>
          </Pressable>
        )}
      </View>

      {collapsed ? (
        <>
          {sortableList}
          <Animated.View entering={moreRowEntering} exiting={moreRowExiting}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Afficher les ${hiddenCount} autres prestations sélectionnées`}
              onPress={() => setShowAll(true)}
              style={({ pressed }) => [styles.moreRow, pressed && styles.moreRowPressed]}
            >
              <AppText variant="metadata" style={styles.moreLabel}>
                {`+${hiddenCount} autre${hiddenCount > 1 ? 's' : ''} prestation${hiddenCount > 1 ? 's' : ''}`}
              </AppText>
              <AppText variant="metadata" style={styles.moreAction}>
                Tout afficher
              </AppText>
              <SymbolView
                name={{ ios: 'chevron.down', android: 'expand_more' }}
                size={12}
                tintColor={semanticColors.accent}
              />
            </Pressable>
          </Animated.View>
        </>
      ) : collapsible ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: EXPANDED_MAX_HEIGHT }}
        >
          {sortableList}
        </ScrollView>
      ) : (
        sortableList
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  composer: { gap: spacing.sm },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  collapseAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  collapseActionPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    transform: [{ scale: interaction.pressedScale }],
  },
  collapseText: { color: semanticColors.accent },
  moreRow: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.base,
  },
  moreRowPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  moreLabel: { color: foregroundSoft, flex: 1, fontVariant: ['tabular-nums'] },
  moreAction: { color: semanticColors.accent },
});

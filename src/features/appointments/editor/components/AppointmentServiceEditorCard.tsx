// BeautIzzy — Appointment selected-service editor card
//
// Shared by NEW Appointment Creation (Résumé) and existing Appointment
// Editing. Collapsed it is a compact recognition/reorder row; expanded it
// exposes quick price adjustment and the shared per-phase timing editor
// (±5 minute steppers, no keyboard). Removing the Service from an existing
// Appointment draft is a swipe on the row (SortableDraftList wraps the card
// in the shared SwipeToDeleteRow) — the card carries no remove control.
// Structural changes (rename, add, remove, reorder, active/processing type)
// stay in Prestations & tarifs.
//
// Every adjustment is Appointment-snapshot data: neither Creation nor
// Editing writes the Service catalog. Official defaults are edited only from
// Prestations & tarifs.
//
// `grouped` (« Modifier le rendez-vous », DESIGN_OVERRIDES.md §27): a row of
// ONE white grouped list — inset separator, reorder handle leading, and a
// small category dot (violet Service, azure Technique) whose meaning is also
// spoken in the row's hint, never colour alone. With the unified `CATEGORIES`
// organisation (nails, esthetics) the internal type is not exposed: no dot,
// no spoken type, and unattended time reads « d’attente »
// (`getAppointmentWording`).

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { getAppointmentWording } from '@/features/services/catalogue-presentation';
import { AppText } from '@/shared/ui/AppText';
import { DisclosureChevron } from '@/shared/ui/DisclosureChevron';
import { useFormScrollView } from '@/shared/ui/FormScrollView';
import {
  duration,
  easing,
  fontFamilies,
  foregroundSoft,
  interaction,
  radii,
  rose,
  semanticColors,
  serviceCategoryColors,
  spacing,
} from '@/shared/ui/theme';
import { GroupedSeparator } from '@/shared/ui/GroupedSurface';
import type { SortableDraftCardProps } from './SortableDraftList';
import { AppointmentPhaseTimingEditor } from './AppointmentPhaseTimingEditor';
import { LEADING_DRAG_HANDLE_WIDTH } from './SortableRowList';
import {
  formatPriceInput,
  getDraftDurationMinutes,
  getDraftProcessingMinutes,
  parsePriceInput,
} from '../draft';
import { formatCreationDuration, formatCreationPrice } from '../presentation';

const TRANSITION_EASING = Easing.bezier(...easing.out);
const categoryNames = { SERVICE: 'Service', TECHNIQUE: 'Technique' } as const;


export function AppointmentServiceEditorCard({
  draft,
  expanded,
  onToggleExpanded,
  onUpdatePrice,
  onUpdatePhaseDuration,
  dragHandle,
  grouped = false,
  separated = false,
  organization = 'SERVICE_TYPES',
}: SortableDraftCardProps) {
  const wording = getAppointmentWording(organization);
  const showsType = grouped && wording.distinguishesTypes;
  const [priceText, setPriceText] = useState(() => formatPriceInput(draft.price));
  const [priceInvalid, setPriceInvalid] = useState(false);
  const [priceFocused, setPriceFocused] = useState(false);
  // An expanded card may sit low in the list: the form keeps the price visible above the keyboard.
  const formScroll = useFormScrollView();
  const reducedMotion = useReducedMotion();

  const layoutTransition = useMemo(
    () =>
      LinearTransition.duration(reducedMotion ? 0 : duration.disclosure).easing(
        TRANSITION_EASING,
      ),
    [reducedMotion],
  );
  const enteringAnimation = useMemo(
    () => (reducedMotion ? undefined : FadeIn.duration(160).easing(TRANSITION_EASING)),
    [reducedMotion],
  );
  const exitingAnimation = useMemo(
    () => (reducedMotion ? undefined : FadeOut.duration(140).easing(TRANSITION_EASING)),
    [reducedMotion],
  );

  const totalDuration = getDraftDurationMinutes(draft);
  const processingDuration = getDraftProcessingMinutes(draft);
  const activeDuration = totalDuration - processingDuration;
  const durationSummary =
    processingDuration > 0
      ? `${formatCreationDuration(activeDuration)} + ${formatCreationDuration(processingDuration)} ${wording.waitingTimeSuffix}`
      : formatCreationDuration(totalDuration);

  const handlePriceChange = (text: string) => {
    setPriceText(text);
    const parsed = parsePriceInput(text);
    if (parsed === undefined) {
      setPriceInvalid(text.trim().length > 0);
      return;
    }
    setPriceInvalid(false);
    onUpdatePrice(parsed);
  };

  const handlePriceBlur = () => {
    setPriceFocused(false);
    if (priceInvalid) {
      setPriceText(formatPriceInput(draft.price));
      setPriceInvalid(false);
    }
  };

  return (
    <Animated.View layout={layoutTransition} style={grouped ? styles.groupedRow : styles.card}>
      {separated && <GroupedSeparator inset={dragHandle ? LEADING_DRAG_HANDLE_WIDTH : spacing.base} />}
      <View
        style={[
          styles.cardHeader,
          grouped && styles.groupedHeader,
          grouped && dragHandle !== undefined && styles.groupedHeaderWithHandle,
        ]}
      >
        {grouped && dragHandle}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? `Réduire ${draft.serviceName}` : `Développer ${draft.serviceName}`
          }
          accessibilityHint={showsType ? categoryNames[draft.serviceType] : undefined}
          accessibilityState={{ expanded }}
          onPress={onToggleExpanded}
          style={({ pressed }) => [
            styles.headerPressable,
            pressed && (grouped ? styles.groupedHeaderPressed : styles.headerPressed),
          ]}
        >
          {showsType && (
            <View
              style={[
                styles.categoryDot,
                { backgroundColor: serviceCategoryColors[draft.serviceType].accent },
              ]}
              testID={`draft-category-${draft.serviceType}`}
            />
          )}
          <View style={styles.cardCopy}>
            <AppText variant="control" numberOfLines={2} style={styles.serviceName}>
              {draft.serviceName}
            </AppText>
            <AppText variant="metadata" numberOfLines={1} style={styles.serviceMeta}>
              {durationSummary}
            </AppText>
          </View>
          <AppText variant="metadata" style={styles.cardPrice}>
            {formatCreationPrice(draft.price)}
          </AppText>
          <DisclosureChevron expanded={expanded} style={styles.disclosure} />
        </Pressable>
        {!grouped && dragHandle}
      </View>

      {expanded && (
        <Animated.View
          entering={enteringAnimation}
          exiting={exitingAnimation}
          style={[styles.expandedPanel, grouped && styles.groupedExpandedPanel]}
        >
          <View style={styles.customization}>
            <View style={styles.fieldRow}>
              <AppText variant="metadata" style={styles.fieldLabel}>
                Prix
              </AppText>
              <View
                style={[
                  styles.inputShell,
                  priceFocused && styles.inputShellFocused,
                  priceInvalid && styles.inputShellInvalid,
                ]}
              >
                <TextInput
                  accessibilityLabel={`Prix de ${draft.serviceName}`}
                  keyboardType="decimal-pad"
                  onBlur={handlePriceBlur}
                  onChangeText={handlePriceChange}
                  onFocus={() => {
                    setPriceFocused(true);
                    formScroll?.revealFocusedInput();
                  }}
                  selectTextOnFocus
                  style={styles.input}
                  value={priceText}
                />
                <AppText variant="metadata" style={styles.suffix}>
                  €
                </AppText>
              </View>
            </View>
            {priceInvalid && (
              <AppText variant="metadata" style={styles.fieldError}>
                Prix invalide
              </AppText>
            )}

            <View style={styles.durations}>
              {draft.serviceType === 'TECHNIQUE' && (
                <AppText variant="metadata" style={styles.fieldLabel}>
                  Durées
                </AppText>
              )}
              <AppointmentPhaseTimingEditor
                onChangePhaseDuration={onUpdatePhaseDuration}
                organization={organization}
                phases={draft.phases}
                serviceName={draft.serviceName}
                serviceType={draft.serviceType}
              />
            </View>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    overflow: 'hidden',
  },
  groupedRow: { backgroundColor: semanticColors.surfaceElevated, overflow: 'hidden' },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
    paddingLeft: spacing.base,
    paddingVertical: spacing.xs,
  },
  groupedHeader: { minHeight: 60, paddingRight: spacing.md },
  groupedHeaderWithHandle: { paddingLeft: 0 },
  groupedHeaderPressed: { backgroundColor: semanticColors.surfaceLavender },
  categoryDot: { borderRadius: 4, height: 8, marginRight: spacing.sm, width: 8 },
  headerPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  headerPressed: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    transform: [{ scale: interaction.cardPressedScale }],
  },
  cardCopy: { flex: 1, gap: 2, minWidth: 0 },
  serviceName: { color: semanticColors.foreground },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  // A long name wraps (two lines at most); the price and chevron keep their width.
  cardPrice: {
    color: semanticColors.foreground,
    flexShrink: 0,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.sm,
  },
  disclosure: { flexShrink: 0, marginLeft: spacing.sm },
  expandedPanel: {
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.medium,
    marginBottom: spacing.xs,
    marginHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  groupedExpandedPanel: {
    backgroundColor: semanticColors.surfaceLavender,
    marginBottom: spacing.md,
    marginHorizontal: spacing.base,
  },
  customization: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  fieldLabel: { color: foregroundSoft, flexShrink: 1 },
  inputShell: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1.5,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
  },
  inputShellFocused: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.accent,
  },
  inputShellInvalid: {
    backgroundColor: semanticColors.surfaceRose,
    borderColor: rose.rose600,
  },
  input: {
    color: semanticColors.foreground,
    fontFamily: fontFamilies['400'],
    fontVariant: ['tabular-nums'],
    fontSize: 15,
    minHeight: 36,
    minWidth: 64,
    paddingVertical: 0,
    textAlign: 'right',
  },
  suffix: { color: foregroundSoft, fontVariant: ['tabular-nums'], marginLeft: spacing.xs },
  fieldError: { color: rose.rose600 },
  durations: { gap: spacing.xs },
});

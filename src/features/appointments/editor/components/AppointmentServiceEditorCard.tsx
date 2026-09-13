// Souris — Appointment selected-service editor card
//
// Shared by NEW Appointment Creation (Résumé) and existing Appointment
// Editing. Collapsed it is a compact recognition/reorder row; expanded it
// exposes quick price adjustment and the shared per-phase timing editor
// (±5 minute steppers, no keyboard). Structural changes (rename, add,
// remove, reorder, active/processing type) stay in Prestations & tarifs.
//
// Every adjustment is Appointment-snapshot data: neither Creation nor
// Editing writes the Service catalog. Official defaults are edited only from
// Prestations & tarifs.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { AppText } from '@/shared/ui/AppText';
import { DisclosureChevron } from '@/shared/ui/DisclosureChevron';
import {
  duration,
  easing,
  fontFamilies,
  foregroundSoft,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';
import type { SortableDraftCardProps } from './SortableDraftList';
import { AppointmentPhaseTimingEditor } from './AppointmentPhaseTimingEditor';
import {
  formatPriceInput,
  getDraftDurationMinutes,
  getDraftProcessingMinutes,
  parsePriceInput,
} from '../draft';
import { formatCreationDuration, formatCreationPrice } from '../presentation';

const TRANSITION_EASING = Easing.bezier(...easing.out);


export function AppointmentServiceEditorCard({
  draft,
  expanded,
  onToggleExpanded,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onRemove,
  canRemove,
  dragHandle,
}: SortableDraftCardProps) {
  const [priceText, setPriceText] = useState(() => formatPriceInput(draft.price));
  const [priceInvalid, setPriceInvalid] = useState(false);
  const [priceFocused, setPriceFocused] = useState(false);
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
      ? `${formatCreationDuration(activeDuration)} + ${formatCreationDuration(processingDuration)} de pose`
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
    <Animated.View layout={layoutTransition} style={styles.card}>
      <View style={styles.cardHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? `Réduire ${draft.serviceName}` : `Développer ${draft.serviceName}`
          }
          accessibilityState={{ expanded }}
          onPress={onToggleExpanded}
          style={({ pressed }) => [styles.headerPressable, pressed && styles.headerPressed]}
        >
          <View style={styles.cardCopy}>
            <AppText variant="control" numberOfLines={1} style={styles.serviceName}>
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
        {dragHandle}
      </View>

      {expanded && (
        <Animated.View
          entering={enteringAnimation}
          exiting={exitingAnimation}
          style={styles.expandedPanel}
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
                  onFocus={() => setPriceFocused(true)}
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
                phases={draft.phases}
                serviceName={draft.serviceName}
                serviceType={draft.serviceType}
              />
            </View>

            {canRemove && (
              <View style={styles.removeRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer ${draft.serviceName}`}
                  hitSlop={spacing.sm}
                  onPress={onRemove}
                  style={({ pressed }) => [
                    styles.removeAction,
                    pressed && styles.removeActionPressed,
                  ]}
                >
                  <AppText variant="metadata" style={styles.removeText}>
                    Retirer
                  </AppText>
                </Pressable>
              </View>
            )}
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
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 56,
    paddingLeft: spacing.base,
    paddingVertical: spacing.xs,
  },
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
  cardPrice: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.sm,
  },
  disclosure: { marginLeft: spacing.sm },
  expandedPanel: {
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.medium,
    marginBottom: spacing.xs,
    marginHorizontal: spacing.xs,
    overflow: 'hidden',
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
  removeRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
  },
  removeAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  removeActionPressed: { backgroundColor: semanticColors.surfaceRose },
  removeText: { color: rose.rose600 },
});

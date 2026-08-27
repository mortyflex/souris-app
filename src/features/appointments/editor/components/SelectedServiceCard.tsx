// Souris — Selected service draft card (Appointment service editor)
//
// Selected cards start as compact recognition/reorder rows. The expanded
// section hosts appointment-specific editors and the draft-only Retirer
// action; catalog services are never modified.

import { useMemo, useState, type ReactNode } from 'react';
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
  foregroundSoft,
  interaction,
  peach,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';
import {
  formatPriceInput,
  getDraftDurationMinutes,
  getDraftProcessingMinutes,
  getProcessingPhases,
  getSelectedServiceDraftKey,
  parsePriceInput,
  stepPhaseDuration,
  type SelectedServiceDraft,
} from '../draft';
import {
  formatCreationDuration,
  formatCreationPrice,
} from '../presentation';

interface SelectedServiceCardProps {
  readonly draft: SelectedServiceDraft;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly onUpdatePrice: (price: number) => void;
  readonly onUpdatePhaseDuration: (phaseId: string, durationMinutes: number) => void;
  readonly onRemove: () => void;
  readonly canRemove: boolean;
  /** Explicit drag handle (hidden when reordering is unavailable). */
  readonly dragHandle?: ReactNode;
}

const TRANSITION_EASING = Easing.bezier(...easing.out);

export function SelectedServiceCard({
  draft,
  expanded,
  onToggleExpanded,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onRemove,
  canRemove,
  dragHandle,
}: SelectedServiceCardProps) {
  const draftKey = getSelectedServiceDraftKey(draft);
  const [priceText, setPriceText] = useState(() => formatPriceInput(draft.price));
  const [priceInvalid, setPriceInvalid] = useState(false);
  const [priceFocused, setPriceFocused] = useState(false);
  const processingPhases = getProcessingPhases(draft);
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
            expanded
              ? `Réduire ${draft.serviceName}`
              : `Développer ${draft.serviceName}`
          }
          accessibilityState={{ expanded }}
          onPress={onToggleExpanded}
          style={({ pressed }) => [styles.headerPressable, pressed && styles.headerPressed]}
          testID={`toggle-${draftKey}`}
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
            <View style={styles.priceRow}>
              <AppText variant="metadata" style={styles.fieldLabel}>
                Prix
              </AppText>
              <View
                style={[
                  styles.priceField,
                  priceFocused && styles.priceFieldFocused,
                  priceInvalid && styles.priceFieldInvalid,
                ]}
              >
                <TextInput
                  accessibilityLabel={`Prix de ${draft.serviceName}`}
                  keyboardType="decimal-pad"
                  onBlur={handlePriceBlur}
                  onChangeText={handlePriceChange}
                  onFocus={() => setPriceFocused(true)}
                  selectTextOnFocus
                  style={[styles.priceInput, priceInvalid && styles.priceInputInvalid]}
                  value={priceText}
                />
                <AppText variant="metadata" style={styles.currencySuffix}>
                  €
                </AppText>
              </View>
            </View>
            {priceInvalid && (
              <AppText variant="metadata" style={styles.priceError}>
                Prix invalide
              </AppText>
            )}

            {processingPhases.map((phase) => {
              const value = phase.durationMinutes;
              const atMinimum = value <= 0;
              return (
                <View key={phase.id} style={styles.processingRow}>
                  <AppText variant="metadata" style={styles.fieldLabel}>
                    {phase.name}
                  </AppText>
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Réduire ${phase.name}`}
                      accessibilityState={{ disabled: atMinimum }}
                      disabled={atMinimum}
                      hitSlop={spacing.xs}
                      onPress={() =>
                        onUpdatePhaseDuration(phase.id, stepPhaseDuration(value, -5))
                      }
                      style={({ pressed }) => [
                        styles.stepperButton,
                        atMinimum && styles.stepperButtonDisabled,
                        pressed && !atMinimum && styles.stepperButtonPressed,
                      ]}
                    >
                      <AppText
                        variant="control"
                        style={[styles.stepperGlyph, atMinimum && styles.stepperGlyphDisabled]}
                      >
                        −
                      </AppText>
                    </Pressable>
                    <AppText
                      variant="control"
                      style={styles.stepperValue}
                      testID={`phase-value-${phase.id}`}
                    >
                      {formatCreationDuration(value)}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Augmenter ${phase.name}`}
                      hitSlop={spacing.xs}
                      onPress={() => onUpdatePhaseDuration(phase.id, stepPhaseDuration(value, 5))}
                      style={({ pressed }) => [
                        styles.stepperButton,
                        pressed && styles.stepperButtonPressed,
                      ]}
                    >
                      <AppText variant="control" style={styles.stepperGlyph}>
                        +
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          {canRemove && (
            <View style={styles.removeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Retirer ${draft.serviceName}`}
                hitSlop={spacing.sm}
                onPress={onRemove}
                style={({ pressed }) => [styles.removeAction, pressed && styles.removeActionPressed]}
                testID={`remove-${draftKey}`}
              >
                <AppText variant="metadata" style={styles.removeText}>
                  Retirer
                </AppText>
              </Pressable>
            </View>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderColor: semanticColors.borderLavender,
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
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
  disclosure: {
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
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
  fieldLabel: { color: foregroundSoft },
  priceRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  priceField: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderRadius: radii.medium,
    borderWidth: 1.5,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
  },
  priceFieldFocused: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.accent,
  },
  priceFieldInvalid: {
    backgroundColor: semanticColors.surfaceRose,
    borderColor: rose.rose600,
  },
  priceInput: {
    color: semanticColors.foreground,
    fontFamily: 'Inter_400Regular',
    fontVariant: ['tabular-nums'],
    fontSize: 15,
    minHeight: 36,
    minWidth: 72,
    paddingVertical: 0,
    textAlign: 'right',
  },
  priceInputInvalid: { color: semanticColors.foreground },
  currencySuffix: {
    color: foregroundSoft,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.xs,
  },
  priceError: { color: semanticColors.foreground },
  processingRow: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfacePeach,
    borderRadius: radii.medium,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.sm,
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfacePeachStrong,
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.small,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  stepperButtonPressed: { backgroundColor: semanticColors.surfacePeach },
  stepperButtonDisabled: { backgroundColor: semanticColors.surface },
  stepperGlyph: { color: peach.peach700, fontSize: 17, lineHeight: 20 },
  stepperGlyphDisabled: { color: semanticColors.foregroundMuted },
  stepperValue: {
    color: semanticColors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    textAlign: 'center',
  },
  removeRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  removeAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  removeActionPressed: {
    backgroundColor: semanticColors.surfaceRose,
  },
  removeText: { color: rose.rose600 },
});

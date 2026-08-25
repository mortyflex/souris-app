// Souris — Selected service draft card (Appointment Creation)
//
// Selected cards start as compact recognition/reorder rows. The expanded
// section hosts appointment-specific editors and the draft-only Retirer
// action; catalog services are never modified.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';

import { AppText } from '@/shared/ui/AppText';
import {
  colors,
  easing,
  foregroundSoft,
  lavender,
  peach,
  radii,
  rose,
  spacing,
} from '@/shared/ui/theme';
import type { Service } from '@/domain/appointments';

import {
  formatPriceInput,
  getProcessingPhases,
  parsePriceInput,
  stepPhaseDuration,
  type SelectedServiceDraft,
} from '../draft';
import {
  formatCreationDuration,
  formatCreationPrice,
  getServiceDurationMinutes,
  getServiceProcessingMinutes,
} from '../presentation';

interface SelectedServiceCardProps {
  readonly draft: SelectedServiceDraft;
  readonly service: Service;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly onUpdatePrice: (price: number) => void;
  readonly onUpdatePhaseDuration: (phaseId: string, durationMinutes: number) => void;
  readonly onRemove: () => void;
  /** Explicit drag handle (hidden when reordering is unavailable). */
  readonly dragHandle?: ReactNode;
}

const TRANSITION_DURATION_MS = 220;
const TRANSITION_EASING = Easing.bezier(...easing.out);

export function SelectedServiceCard({
  draft,
  service,
  expanded,
  onToggleExpanded,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onRemove,
  dragHandle,
}: SelectedServiceCardProps) {
  const [priceText, setPriceText] = useState(() => formatPriceInput(draft.price));
  const [priceInvalid, setPriceInvalid] = useState(false);
  const processingPhases = getProcessingPhases(service);
  const reducedMotion = useReducedMotion();
  const chevronRotation = useSharedValue(expanded ? 180 : 0);

  useEffect(() => {
    chevronRotation.set(
      withTiming(expanded ? 180 : 0, {
        duration: reducedMotion ? 0 : TRANSITION_DURATION_MS,
        easing: TRANSITION_EASING,
      }),
    );
  }, [chevronRotation, expanded, reducedMotion]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.get()}deg` }],
  }));

  const layoutTransition = useMemo(
    () =>
      LinearTransition.duration(reducedMotion ? 0 : TRANSITION_DURATION_MS).easing(
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

  const totalDuration = getServiceDurationMinutes(service, draft.phaseDurationOverrides);
  const processingDuration = getServiceProcessingMinutes(service, draft.phaseDurationOverrides);
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
          accessibilityLabel={expanded ? `Réduire ${service.name}` : `Développer ${service.name}`}
          accessibilityState={{ expanded }}
          onPress={onToggleExpanded}
          style={({ pressed }) => [styles.headerPressable, pressed && styles.headerPressed]}
          testID={`toggle-${draft.serviceId}`}
        >
          <View style={styles.cardCopy}>
            <AppText variant="control" numberOfLines={1} style={styles.serviceName}>
              {service.name}
            </AppText>
            <AppText variant="metadata" numberOfLines={1} style={styles.serviceMeta}>
              {durationSummary}
            </AppText>
          </View>
          <AppText variant="metadata" style={styles.cardPrice}>
            {formatCreationPrice(draft.price)}
          </AppText>
          <Animated.View style={[styles.disclosure, chevronStyle]}>
            <SymbolView
              name={{ ios: 'chevron.down', android: 'keyboard_arrow_down' }}
              size={18}
              tintColor={colors.muted}
            />
          </Animated.View>
        </Pressable>
        {dragHandle}
      </View>

      {expanded && (
        <Animated.View entering={enteringAnimation} exiting={exitingAnimation}>
          <View style={styles.customization}>
            <View style={styles.priceRow}>
              <AppText variant="metadata" style={styles.fieldLabel}>
                Prix
              </AppText>
              <View style={styles.priceField}>
                <TextInput
                  accessibilityLabel={`Prix de ${service.name}`}
                  keyboardType="decimal-pad"
                  onBlur={handlePriceBlur}
                  onChangeText={handlePriceChange}
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
              const value = draft.phaseDurationOverrides[phase.id] ?? phase.durationMinutes;
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

          <View style={styles.removeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${service.name}`}
              hitSlop={spacing.sm}
              onPress={onRemove}
              style={({ pressed }) => [styles.removeAction, pressed && styles.removeActionPressed]}
              testID={`remove-${draft.serviceId}`}
            >
              <AppText variant="metadata" style={styles.removeText}>
                Retirer
              </AppText>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: lavender.lav050,
    borderColor: lavender.lav200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
  headerPressed: { backgroundColor: lavender.lav100 },
  cardCopy: { flex: 1, gap: 2, minWidth: 0 },
  serviceName: { color: colors.foreground },
  serviceMeta: { color: foregroundSoft, fontVariant: ['tabular-nums'] },
  cardPrice: {
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.sm,
  },
  disclosure: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    marginLeft: spacing.sm,
    width: 24,
  },
  customization: {
    borderTopColor: lavender.lav200,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  fieldLabel: { color: foregroundSoft },
  priceRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  priceField: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: lavender.lav200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
  },
  priceInput: {
    color: colors.foreground,
    fontFamily: 'Inter_400Regular',
    fontVariant: ['tabular-nums'],
    fontSize: 15,
    minHeight: 36,
    minWidth: 72,
    paddingVertical: 0,
    textAlign: 'right',
  },
  priceInputInvalid: { color: rose.rose600 },
  currencySuffix: {
    color: foregroundSoft,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.xs,
  },
  priceError: { color: rose.rose600 },
  processingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepper: {
    alignItems: 'center',
    backgroundColor: peach.peach050,
    borderRadius: radii.ios.default,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: peach.peach200,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  stepperButtonPressed: { backgroundColor: peach.peach100 },
  stepperButtonDisabled: { backgroundColor: colors.surface, borderColor: colors.border },
  stepperGlyph: { color: peach.peach700, fontSize: 17, lineHeight: 20 },
  stepperGlyphDisabled: { color: colors.muted },
  stepperValue: {
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    textAlign: 'center',
  },
  removeRow: {
    alignItems: 'flex-end',
    borderTopColor: lavender.lav200,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  removeAction: { alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  removeActionPressed: { opacity: 0.72 },
  removeText: { color: rose.rose600 },
});

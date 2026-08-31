// Souris — Appointment selected-service editor card
//
// Shared by NEW Appointment Creation (Résumé) and existing Appointment
// Editing. Collapsed it is a compact recognition/reorder row; expanded it
// exposes quick price and per-phase duration adjustment. Structural changes
// (rename, add, remove, reorder, active/processing type) stay in
// Prestations & tarifs.
//
// The card never decides whether adjustments reach the catalog: the
// showCatalogHint flag and the commit itself belong to the parent use case
// (Creation commits on success; Editing never does).

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
  foregroundSoft,
  interaction,
  peach,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';
import { parsePositiveDurationInput } from '@/features/services/editor/service-form';
import type { SortableDraftCardProps } from './SortableDraftList';
import {
  formatPriceInput,
  getDraftDurationMinutes,
  getDraftProcessingMinutes,
  parsePriceInput,
} from '../draft';
import { formatCreationDuration, formatCreationPrice } from '../presentation';

const TRANSITION_EASING = Easing.bezier(...easing.out);

interface AppointmentServiceEditorCardProps extends SortableDraftCardProps {
  /** Creation-only: explains that adjustments become future catalog defaults. */
  readonly showCatalogHint?: boolean;
}

export function AppointmentServiceEditorCard({
  draft,
  expanded,
  onToggleExpanded,
  onUpdatePrice,
  onUpdatePhaseDuration,
  onRemove,
  canRemove,
  dragHandle,
  showCatalogHint = false,
}: AppointmentServiceEditorCardProps) {
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

            {draft.serviceType === 'SERVICE' ? (
              <View style={styles.fieldRow}>
                <AppText variant="metadata" style={styles.fieldLabel}>
                  Durée
                </AppText>
                <PhaseDurationField
                  accessibilityLabel={`Durée de ${draft.serviceName}`}
                  minutes={draft.phases[0]?.durationMinutes ?? 0}
                  onCommit={(minutes) =>
                    draft.phases[0] &&
                    onUpdatePhaseDuration(draft.phases[0].id, minutes)
                  }
                  phaseId={draft.phases[0]?.id ?? 'missing-phase'}
                />
              </View>
            ) : (
              <View style={styles.durations}>
                <AppText variant="metadata" style={styles.fieldLabel}>
                  Durées
                </AppText>
                {draft.phases.map((phase) => (
                  <View
                    key={phase.id}
                    style={[
                      styles.phaseRow,
                      phase.requiresStaff ? styles.activePhaseRow : styles.processingPhaseRow,
                    ]}
                  >
                    <AppText
                      variant="metadata"
                      numberOfLines={1}
                      style={[
                        styles.phaseName,
                        !phase.requiresStaff && styles.processingPhaseName,
                      ]}
                    >
                      {phase.name}
                    </AppText>
                    <PhaseDurationField
                      accessibilityLabel={`Durée de ${phase.name}`}
                      minutes={phase.durationMinutes}
                      onCommit={(minutes) => onUpdatePhaseDuration(phase.id, minutes)}
                      phaseId={phase.id}
                    />
                  </View>
                ))}
              </View>
            )}

            {showCatalogHint && (
              <AppText
                variant="metadata"
                style={styles.catalogHint}
                testID="catalog-commit-hint"
              >
                Les modifications seront enregistrées pour les prochains rendez-vous.
              </AppText>
            )}

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

interface PhaseDurationFieldProps {
  readonly phaseId: string;
  readonly minutes: number;
  readonly accessibilityLabel: string;
  readonly onCommit: (minutes: number) => void;
}

function PhaseDurationField({
  phaseId,
  minutes,
  accessibilityLabel,
  onCommit,
}: PhaseDurationFieldProps) {
  const [text, setText] = useState(() => String(minutes));
  const [invalid, setInvalid] = useState(false);
  const [focused, setFocused] = useState(false);

  const handleChange = (value: string) => {
    setText(value);
    const parsed = parsePositiveDurationInput(value);
    if (parsed === undefined) {
      setInvalid(value.trim().length > 0);
      return;
    }
    setInvalid(false);
    onCommit(parsed);
  };

  const handleBlur = () => {
    setFocused(false);
    if (invalid) {
      setText(String(minutes));
      setInvalid(false);
    }
  };

  return (
    <View
      style={[
        styles.inputShell,
        styles.durationShell,
        focused && styles.inputShellFocused,
        invalid && styles.inputShellInvalid,
      ]}
    >
      <TextInput
        accessibilityLabel={accessibilityLabel}
        keyboardType="number-pad"
        onBlur={handleBlur}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        selectTextOnFocus
        style={styles.input}
        testID={`phase-duration-${phaseId}`}
        value={text}
      />
      <AppText variant="metadata" style={styles.suffix}>
        min
      </AppText>
    </View>
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
    fontFamily: 'Inter_400Regular',
    fontVariant: ['tabular-nums'],
    fontSize: 15,
    minHeight: 36,
    minWidth: 64,
    paddingVertical: 0,
    textAlign: 'right',
  },
  suffix: { color: foregroundSoft, fontVariant: ['tabular-nums'], marginLeft: spacing.xs },
  fieldError: { color: rose.rose600 },
  durations: { gap: spacing.sm },
  phaseRow: {
    alignItems: 'center',
    borderRadius: radii.medium,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  activePhaseRow: { backgroundColor: semanticColors.surface },
  processingPhaseRow: { backgroundColor: semanticColors.surfacePeach },
  phaseName: { color: foregroundSoft, flex: 1, minWidth: 0 },
  processingPhaseName: { color: peach.peach700 },
  durationShell: { backgroundColor: semanticColors.surfaceElevated },
  catalogHint: {
    color: semanticColors.foregroundMuted,
    lineHeight: 18,
  },
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

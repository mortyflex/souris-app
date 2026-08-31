import { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { scheduleOnRN } from 'react-native-worklets';

import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import {
  duration,
  interaction,
  peach,
  radii,
  rose,
  semanticColors,
  shadowSource,
  spacing,
} from '@/shared/ui/theme';

import type {
  ServiceFormValidation,
  ServicePhaseFormValues,
} from '../service-form';
import { ServiceTextField } from './ServiceTextField';

interface SortablePhaseEditorProps {
  readonly phases: readonly ServicePhaseFormValues[];
  readonly attempted: boolean;
  readonly validation: ServiceFormValidation;
  /** At most one phase is expanded at a time. */
  readonly expandedPhaseId: string | null;
  readonly onToggleExpanded: (phaseId: string | null) => void;
  readonly onChangeName: (phaseId: string, name: string) => void;
  readonly onChangeDuration: (phaseId: string, duration: string) => void;
  readonly onChangeRequiresStaff: (phaseId: string, requiresStaff: boolean) => void;
  readonly onRemove: (phaseId: string) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
}

const GAP = spacing.md;
const LONG_PRESS_MS = 200;

function triggerDragStart() {
  haptics.dragStart();
}

function commitReorder(
  onReorder: (fromIndex: number, toIndex: number) => void,
  fromIndex: number,
  toIndex: number,
) {
  haptics.dragEnd();
  if (fromIndex !== toIndex) {
    onReorder(fromIndex, toIndex);
  }
}

export function SortablePhaseEditor({
  phases,
  attempted,
  validation,
  expandedPhaseId,
  onToggleExpanded,
  onChangeName,
  onChangeDuration,
  onChangeRequiresStaff,
  onRemove,
  onReorder,
}: SortablePhaseEditorProps) {
  return (
    <View style={styles.list}>
      {phases.map((phase, index) => (
        <SortablePhaseRow
          key={phase.id}
          attempted={attempted}
          canRemove={phases.length > 1}
          expanded={expandedPhaseId === phase.id}
          index={index}
          onChangeDuration={(duration) => onChangeDuration(phase.id, duration)}
          onChangeName={(name) => onChangeName(phase.id, name)}
          onChangeRequiresStaff={(requiresStaff) =>
            onChangeRequiresStaff(phase.id, requiresStaff)
          }
          onCollapseAll={() => onToggleExpanded(null)}
          onToggle={() =>
            onToggleExpanded(expandedPhaseId === phase.id ? null : phase.id)
          }
          onRemove={() => onRemove(phase.id)}
          onReorder={onReorder}
          phase={phase}
          total={phases.length}
          validity={validation.phaseValidities[index]}
        />
      ))}
    </View>
  );
}

interface SortablePhaseRowProps {
  readonly phase: ServicePhaseFormValues;
  readonly index: number;
  readonly total: number;
  readonly attempted: boolean;
  readonly canRemove: boolean;
  readonly expanded: boolean;
  readonly validity?: ServiceFormValidation['phaseValidities'][number];
  readonly onChangeName: (name: string) => void;
  readonly onChangeDuration: (duration: string) => void;
  readonly onChangeRequiresStaff: (requiresStaff: boolean) => void;
  readonly onToggle: () => void;
  readonly onCollapseAll: () => void;
  readonly onRemove: () => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
}

function SortablePhaseRow({
  phase,
  index,
  total,
  attempted,
  canRemove,
  expanded,
  validity,
  onChangeName,
  onChangeDuration,
  onChangeRequiresStaff,
  onToggle,
  onCollapseAll,
  onRemove,
  onReorder,
}: SortablePhaseRowProps) {
  const reducedMotion = useReducedMotion();
  const active = useSharedValue(false);
  const translationY = useSharedValue(0);
  const rowHeight = useSharedValue(1);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart(() => {
          'worklet';
          active.set(true);
          scheduleOnRN(triggerDragStart);
          // Dragging works on the compact representation: collapse the
          // currently expanded phase so all rows share the collapsed height.
          scheduleOnRN(onCollapseAll);
        })
        .onUpdate((event) => {
          'worklet';
          translationY.set(event.translationY);
        })
        .onFinalize((_event, success) => {
          'worklet';
          const offset = Math.round(translationY.get() / (rowHeight.get() + GAP));
          const target = Math.max(0, Math.min(total - 1, index + offset));
          active.set(false);
          translationY.set(
            withTiming(0, { duration: reducedMotion ? 0 : duration.disclosure }),
          );
          if (success) {
            scheduleOnRN(commitReorder, onReorder, index, target);
          }
        }),
    [
      active,
      index,
      onCollapseAll,
      onReorder,
      reducedMotion,
      rowHeight,
      total,
      translationY,
    ],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translationY.get() },
      {
        scale: withTiming(active.get() ? interaction.dragLiftScale : 1, {
          duration: reducedMotion ? 0 : duration.state,
        }),
      },
    ],
    zIndex: active.get() ? 10 : 0,
    shadowColor: shadowSource.navy,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: withTiming(active.get() ? 0.16 : 0, {
      duration: reducedMotion ? 0 : duration.state,
    }),
    shadowRadius: 12,
  }));

  const measure = (event: LayoutChangeEvent) => {
    rowHeight.set(event.nativeEvent.layout.height);
  };

  const accessibleMove = (event: AccessibilityActionEvent) => {
    const action = event.nativeEvent.actionName;
    const target = action === 'increment' ? index + 1 : index - 1;
    if (target < 0 || target >= total) return;
    haptics.selection();
    onReorder(index, target);
  };

  // The header (with the drag handle) stays mounted in both states so a drag
  // that collapses the expanded phase never unmounts its own gesture.
  const dragHandle = total > 1 ? (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityActions={[
          { name: 'decrement', label: 'Déplacer vers le haut' },
          { name: 'increment', label: 'Déplacer vers le bas' },
        ]}
        accessibilityLabel={`Déplacer la phase ${index + 1}`}
        accessibilityRole="adjustable"
        onAccessibilityAction={accessibleMove}
        style={styles.dragHandle}
      >
        <SymbolView
          name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }}
          size={17}
          tintColor={semanticColors.foregroundMuted}
        />
      </View>
    </GestureDetector>
  ) : null;

  return (
    <Animated.View
      onLayout={measure}
      style={[
        styles.phaseCard,
        phase.requiresStaff ? styles.activePhase : styles.processingPhase,
        animatedStyle,
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            expanded
              ? `Réduire la phase ${index + 1}`
              : `Développer la phase ${index + 1}`
          }
          accessibilityState={{ expanded }}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.headerContent,
            pressed && styles.headerPressed,
          ]}
        >
          <View style={styles.headerIndex}>
            <AppText variant="chip">{index + 1}</AppText>
          </View>
          <View style={styles.headerCopy}>
            {phase.requiresStaff && phase.name.trim().length === 0 ? (
              <AppText
                variant="control"
                numberOfLines={1}
                style={styles.placeholderName}
              >
                Nouvelle phase
              </AppText>
            ) : (
              <AppText variant="control" numberOfLines={1}>
                {phase.name}
              </AppText>
            )}
            <AppText
              variant="metadata"
              style={phase.requiresStaff ? styles.activeTypeText : styles.processingTypeText}
            >
              {phase.requiresStaff ? 'Temps actif' : 'Temps de pose'}
            </AppText>
          </View>
          <AppText variant="control" style={styles.headerDuration}>
            {phase.durationMinutes.trim().length > 0
              ? `${phase.durationMinutes} min`
              : '—'}
          </AppText>
        </Pressable>
        {dragHandle}
      </View>

      {expanded && (
        <View style={styles.expandedBody}>
          {phase.requiresStaff && (
            <ServiceTextField
              accessibilityLabel={`Nom de la phase ${index + 1}`}
              error={
                attempted && validity && !validity.nameValid
                  ? 'Le nom est requis.'
                  : undefined
              }
              label="Nom"
              onChangeText={onChangeName}
              placeholder="Ex. Application"
              value={phase.name}
            />
          )}
          <ServiceTextField
            accessibilityLabel={`Durée de la phase ${index + 1}`}
            error={
              attempted && validity && !validity.durationValid
                ? 'Indiquez une durée positive en minutes.'
                : undefined
            }
            keyboardType="number-pad"
            label="Durée"
            onChangeText={onChangeDuration}
            placeholder="30"
            suffix="min"
            value={phase.durationMinutes}
          />

          <View style={styles.typeGroup}>
            <AppText variant="metadata" style={styles.fieldLabel}>
              Type
            </AppText>
            <View style={styles.typeChoices}>
              <PhaseTypeChoice
                accessibilityLabel={`Phase ${index + 1}, temps actif`}
                description="Professionnelle occupée"
                label="Temps actif"
                onPress={() => onChangeRequiresStaff(true)}
                selected={phase.requiresStaff}
                processing={false}
              />
              <PhaseTypeChoice
                accessibilityLabel={`Phase ${index + 1}, temps de pose`}
                description="Professionnelle disponible"
                label="Temps de pose"
                onPress={() => onChangeRequiresStaff(false)}
                selected={!phase.requiresStaff}
                processing
              />
            </View>
          </View>

          {canRemove && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retirer la phase ${index + 1}`}
              onPress={onRemove}
              style={({ pressed }) => [
                styles.removeAction,
                pressed && styles.removeActionPressed,
              ]}
            >
              <AppText variant="control" style={styles.removeText}>
                Retirer la phase
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </Animated.View>
  );
}

function PhaseTypeChoice({
  accessibilityLabel,
  label,
  description,
  selected,
  processing,
  onPress,
}: {
  readonly accessibilityLabel: string;
  readonly label: string;
  readonly description: string;
  readonly selected: boolean;
  readonly processing: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.typeChoice,
        processing ? styles.processingChoice : styles.activeChoice,
        selected && styles.selectedChoice,
        pressed && styles.typeChoicePressed,
      ]}
    >
      <View style={styles.choiceHeader}>
        <AppText variant="control">{label}</AppText>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
      </View>
      <AppText variant="metadata" style={styles.choiceDescription}>
        {description}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: GAP },
  phaseCard: {
    borderCurve: 'continuous',
    borderRadius: radii.large,
  },
  activePhase: { backgroundColor: semanticColors.surfaceLavender },
  processingPhase: { backgroundColor: semanticColors.surfacePeach },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 68,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  headerContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 68,
    paddingVertical: spacing.sm,
  },
  headerPressed: { opacity: interaction.pressedOpacity },
  headerIndex: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: radii.pill,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  placeholderName: { color: semanticColors.foregroundMuted },
  headerDuration: {
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  dragHandle: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  expandedBody: {
    gap: spacing.md,
    paddingBottom: spacing.base,
    paddingHorizontal: spacing.base,
  },
  activeTypeText: { color: semanticColors.accent },
  processingTypeText: { color: peach.peach700 },
  typeGroup: { gap: spacing.xs },
  fieldLabel: { color: semanticColors.foregroundSoft },
  typeChoices: { flexDirection: 'row', gap: spacing.sm },
  typeChoice: {
    borderColor: 'transparent',
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1.5,
    flex: 1,
    gap: 2,
    minHeight: 72,
    padding: spacing.sm,
  },
  activeChoice: { backgroundColor: semanticColors.surfaceLavenderStrong },
  processingChoice: { backgroundColor: semanticColors.surfacePeachStrong },
  selectedChoice: { borderColor: semanticColors.accent },
  typeChoicePressed: { opacity: interaction.pressedOpacity },
  choiceHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'space-between',
  },
  choiceDescription: { color: semanticColors.foregroundSoft, lineHeight: 17 },
  radio: {
    alignItems: 'center',
    borderColor: semanticColors.foregroundMuted,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  radioSelected: { borderColor: semanticColors.accent },
  radioDot: {
    backgroundColor: semanticColors.accent,
    borderRadius: radii.pill,
    height: 8,
    width: 8,
  },
  removeAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  removeActionPressed: { backgroundColor: semanticColors.surfaceRose },
  removeText: { color: rose.rose600 },
});

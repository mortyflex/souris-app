// Souris — Creation stepper
//
// Compact connected three-node stepper:
//   ✓────────●────────○
//   Cliente  Prestations  Résumé
//
// Completed nodes carry a checkmark and an accent outgoing connector.
// The current node is accent-filled; future nodes stay muted.
// Completed steps are tappable to navigate back; forward jumps are
// never possible.

import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import {
  canNavigateTo,
  getStepProgressLabel,
  getStepState,
  stepLabels,
  type CreationStep,
} from '../steps';

interface CreationStepperProps {
  readonly step: CreationStep;
  readonly onStepPress: (step: CreationStep) => void;
}

const NODE_SIZE = 22;
const CONNECTOR_HEIGHT = 2;
const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function CreationStepper({ step, onStepPress }: CreationStepperProps) {
  return (
    <View style={styles.stepper} accessibilityLabel={getStepProgressLabel(step)}>
      {stepLabels.map((label, index) => {
        const state = getStepState(step, index);
        const reachable = canNavigateTo(step, index);
        const leftConnectorAccent = index > 0 && index <= step;
        const rightConnectorAccent = index < step && index < stepLabels.length - 1;
        const isLast = index === stepLabels.length - 1;

        return (
          <Pressable
            key={label}
            accessibilityRole={reachable ? 'button' : undefined}
            accessibilityLabel={
              state === 'completed'
                ? `${label} — terminée`
                : state === 'current'
                  ? `${label} — étape en cours`
                  : `${label} — à venir`
            }
            disabled={!reachable}
            onPress={() => onStepPress(index as CreationStep)}
            style={({ pressed }) => [
              styles.stepColumn,
              pressed && reachable && styles.stepPressed,
            ]}
          >
            <View style={styles.nodeRow}>
              <View
                style={[
                  styles.connector,
                  index === 0 && styles.connectorInvisible,
                  leftConnectorAccent && styles.connectorAccent,
                ]}
              />
              <View
                style={[
                  styles.node,
                  state === 'completed' && styles.completedNode,
                  state === 'current' && styles.currentNode,
                  state === 'future' && styles.futureNode,
                ]}
              >
                {state === 'completed' && (
                  <AppText variant="chip" style={styles.checkmark}>
                    ✓
                  </AppText>
                )}
                {state === 'current' && <View style={styles.currentDot} />}
              </View>
              <View
                style={[
                  styles.connector,
                  isLast && styles.connectorInvisible,
                  rightConnectorAccent && styles.connectorAccent,
                ]}
              />
            </View>
            <AppText
              variant="chip"
              numberOfLines={1}
              style={[
                styles.label,
                state === 'completed' && styles.completedLabel,
                state === 'current' && styles.currentLabel,
                state === 'future' && styles.futureLabel,
              ]}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    marginHorizontal: horizontalGutter,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  stepColumn: { alignItems: 'center', flex: 1, minWidth: 0, paddingVertical: spacing.xs },
  stepPressed: { transform: [{ scale: interaction.pressedScale }] },
  nodeRow: { alignItems: 'center', flexDirection: 'row', width: '100%' },
  node: {
    alignItems: 'center',
    borderColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: NODE_SIZE,
    justifyContent: 'center',
    width: NODE_SIZE,
  },
  completedNode: {
    backgroundColor: semanticColors.accent,
    borderColor: semanticColors.accent,
  },
  currentNode: {
    backgroundColor: semanticColors.accent,
    borderColor: semanticColors.accent,
  },
  futureNode: { backgroundColor: semanticColors.surfaceElevated },
  currentDot: {
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: 2,
    height: 4,
    width: 4,
  },
  checkmark: { color: semanticColors.surfaceElevated, fontSize: 11, lineHeight: 13 },
  connector: {
    backgroundColor: semanticColors.borderSubtle,
    flex: 1,
    height: CONNECTOR_HEIGHT,
  },
  connectorInvisible: { backgroundColor: 'transparent' },
  connectorAccent: { backgroundColor: semanticColors.accent },
  label: { marginTop: spacing.xs },
  completedLabel: { color: foregroundSoft },
  currentLabel: { color: semanticColors.accent },
  futureLabel: { color: semanticColors.foregroundMuted },
});

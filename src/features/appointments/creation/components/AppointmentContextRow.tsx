// Souris — Appointment context row
//
// Compact appointment-context surface used on every creation step.
// Keeps "who + when" visible without a large date/profile card.
//
// The time is the creation draft start time: tapping Modifier reveals a
// compact ±5 minute control. The calendar date never changes here.

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { colors, lavender, radii, spacing } from '@/shared/ui/theme';

import { formatCreationDateShort, formatCreationTime } from '../presentation';

const horizontalGutter = Platform.OS === 'android' ? 16 : 20;

interface AppointmentContextRowProps {
  readonly startAt: Date;
  readonly clientName?: string;
  /** Called with a ± minutes delta when the professional steps the time. */
  readonly onStartAtChange?: (deltaMinutes: number) => void;
}

export function AppointmentContextRow({
  startAt,
  clientName,
  onStartAtChange,
}: AppointmentContextRowProps) {
  const [editing, setEditing] = useState(false);
  const editable = onStartAtChange !== undefined;

  return (
    <View style={styles.contextRow}>
      {editing ? (
        <View style={styles.copy}>
          {clientName && (
            <AppText variant="rowTitle" numberOfLines={1} style={styles.clientName}>
              {clientName}
            </AppText>
          )}
          <View style={styles.editRow}>
            <AppText variant="metadata" numberOfLines={1} style={styles.editDate}>
              {formatCreationDateShort(startAt)}
            </AppText>
            <View style={styles.timeStepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reculer de 5 minutes"
                onPress={() => onStartAtChange?.(-5)}
                style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
              >
                <AppText variant="control" style={styles.stepGlyph}>
                  −
                </AppText>
              </Pressable>
              <AppText variant="control" style={styles.timeValue} testID="time-value">
                {formatCreationTime(startAt)}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Avancer de 5 minutes"
                onPress={() => onStartAtChange?.(5)}
                style={({ pressed }) => [styles.stepButton, pressed && styles.stepButtonPressed]}
              >
                <AppText variant="control" style={styles.stepGlyph}>
                  +
                </AppText>
              </Pressable>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Terminer la modification de l'heure"
              hitSlop={spacing.sm}
              onPress={() => setEditing(false)}
              style={({ pressed }) => [styles.editAction, pressed && styles.editActionPressed]}
              testID="time-done"
            >
              <AppText variant="metadata" style={styles.editActionText}>
                Terminer
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.normalRow}>
          <View style={styles.copy}>
            {clientName && (
              <AppText variant="rowTitle" numberOfLines={1} style={styles.clientName}>
                {clientName}
              </AppText>
            )}
            <AppText variant={clientName ? 'metadata' : 'control'} style={styles.timeLine}>
              {`${formatCreationDateShort(startAt)} · ${formatCreationTime(startAt)}`}
            </AppText>
          </View>
          {editable && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Modifier l'heure"
              hitSlop={spacing.sm}
              onPress={() => setEditing(true)}
              style={({ pressed }) => [styles.editAction, pressed && styles.editActionPressed]}
              testID="time-modifier"
            >
              <AppText variant="metadata" style={styles.editActionText}>
                Modifier
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contextRow: {
    backgroundColor: colors.surface,
    borderColor: lavender.lav100,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: horizontalGutter,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  normalRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  clientName: { color: colors.foreground },
  timeLine: { color: colors.foreground, fontVariant: ['tabular-nums'] },
  editRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  editDate: { color: colors.foreground, flexShrink: 1 },
  timeStepper: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: lavender.lav100,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  stepButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.ios.default,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  stepButtonPressed: { backgroundColor: lavender.lav100 },
  stepGlyph: { color: lavender.lav700, fontSize: 15, lineHeight: 18 },
  timeValue: {
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
    minWidth: 52,
    textAlign: 'center',
  },
  editAction: { alignItems: 'center', justifyContent: 'center', minHeight: 32 },
  editActionPressed: { opacity: 0.72 },
  editActionText: { color: lavender.lav700 },
});

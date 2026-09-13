// Souris — Birthday field (day + month, no year)
//
// One form row (« Anniversaire ») that expands INLINE into the two-column
// day / month wheel (BirthdayWheelPicker). No keyboard, no year, no nested
// overlay on top of the form sheet. Opening the wheel on an empty field
// starts from a neutral 1er janvier draft that is committed as soon as the
// wheel moves; « Effacer » removes the birthday.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { formatClientBirthday, type ClientBirthday } from '@/domain/clients';
import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { BirthdayWheelPicker } from './BirthdayWheelPicker';

interface BirthdayFieldProps {
  readonly value: ClientBirthday | undefined;
  readonly onChange: (value: ClientBirthday | undefined) => void;
}

const DEFAULT_BIRTHDAY: ClientBirthday = { month: 1, day: 1 };

export function BirthdayField({ value, onChange }: BirthdayFieldProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.field}>
      <AppText variant="metadata" style={styles.label}>
        Anniversaire
      </AppText>
      <Pressable
        accessibilityHint="Choisir le jour et le mois, sans année"
        accessibilityLabel="Anniversaire"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityValue={{ text: value ? formatClientBirthday(value) : 'Aucun' }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.row, expanded && styles.rowExpanded, pressed && styles.rowPressed]}
        testID="birthday-field"
      >
        <AppText variant="body" style={value ? styles.value : styles.placeholder} testID="birthday-value">
          {value ? formatClientBirthday(value) : 'Optionnel'}
        </AppText>
        <View style={[styles.chevron, expanded && styles.chevronExpanded]}>
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right' }}
            size={14}
            tintColor={expanded ? semanticColors.accent : semanticColors.foregroundMuted}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.selector} testID="birthday-selector">
          <BirthdayWheelPicker onChange={onChange} value={value ?? DEFAULT_BIRTHDAY} />
          {value && (
            <Pressable
              accessibilityLabel="Effacer l’anniversaire"
              accessibilityRole="button"
              hitSlop={spacing.sm}
              onPress={() => onChange(undefined)}
              style={({ pressed }) => [styles.clearAction, pressed && styles.clearActionPressed]}
              testID="birthday-clear"
            >
              <AppText variant="metadata" style={styles.clearText}>
                Effacer
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { color: semanticColors.foregroundSoft },
  row: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  rowExpanded: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.accent,
  },
  rowPressed: { backgroundColor: semanticColors.surfaceLavender },
  value: { color: semanticColors.foreground },
  placeholder: { color: semanticColors.foregroundMuted },
  chevron: { alignItems: 'center', height: 24, justifyContent: 'center', width: 24 },
  chevronExpanded: { transform: [{ rotate: '90deg' }] },
  selector: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.sm,
    marginTop: spacing.xs,
    padding: spacing.md,
  },
  clearAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  clearActionPressed: { backgroundColor: semanticColors.surfaceLavenderStrong },
  clearText: { color: semanticColors.accent },
});

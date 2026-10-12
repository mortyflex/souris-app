// BeautIzzy — the reminder opt-in of onboarding
//
// ONE option card, the recommended choice: automatic EMAIL reminders (the
// only client reminder channel BeautIzzy sends today — the wording never
// implies SMS). A checkbox for assistive technology; the whole card toggles.

import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, semanticColors, spacing } from '@/shared/ui/theme';

import { SelectionCheck } from './SelectionCheck';

// The word joiner (U+2060, zero-width) after the hyphen keeps « e-mail » on
// one line: a narrow phone otherwise breaks the title at « e- ».
export const REMINDER_OPTION_TITLE = 'Activer les rappels par e-\u2060mail';
export const REMINDER_OPTION_DESCRIPTION = 'Un e-mail est envoyé à vos clients 24 h avant chaque rendez-vous.';

interface ReminderOptionCardProps {
  readonly selected: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
}

export function ReminderOptionCard({ selected, onToggle, disabled = false }: ReminderOptionCardProps) {
  return (
    <Pressable
      accessibilityLabel={`${REMINDER_OPTION_TITLE}, recommandé`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.cardPressed]}
      testID="reminder-option"
    >
      <View style={[styles.glyph, selected && styles.glyphSelected]}>
        <SymbolView
          name={{ ios: 'bell.badge', android: 'notifications_active' }}
          size={20}
          tintColor={selected ? semanticColors.onAccent : semanticColors.accent}
        />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <AppText style={styles.title} variant="rowTitle">
            {REMINDER_OPTION_TITLE}
          </AppText>
          <View style={styles.badge}>
            <AppText style={styles.badgeText} variant="chip">
              Recommandé
            </AppText>
          </View>
        </View>
        <AppText style={styles.description} variant="metadata">
          {REMINDER_OPTION_DESCRIPTION}
        </AppText>
      </View>
      <SelectionCheck selected={selected} testID="reminder-option-check" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.base,
  },
  cardSelected: { backgroundColor: semanticColors.surfaceLavender, borderColor: semanticColors.accent },
  cardPressed: { opacity: interaction.pressedOpacity, transform: [{ scale: interaction.cardPressedScale }] },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  glyphSelected: { backgroundColor: semanticColors.accent },
  copy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  titleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  title: { color: semanticColors.foreground, flexShrink: 1 },
  badge: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: { color: semanticColors.accent },
  description: { color: semanticColors.foregroundSoft },
});

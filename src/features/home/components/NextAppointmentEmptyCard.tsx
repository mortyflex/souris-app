// BeautIzzy — Accueil « Prochain rendez-vous », nothing to come
//
// The empty version of the next-appointment slot. It takes the very place of
// NextAppointmentCard — the wide column of the Accueil top row — so the top
// area keeps its two cards whatever the day holds: the same shape, padding
// and strong lavender surface, so it is plainly the same card. Its content
// is ONE statement, centred in the card: a calendar glyph in a light disc
// and the message beside it. No eyebrow — « Prochain rendez-vous » over
// « Aucun rendez-vous à venir. » would say the same thing twice.
//
// Nothing to open: it is a plain statement, not a button, and offers no
// action — « Rendez-vous » in Actions rapides stays the way to create one.

import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { foregroundSoft, radii, semanticColors, spacing } from '@/shared/ui/theme';

/** The glyph disc of the Accueil figure cards. */
const GLYPH_DISC_SIZE = 36;

interface NextAppointmentEmptyCardProps {
  /** Layout only: how the card sits in the top area of Accueil. */
  readonly style?: StyleProp<ViewStyle>;
}

export function NextAppointmentEmptyCard({ style }: NextAppointmentEmptyCardProps) {
  return (
    <View
      accessible
      accessibilityLabel="Aucun rendez-vous à venir"
      style={[styles.card, style]}
      testID="home-next-appointment-empty"
    >
      <View style={styles.glyph}>
        <SymbolView
          name={{ ios: 'calendar', android: 'calendar_today' }}
          size={18}
          tintColor={semanticColors.accent}
        />
      </View>
      <AppText variant="body" style={styles.message}>
        Aucun rendez-vous à venir.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // The glyph and the message, centred in whatever height the pair of
    // cards shares.
    alignItems: 'center',
    // The surface of the populated card: the same card, with nothing in it.
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
    padding: spacing.md,
  },
  glyph: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceElevated,
    borderRadius: GLYPH_DISC_SIZE / 2,
    height: GLYPH_DISC_SIZE,
    justifyContent: 'center',
    width: GLYPH_DISC_SIZE,
  },
  // Free to wrap in its column; never cut.
  message: { color: foregroundSoft, flex: 1, minWidth: 0 },
});

// BeautIzzy — the small « Plus » mark
//
// The discreet, global cue that the signed-in account holds BeautIzzy Plus:
// a 20 pt lavender pill reading « Plus » in the accent `chip` role, set
// beside the logo of Accueil. Clearly secondary to the logo, lighter and
// smaller than the « BeautIzzy Plus » capsule of the paywall and of
// « Mon abonnement » (`PlusBrandBadge`): a mark, not a banner. Spoken as
// « BeautIzzy Plus ».
//
// Presentation only: the caller decides whether it is shown
// (`hasVerifiedPlusEntitlement`); this draws nothing else.

import { StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { radii, semanticColors, spacing } from '@/shared/ui/theme';

import { PLUS_BRAND_NAME } from '../paywall/paywall-copy';

export const PLUS_MARK_LABEL = 'Plus';
export const PLUS_MARK_HEIGHT = 20;

interface PlusMarkBadgeProps {
  readonly testID?: string;
}

export function PlusMarkBadge({ testID = 'plus-mark' }: PlusMarkBadgeProps) {
  return (
    <View accessible accessibilityLabel={PLUS_BRAND_NAME} style={styles.mark} testID={testID}>
      <AppText style={styles.label} variant="chip">
        {PLUS_MARK_LABEL}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: PLUS_MARK_HEIGHT,
    paddingHorizontal: spacing.sm,
  },
  label: { color: semanticColors.accent },
});

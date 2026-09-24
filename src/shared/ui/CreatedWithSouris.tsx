// Souris — CreatedWithSouris
//
// The footer of the Souris share images: « Créé avec » + the Souris wordmark
// (BrandMark, 64 pt), centred on one line, restrained at 85 % opacity. No
// slogan, no call to action. Shared by « Tops & tendances » and
// « Estimation tarifaire » so both images carry the SAME signature.
//
// Spoken once as « Créé avec Souris »: the wordmark itself is decorative.
// `allowFontScaling={false}` on export surfaces, whose text never scales.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { BrandMark } from './BrandMark';
import { foregroundSoft, spacing } from './theme';

export const CREATED_WITH_SOURIS_LABEL = 'Créé avec Souris';

interface CreatedWithSourisProps {
  readonly allowFontScaling?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function CreatedWithSouris({ allowFontScaling, style, testID }: CreatedWithSourisProps) {
  return (
    <View
      accessibilityLabel={CREATED_WITH_SOURIS_LABEL}
      accessible
      style={[styles.footer, style]}
      testID={testID}
    >
      <AppText allowFontScaling={allowFontScaling} style={styles.text} variant="metadata">
        Créé avec
      </AppText>
      <BrandMark decorative size={64} variant="wordmark" />
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    opacity: 0.85,
  },
  text: { color: foregroundSoft },
});

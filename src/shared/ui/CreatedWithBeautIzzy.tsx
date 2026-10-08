// BeautIzzy — CreatedWithBeautIzzy
//
// The footer of the share images: « Créé avec » + the editorial BeautIzzy
// logo, centred on one line, restrained at 85 % opacity. No slogan, no call to
// action. Shared by « Tops & tendances » and « Estimation tarifaire » so both
// images carry the SAME signature.
//
// The logo is the focus of the row and the words are secondary: the wordmark
// is a 68 pt box, « Créé avec » a quiet 12 pt — one step under `metadata`.
//
// Spoken once as « Créé avec BeautIzzy »: the logo itself is decorative.
// `allowFontScaling={false}` on export surfaces, whose text never scales.

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { BrandMark } from './BrandMark';
import { foregroundSoft, spacing } from './theme';

export const CREATED_WITH_BEAUTIZZY_LABEL = 'Créé avec BeautIzzy';
/** Box width of the editorial wordmark (dp). */
export const CREATED_WITH_LOGO_SIZE = 68;
/** « Créé avec »: `metadata`, one step smaller, so it never competes with the wordmark. */
export const CREATED_WITH_TEXT_SIZE = 12;

interface CreatedWithBeautIzzyProps {
  readonly allowFontScaling?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

export function CreatedWithBeautIzzy({ allowFontScaling, style, testID }: CreatedWithBeautIzzyProps) {
  return (
    <View
      accessibilityLabel={CREATED_WITH_BEAUTIZZY_LABEL}
      accessible
      style={[styles.footer, style]}
      testID={testID}
    >
      <AppText allowFontScaling={allowFontScaling} style={styles.text} variant="metadata">
        Créé avec
      </AppText>
      <BrandMark decorative size={CREATED_WITH_LOGO_SIZE} variant="editorial" />
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
  text: { color: foregroundSoft, fontSize: CREATED_WITH_TEXT_SIZE },
});

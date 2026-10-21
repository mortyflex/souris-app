// BeautIzzy — Accueil brand row preview (__DEV__ ONLY)
//
// A design test bench for the « Plus » mark beside the logo of Accueil: the
// REAL brand row (`HomeBrandRow`, the real logo at its real size, the real
// `PlusMarkBadge`) drawn twice on the real page background and gutter —
// without the mark (« Sans abonnement ») and with it (« BeautIzzy Plus ») —
// so its size, spacing, alignment and weight against the logo can be judged
// on a device. It is NOT product UI:
//
//   * reachable only from the « Développement » section of Plus, which exists
//     only under `__DEV__`; this module is `require`d inside a `__DEV__`
//     branch (PlusScreen), so Metro drops it from release bundles; it renders
//     nothing outside `__DEV__`;
//   * it reads no access state and writes none: the flag is a prop of the
//     presentational row, never a verification — nothing is granted, the
//     provider and Accueil itself are untouched;
//   * ONE native modal: a single BottomSheet with the shell's scrollable body.

import { Platform, StyleSheet, View } from 'react-native';

import { HomeBrandRow } from '@/features/home/components/HomeBrandRow';
import { AppText } from '@/shared/ui/AppText';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { gutter, radii, semanticColors, spacing } from '@/shared/ui/theme';

interface HomeBrandPreviewSheetProps {
  readonly visible: boolean;
  readonly onClose: () => void;
}

/** The two states of the row, in the order they are listed. */
export const homeBrandPreviewStates = [
  { key: 'without-plus', title: 'Sans abonnement', showPlus: false },
  { key: 'with-plus', title: 'BeautIzzy Plus', showPlus: true },
] as const;

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

export function HomeBrandPreviewSheet({ visible, onClose }: HomeBrandPreviewSheetProps) {
  if (!__DEV__) return null;

  return (
    <BottomSheet
      backdropLabel="Fermer l’aperçu du badge Plus"
      header={<SheetHeader action={{ label: 'Fermer', onPress: onClose }} eyebrow="DÉVELOPPEMENT" title="Badge Plus d’Accueil" />}
      onClose={onClose}
      scrollable
      testID="home-brand-preview-sheet"
      visible={visible}
    >
      <AppText style={styles.hint} variant="metadata">
        Aperçu visuel. Aucun abonnement réel, aucun changement d’accès.
      </AppText>
      <View style={styles.list}>
        {homeBrandPreviewStates.map((state) => (
          <View key={state.key} style={styles.entry} testID={`home-brand-preview-${state.key}`}>
            <AppText style={styles.entryTitle} variant="eyebrow">
              {state.title}
            </AppText>
            {/* The real page background and gutter, so the row reads as it does on Accueil. */}
            <View style={styles.page}>
              <HomeBrandRow
                markTestID={`home-brand-preview-${state.key}-mark`}
                showPlus={state.showPlus}
                testID={`home-brand-preview-${state.key}-row`}
              />
            </View>
          </View>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  hint: { color: semanticColors.foregroundSoft, paddingBottom: spacing.md },
  list: { gap: spacing.base, paddingBottom: spacing.lg },
  entry: { gap: spacing.xs },
  entryTitle: { color: semanticColors.foregroundSoft },
  page: {
    backgroundColor: semanticColors.screen,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.base,
  },
});

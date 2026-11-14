// BeautIzzy — the public page as the professional's clients see it
//
// A native rendering of the hero of the public page
// (web/src/components/booking/public-profile-view.tsx, phone layout): the
// cover as the ground, a white identity panel resting on its lower edge, the
// logo straddling both, the name in the editorial serif, the presentation
// under a hairline. Proportions, radii and paddings are the web's.
//
// It shows the form as it stands — unsaved edits included — and says so; it
// reads nothing and writes nothing. The cover and the logo are the two entry
// points of the photo sheet, exactly as before.
//
// Instrument Serif is the web's editorial face and has no place in the mobile
// type system: it is loaded here, for the name and the monogram of this
// preview only. Until its file is ready the name is drawn in the platform
// serif, never withheld.

import { InstrumentSerif_400Regular, useFonts } from '@expo-google-fonts/instrument-serif';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { StatePill } from '@/shared/ui/StatePill';
import {
  colors,
  foregroundSoft,
  interaction,
  lavender,
  nativeShadows,
  peach,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { BookingImageKind } from '../gateway';

interface BookingProfilePreviewProps {
  /** The name the page shows: the typed public name, or the Business name. */
  readonly name: string;
  /** The typed presentation; empty when there is none. */
  readonly description: string;
  readonly coverUri: string | undefined;
  readonly logoUri: string | undefined;
  /** The preview differs from what the public page shows today. */
  readonly unsaved: boolean;
  readonly disabled: boolean;
  readonly preparingImage: BookingImageKind | undefined;
  readonly onPressImage: (kind: BookingImageKind) => void;
}

const PREVIEW_LABEL = 'Aperçu de votre page';
const UNSAVED_LABEL = 'Non enregistré';
const UNSAVED_PILL = { fill: peach.peach050, dot: peach.peach700, text: peach.peach700 } as const;

const SERIF_FALLBACK = Platform.select({ ios: 'Georgia', default: 'serif' });

function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '').toUpperCase();
}

export function BookingProfilePreview({
  name,
  description,
  coverUri,
  logoUri,
  unsaved,
  disabled,
  preparingImage,
  onPressImage,
}: BookingProfilePreviewProps) {
  const [serifLoaded] = useFonts({ InstrumentSerif_400Regular });
  const serif = { fontFamily: serifLoaded ? 'InstrumentSerif_400Regular' : SERIF_FALLBACK };
  const presentation = description.trim();

  return (
    <View style={styles.root} testID="online-booking-preview">
      <View style={styles.caption}>
        <AppText variant="eyebrow" style={styles.captionLabel}>
          {PREVIEW_LABEL.toUpperCase()}
        </AppText>
        {unsaved && (
          <StatePill
            accessibilityLabel="Aperçu avec des modifications non enregistrées"
            colors={UNSAVED_PILL}
            label={UNSAVED_LABEL}
            testID="online-booking-preview-unsaved"
          />
        )}
      </View>

      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={coverUri ? 'Modifier la photo de couverture' : 'Ajouter une photo de couverture'}
          disabled={disabled}
          onPress={() => onPressImage('cover')}
          style={({ pressed }) => [styles.cover, coverUri ? styles.coverWithImage : styles.coverBand, pressed && styles.pressed]}
          testID="online-booking-cover"
        >
          {coverUri !== undefined && (
            <Image
              accessibilityIgnoresInvertColors
              contentFit="cover"
              source={{ uri: coverUri }}
              style={styles.fill}
              testID="online-booking-cover-image"
            />
          )}
          <View style={styles.editBadge}>
            <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera' }} size={14} tintColor={semanticColors.accent} />
            <AppText variant="metadata" style={styles.editBadgeLabel}>
              {coverUri ? 'Modifier' : 'Photo de couverture'}
            </AppText>
          </View>
          {preparingImage === 'cover' && <ActivityIndicator color={semanticColors.accent} style={styles.busy} />}
        </Pressable>

        <View style={styles.panel}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              logoUri ? 'Modifier le logo ou la photo de profil' : 'Ajouter un logo ou une photo de profil'
            }
            disabled={disabled}
            onPress={() => onPressImage('logo')}
            style={({ pressed }) => [styles.logo, pressed && styles.pressed]}
            testID="online-booking-logo"
          >
            <View style={styles.logoFrame}>
              {logoUri !== undefined ? (
                // Shown whole, never stretched — the web does the same.
                <Image
                  accessibilityIgnoresInvertColors
                  contentFit="contain"
                  source={{ uri: logoUri }}
                  style={styles.logoImage}
                  testID="online-booking-logo-image"
                />
              ) : (
                <AppText variant="sectionTitle" style={[styles.monogram, serif]}>
                  {initialOf(name)}
                </AppText>
              )}
              {preparingImage === 'logo' && <ActivityIndicator color={semanticColors.accent} style={styles.busy} />}
            </View>
            <View style={styles.logoBadge}>
              <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera' }} size={12} tintColor={semanticColors.accent} />
            </View>
          </Pressable>

          <AppText
            accessibilityRole="header"
            numberOfLines={4}
            style={[styles.name, serif]}
            testID="online-booking-preview-name"
            variant="sectionTitle"
          >
            {name}
          </AppText>

          {presentation.length > 0 && (
            <AppText numberOfLines={6} style={styles.description} testID="online-booking-preview-description" variant="body">
              {presentation}
            </AppText>
          )}
        </View>
      </View>
    </View>
  );
}

const LOGO_SIZE = 80;
const LOGO_RING = 4;
const PANEL_OVERLAP = 48;

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  caption: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 24 },
  captionLabel: { color: foregroundSoft },
  // web: rounded-[1.75rem], aspect-[16/10]; h-36 lavender band without a cover.
  cover: {
    backgroundColor: lavender.lav100,
    borderCurve: 'continuous',
    borderRadius: 28,
    overflow: 'hidden',
  },
  coverWithImage: { aspectRatio: 16 / 10 },
  coverBand: { height: 144 },
  fill: { height: '100%', width: '100%' },
  busy: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  editBadge: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 999,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
  },
  editBadgeLabel: { color: colors.foreground },
  // web: mx-3 -mt-12 rounded-[1.5rem] px-5 pb-6 shadow-lifted ring-border/60.
  panel: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: semanticColors.borderSubtle,
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.base,
    marginHorizontal: 12,
    marginTop: -PANEL_OVERLAP,
    paddingBottom: 24,
    paddingHorizontal: 20,
    ...nativeShadows.lifted,
  },
  // web: -mt-10 h-20 w-20 rounded-[1.25rem] ring-4 ring-background.
  logo: { marginTop: -(LOGO_SIZE / 2) },
  logoFrame: {
    alignItems: 'center',
    backgroundColor: lavender.lav050,
    borderColor: colors.background,
    borderCurve: 'continuous',
    borderRadius: 20 + LOGO_RING,
    borderWidth: LOGO_RING,
    height: LOGO_SIZE + LOGO_RING * 2,
    justifyContent: 'center',
    overflow: 'hidden',
    width: LOGO_SIZE + LOGO_RING * 2,
  },
  logoImage: { backgroundColor: colors.background, height: '100%', width: '100%' },
  logoBadge: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: semanticColors.borderSubtle,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    bottom: -2,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 26,
  },
  monogram: { color: lavender.lav700, fontSize: 40, fontWeight: '400', letterSpacing: 0, lineHeight: 46 },
  // web: font-serif, clamp(2rem, …) → 32px on a phone, leading 1.06, centred.
  name: {
    color: colors.foreground,
    fontSize: 32,
    fontWeight: '400',
    letterSpacing: -0.32,
    lineHeight: 35,
    textAlign: 'center',
  },
  // web: border-t pt-5, text-base leading-7, text-foreground/80, centred.
  description: {
    alignSelf: 'stretch',
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: foregroundSoft,
    lineHeight: 26,
    paddingTop: spacing.base,
    textAlign: 'center',
  },
  pressed: { opacity: interaction.pressedOpacity },
});

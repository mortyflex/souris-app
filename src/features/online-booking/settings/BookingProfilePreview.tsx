// BeautIzzy — the public page as the professional's clients see it
//
// A native rendering of the hero of the public page
// (web/src/components/booking/public-profile-view.tsx, phone layout): the
// cover as the ground, a white identity panel resting on its lower edge, the
// logo straddling both, the name in the brand display face, the presentation
// under a hairline. Proportions, radii and paddings are the web's.
//
// It shows the form as it stands — unsaved edits included — and says so; it
// reads nothing and writes nothing. The cover and the logo are the two entry
// points of the photo sheet, exactly as before.
//
// Fraunces is the brand display face of the public pages
// (docs/design/BRAND_TYPOGRAPHY.md) and has no place in the mobile type
// system, which stays Plus Jakarta Sans: it is loaded here, in its 400 weight —
// the web's headings, same cut — for the name and the monogram of this preview
// only. Until its file is ready the name is drawn in the platform serif, never
// withheld.
//
// The name is always shown whole. Its size and line breaks come from the
// width the panel really has (measured, estimated before the first layout)
// and from the font's glyph advances: `layoutPreviewName`. It is smaller than
// the web hero on purpose — a preview inside a settings screen, not a page.

// The weight's own entry point: the package index would bundle all 18 files.
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { useFonts } from '@expo-google-fonts/fraunces/useFonts';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/shared/ui/AppText';
import { StatePill } from '@/shared/ui/StatePill';
import {
  colors,
  foregroundSoft,
  gutter,
  interaction,
  lavender,
  nativeShadows,
  peach,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import type { BookingImageKind } from '../gateway';

import { PREVIEW_NAME_MAX_FONT_SCALE, layoutPreviewName } from './preview-name-layout';

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

/** The settings screen's side gutter: the panel's width before its first layout. */
const SCREEN_GUTTER = Platform.OS === 'android' ? gutter.android : gutter.ios;

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
  const [serifLoaded] = useFonts({ Fraunces_400Regular });
  const serif = { fontFamily: serifLoaded ? 'Fraunces_400Regular' : SERIF_FALLBACK };
  const presentation = description.trim();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [panelWidth, setPanelWidth] = useState<number>();
  const nameColumn =
    (panelWidth ?? windowWidth - 2 * SCREEN_GUTTER - 2 * PANEL_INSET) - 2 * PANEL_PADDING;
  const nameLayout = layoutPreviewName(name, nameColumn, fontScale);

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

        <View
          onLayout={(event) => setPanelWidth(event.nativeEvent.layout.width)}
          style={styles.panel}
          testID="online-booking-preview-panel"
        >
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
                // A logo stand-in: it keeps its frame's proportions, so it never scales with the text size.
                <AppText allowFontScaling={false} variant="sectionTitle" style={[styles.monogram, serif]}>
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
            accessibilityLabel={name.trim()}
            accessibilityRole="header"
            maxFontSizeMultiplier={PREVIEW_NAME_MAX_FONT_SCALE}
            style={[
              styles.name,
              serif,
              {
                fontSize: nameLayout.fontSize,
                letterSpacing: nameLayout.letterSpacing,
                lineHeight: nameLayout.lineHeight,
                // The accents' room is taken from the gap above, so the
                // name sits where it would without it.
                marginTop: -nameLayout.paddingTop,
                paddingTop: nameLayout.paddingTop,
              },
            ]}
            testID="online-booking-preview-name"
            variant="sectionTitle"
          >
            {nameLayout.text}
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
const PANEL_INSET = 12;
const PANEL_PADDING = 20;

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
    marginHorizontal: PANEL_INSET,
    marginTop: -PANEL_OVERLAP,
    paddingBottom: 24,
    paddingHorizontal: PANEL_PADDING,
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
  // The family encodes the weight (400): no fontWeight, as in AppText. The
  // line box is Fraunces' own (1.233em → 50): React Native then centres the
  // glyph in it, and an accented initial (« É ») keeps its accent on iOS.
  monogram: { color: lavender.lav700, fontSize: 40, letterSpacing: 0, lineHeight: 50 },
  // Size, leading, tracking and top inset: `layoutPreviewName`.
  name: { alignSelf: 'stretch', color: colors.foreground, textAlign: 'center' },
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

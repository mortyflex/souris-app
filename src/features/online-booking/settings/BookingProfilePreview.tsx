// BeautIzzy — the public page as the professional's clients see it
//
// A native rendering of the hero of the public page
// (web/src/components/booking/public-profile-view.tsx, phone layout — the
// « Nacre » design): the cover as the ground, a white identity panel resting
// on its lower edge, the logo straddling both, the name in the brand display
// face, the contact actions the page offers, the presentation under a
// hairline. Proportions, radii and paddings are the web's.
//
// The cover follows the web's rule: the professional's photo always wins;
// without one — none stored, removed, or a photo that is still loading or
// fails — the Nacre artwork shows. Nacre is ALWAYS drawn under the photo, so
// the cover is never blank and removing a photo restores Nacre at once. It is
// the web's own composition at rest, exported once as a still
// (assets/brand/nacre-cover.webp, 16:10 like the web cover on a phone): the
// app shows it without the web's slow drift.
//
// It shows the form as it stands — unsaved edits included — and says so; it
// reads nothing and writes nothing. The cover and the logo are the two entry
// points of the photo sheet, exactly as before. Only what the page publishes
// appears: the public phone and e-mail as the page's « Appeler » / « Écrire »
// actions (never their values, never the business's own details); the
// address stays in the form below — on the page it is listed further down.
//
// The brand typography (docs/design/BRAND_TYPOGRAPHY.md) has no place in the
// mobile type system, which stays Plus Jakarta Sans: it is loaded here, for
// this preview only — Fraunces 400 (the web's headings, same cut) for the name
// and the monogram, Manrope 400 / 600 for the presentation and the actions.
// Until the files are ready the platform serif and the UI family stand in;
// nothing is withheld.
//
// The name is always shown whole. Its size and line breaks come from the
// width the panel really has (measured, estimated before the first layout)
// and from the font's glyph advances: `layoutPreviewName`. It is smaller than
// the web hero on purpose — a preview inside a settings screen, not a page.

// Each weight's own entry point: a package index would bundle every weight.
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { useFonts } from '@expo-google-fonts/fraunces/useFonts';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
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
  /** Which contact actions the page offers: a public phone, a public e-mail (as typed in the form). */
  readonly contact: { readonly phone: boolean; readonly email: boolean };
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

/** The web's Nacre cover at rest (web/src/components/brand/nacre-cover.tsx), 1600 × 1000. */
const NACRE_COVER = require('../../../../assets/brand/nacre-cover.webp') as number;

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
  contact,
  unsaved,
  disabled,
  preparingImage,
  onPressImage,
}: BookingProfilePreviewProps) {
  const [brandLoaded] = useFonts({ Fraunces_400Regular, Manrope_400Regular, Manrope_600SemiBold });
  const serif = { fontFamily: brandLoaded ? 'Fraunces_400Regular' : SERIF_FALLBACK };
  // Until Manrope is ready, the UI family (AppText's own) stands in.
  const text = brandLoaded ? { fontFamily: 'Manrope_400Regular' } : undefined;
  const textStrong = brandLoaded ? { fontFamily: 'Manrope_600SemiBold' } : undefined;
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
          style={({ pressed }) => [styles.cover, pressed && styles.pressed]}
          testID="online-booking-cover"
        >
          {/* Nacre: the default cover, and what shows while a photo loads or if it fails. */}
          <Image
            accessibilityIgnoresInvertColors
            contentFit="cover"
            source={NACRE_COVER}
            style={styles.fill}
            testID="online-booking-cover-nacre"
          />
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
            <View style={styles.logoShadow}>
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

          {(contact.phone || contact.email) && (
            <View
              accessible
              accessibilityLabel={`Sur votre page : ${[contact.phone && 'Appeler', contact.email && 'Écrire'].filter(Boolean).join(' et ')}`}
              style={styles.actions}
              testID="online-booking-preview-actions"
            >
              {contact.phone && (
                <View style={styles.action} testID="online-booking-preview-call">
                  <SymbolView name={{ ios: 'phone', android: 'call' }} size={18} tintColor={lavender.lav700} />
                  <AppText allowFontScaling={false} style={[styles.actionLabel, textStrong]} variant="metadata">
                    Appeler
                  </AppText>
                </View>
              )}
              {contact.email && (
                <View style={styles.action} testID="online-booking-preview-write">
                  <SymbolView name={{ ios: 'envelope', android: 'mail' }} size={18} tintColor={lavender.lav700} />
                  <AppText allowFontScaling={false} style={[styles.actionLabel, textStrong]} variant="metadata">
                    Écrire
                  </AppText>
                </View>
              )}
            </View>
          )}

          {presentation.length > 0 && (
            <AppText numberOfLines={6} style={[styles.description, text]} testID="online-booking-preview-description" variant="body">
              {presentation}
            </AppText>
          )}
        </View>
      </View>
    </View>
  );
}

// web: size-[84px] logo with a 4 px ring outside it; -mt-12 / mx-2.5 panel; px-5.
const LOGO_SIZE = 84;
const LOGO_RING = 4;
const LOGO_RADIUS = 24;
const PANEL_OVERLAP = 48;
const PANEL_INSET = 10;
const PANEL_PADDING = 20;

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  caption: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, minHeight: 24 },
  captionLabel: { color: foregroundSoft },
  // web: rounded-[1.75rem], aspect-[16/10] on a phone — with or without a photo, so nothing moves when it changes.
  cover: {
    aspectRatio: 16 / 10,
    backgroundColor: lavender.lav100,
    borderCurve: 'continuous',
    borderRadius: 28,
    overflow: 'hidden',
  },
  fill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
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
    gap: 14, // web: gap-3.5
    marginHorizontal: PANEL_INSET,
    marginTop: -PANEL_OVERLAP,
    paddingBottom: 24,
    paddingHorizontal: PANEL_PADDING,
    ...nativeShadows.lifted,
  },
  // web: -mt-[42px] size-[84px] rounded-[1.5rem] shadow-raised ring-4 ring-background (the ring outside the 84 pt).
  logo: { marginTop: -(LOGO_SIZE / 2 + LOGO_RING) },
  // The shadow lives outside the clipping frame, or iOS would clip it away.
  logoShadow: {
    backgroundColor: colors.background,
    borderCurve: 'continuous',
    borderRadius: LOGO_RADIUS + LOGO_RING,
    ...nativeShadows.raised,
  },
  logoFrame: {
    alignItems: 'center',
    backgroundColor: lavender.lav050,
    borderColor: colors.background,
    borderCurve: 'continuous',
    borderRadius: LOGO_RADIUS + LOGO_RING,
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
  // web: text-[2.6rem] (41.6 px). The family encodes the weight (400): no
  // fontWeight, as in AppText. The line box is Fraunces' own (1.233em → 52):
  // React Native then centres the glyph in it, and an accented initial (« É »)
  // keeps its accent on iOS.
  monogram: { color: lavender.lav700, fontSize: 42, letterSpacing: 0, lineHeight: 52 },
  // Size, leading, tracking and top inset: `layoutPreviewName`.
  name: { alignSelf: 'stretch', color: colors.foreground, textAlign: 'center' },
  // web: mt-1, a grid of equal columns, gap-2; each action min-h-[66px], rounded-[1.1rem],
  // border-lavender-200, bg-lavender-25, the icon over a 13 px label, lavender-700.
  actions: { alignSelf: 'stretch', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: {
    alignItems: 'center',
    backgroundColor: lavender.lav025,
    borderColor: lavender.lav200,
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    minHeight: 66,
    paddingHorizontal: spacing.sm,
  },
  actionLabel: { color: lavender.lav700, fontSize: 13, lineHeight: 18 },
  // web: mt-6 border-t pt-5, type-body (16 / 1.7), text-foreground/80, aligned to the start — not centred.
  description: {
    alignSelf: 'stretch',
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: foregroundSoft,
    fontSize: 16,
    lineHeight: 27,
    marginTop: 24 - 14,
    paddingTop: spacing.lg,
    textAlign: 'left',
  },
  pressed: { opacity: interaction.pressedOpacity },
});

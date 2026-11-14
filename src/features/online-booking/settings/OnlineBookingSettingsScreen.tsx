// BeautIzzy — Réservation en ligne (Settings)
//
// Plus › Réservation en ligne: the professional prepares her public page
// (web/, /r/<slug>) — images, name, presentation, contact, address of the
// page — and asks for its publication.
//
// The server is authoritative and nothing here goes through the offline
// sync: the screen needs connectivity to load and to save, a failed call
// changes nothing, and no change is ever queued for later. Without a server
// answer the form is not shown at all — only the notice and « Réessayer ».
//
// Editing the draft needs no subscription. Publishing is decided by the
// server alone (operator switch + verified BeautIzzy Plus access): the app's
// own subscription state is never consulted, and a refusal is explained in
// its own words while the stored state stands.

import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BOOKING_ADDRESS_MAX_LENGTH,
  BOOKING_DESCRIPTION_MAX_LENGTH,
  BOOKING_PHONE_MAX_LENGTH,
  BOOKING_PUBLIC_NAME_MAX_LENGTH,
  findBookingProfileIssue,
  normalizeBookingSlugInput,
  suggestBookingSlug,
  type BookingProfileField,
  type BookingProfileFields,
} from '@/domain/online-booking';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { haptics } from '@/shared/lib/haptics';
import { normalizePhoto } from '@/shared/lib/photo-normalization';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { FormScrollView } from '@/shared/ui/FormScrollView';
import { GlassIconButton, glassIcons } from '@/shared/ui/GlassIconButton';
import { GroupedSeparator, GroupedSurface } from '@/shared/ui/GroupedSurface';
import { PhotoSourceFlow } from '@/shared/ui/PhotoSourceFlow';
import { StatePill, statePillTones } from '@/shared/ui/StatePill';
import { SwitchRow } from '@/shared/ui/SwitchRow';
import { TextField } from '@/shared/ui/TextField';
import {
  foregroundSoft,
  gutter,
  interaction,
  radii,
  rose,
  semanticColors,
  spacing,
} from '@/shared/ui/theme';

import {
  OnlineBookingGatewayError,
  type BookingImageKind,
  type BookingProfile,
} from '../gateway';
import {
  describeBookingPublication,
  formFieldOfServerField,
  ONLINE_BOOKING_BOOKINGS_HINT,
  ONLINE_BOOKING_BOOKINGS_LABEL,
  ONLINE_BOOKING_FIELD_ERRORS,
  ONLINE_BOOKING_IMAGE_FAILURE,
  ONLINE_BOOKING_IMAGE_TOO_LARGE,
  ONLINE_BOOKING_NEEDS_SLUG,
  ONLINE_BOOKING_OFFLINE_NOTICE,
  ONLINE_BOOKING_PUBLICATION_UNAVAILABLE,
  ONLINE_BOOKING_PUBLISH_LABEL,
  ONLINE_BOOKING_REQUIRES_PLUS,
  ONLINE_BOOKING_SAVE_BEFORE_PUBLISHING,
  ONLINE_BOOKING_SAVE_FAILURE,
  ONLINE_BOOKING_SAVED,
  ONLINE_BOOKING_SLUG_REQUIRED_WHILE_PUBLISHED,
  ONLINE_BOOKING_SLUG_UNAVAILABLE,
  ONLINE_BOOKING_STATE_FAILURE,
  ONLINE_BOOKING_TITLE,
  type BookingPublicationKind,
} from '../presentation';
import { publicPagePath, readPublicPageUrl } from '../public-page-url';
import { useOnlineBookingGateway } from '../session/OnlineBookingGatewayProvider';

import {
  saveBookingProfile,
  UNCHANGED_BOOKING_IMAGES,
  type BookingImageDrafts,
} from './save-booking-profile';

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;

const IMAGE_PREPARATION = {
  logo: { crop: 'square', maxSide: 512, format: 'jpeg', compress: 0.85 },
  cover: { crop: 'none', maxSide: 1600, format: 'jpeg', compress: 0.8 },
} as const;

const IMAGE_COPY = {
  logo: {
    sheetTitle: 'Logo ou photo de profil',
    cameraHint: 'Cadrez votre logo ou votre portrait.',
    add: 'Ajouter un logo ou une photo de profil',
    edit: 'Modifier le logo ou la photo de profil',
  },
  cover: {
    sheetTitle: 'Photo de couverture',
    cameraHint: 'Cadrez votre salon ou votre espace de travail.',
    add: 'Ajouter une photo de couverture',
    edit: 'Modifier la photo de couverture',
  },
} as const;

const PILL_TONES: Readonly<Record<BookingPublicationKind, (typeof statePillTones)[keyof typeof statePillTones]>> = {
  DRAFT: statePillTones.neutral,
  ONLINE: statePillTones.positive,
  OFFLINE: statePillTones.exception,
};

type Notice = { readonly tone: 'failure' | 'success'; readonly text: string };

function fieldsOf(profile: BookingProfile): BookingProfileFields {
  return {
    slug: profile.slug ?? '',
    publicName: profile.publicName ?? '',
    description: profile.description ?? '',
    publicPhone: profile.publicPhone ?? '',
    publicEmail: profile.publicEmail ?? '',
    address: profile.address ?? '',
  };
}

const FIELD_KEYS: readonly BookingProfileField[] = [
  'slug',
  'publicName',
  'description',
  'publicPhone',
  'publicEmail',
  'address',
];

export function OnlineBookingSettingsScreen() {
  const router = useRouter();
  const gateway = useOnlineBookingGateway();
  const business = useCurrentBusiness();
  /** The last server-confirmed profile; undefined until a read succeeds. */
  const [profile, setProfile] = useState<BookingProfile>();
  const [fields, setFields] = useState<BookingProfileFields>();
  const [images, setImages] = useState<BookingImageDrafts>(UNCHANGED_BOOKING_IMAGES);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [saving, setSaving] = useState(false);
  const [changingState, setChangingState] = useState(false);
  const [preparingImage, setPreparingImage] = useState<BookingImageKind>();
  const [imageSource, setImageSource] = useState<BookingImageKind>();
  const [fieldError, setFieldError] = useState<{ readonly field: BookingProfileField; readonly message: string }>();
  const [notice, setNotice] = useState<Notice>();
  // Synchronous guard: a second tap in the same frame never starts a second write.
  const writing = useRef(false);

  useEffect(() => {
    if (gateway === undefined) return;
    let cancelled = false;
    gateway
      .readProfile(business.id)
      .then((next) => {
        if (cancelled) return;
        setProfile(next);
        setFields(fieldsOf(next));
        setImages(UNCHANGED_BOOKING_IMAGES);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [business.id, gateway, reloadToken]);

  const unavailable = gateway === undefined || loadFailed;
  const retry = () => {
    setLoadFailed(false);
    setReloadToken((token) => token + 1);
  };

  const header = (
    <View style={styles.topBar}>
      <GlassIconButton accessibilityLabel="Retour" icon={glassIcons.back} onPress={() => router.back()} />
      <AppText variant="eyebrow" style={styles.eyebrow}>
        GESTION
      </AppText>
      <View style={styles.topBarSpacer} />
    </View>
  );

  if (gateway === undefined || profile === undefined || fields === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']} testID="online-booking-settings-screen">
        {header}
        <View style={styles.content}>
          <AppText variant="screenTitle" accessibilityRole="header">
            {ONLINE_BOOKING_TITLE}
          </AppText>
          {unavailable ? (
            <View style={styles.offlineNotice} testID="online-booking-offline">
              <AppText variant="metadata" accessibilityLiveRegion="polite" style={styles.soft}>
                {ONLINE_BOOKING_OFFLINE_NOTICE}
              </AppText>
              {gateway !== undefined && (
                <AppButton onPress={retry} testID="online-booking-retry" title="Réessayer" variant="tertiary" />
              )}
            </View>
          ) : (
            <ActivityIndicator
              accessibilityLabel="Chargement de votre page"
              color={semanticColors.accent}
              style={styles.loading}
              testID="online-booking-loading"
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const stored = fieldsOf(profile);
  const dirty =
    FIELD_KEYS.some((key) => fields[key].trim() !== stored[key]) ||
    images.logo.kind !== 'stored' ||
    images.cover.kind !== 'stored';
  const busy = saving || changingState || preparingImage !== undefined;
  const status = describeBookingPublication(profile);
  const pageUrl = profile.slug !== undefined ? readPublicPageUrl(profile.slug) : undefined;

  const change = (field: BookingProfileField, text: string) => {
    setFields({ ...fields, [field]: field === 'slug' ? normalizeBookingSlugInput(text) : text });
    setFieldError(undefined);
    setNotice(undefined);
  };

  const imageUri = (kind: BookingImageKind): string | undefined => {
    const draft = images[kind];
    if (draft.kind === 'picked') return draft.uri;
    if (draft.kind === 'removed') return undefined;
    const path = kind === 'logo' ? profile.logoPath : profile.coverPath;
    return path !== undefined ? gateway.imageUrl(path) : undefined;
  };

  const prepareImage = async (kind: BookingImageKind, uri: string) => {
    setPreparingImage(kind);
    setNotice(undefined);
    try {
      const prepared = await normalizePhoto(uri, IMAGE_PREPARATION[kind]);
      setImages((current) => ({ ...current, [kind]: { kind: 'picked', uri: prepared } }));
    } catch {
      setNotice({ tone: 'failure', text: ONLINE_BOOKING_IMAGE_FAILURE });
    } finally {
      setPreparingImage(undefined);
    }
  };

  const removeImage = (kind: BookingImageKind) => {
    const hasStored = (kind === 'logo' ? profile.logoPath : profile.coverPath) !== undefined;
    setImages((current) => ({ ...current, [kind]: { kind: hasStored ? 'removed' : 'stored' } }));
    setNotice(undefined);
  };

  const save = async () => {
    if (writing.current || !dirty) return;
    const issue = findBookingProfileIssue(fields);
    if (issue !== undefined) {
      setFieldError({ field: issue, message: ONLINE_BOOKING_FIELD_ERRORS[issue] });
      haptics.warning();
      return;
    }
    writing.current = true;
    setSaving(true);
    setNotice(undefined);
    setFieldError(undefined);
    try {
      const result = await saveBookingProfile(gateway, business.id, profile, fields, images);
      if (result.status === 'UPDATED') {
        setProfile(result.profile);
        setFields(fieldsOf(result.profile));
        setImages(UNCHANGED_BOOKING_IMAGES);
        setNotice({ tone: 'success', text: ONLINE_BOOKING_SAVED });
        haptics.success();
        return;
      }
      haptics.warning();
      if (result.status === 'SLUG_UNAVAILABLE') {
        setFieldError({ field: 'slug', message: ONLINE_BOOKING_SLUG_UNAVAILABLE });
      } else if (result.status === 'INVALID_SLUG') {
        setFieldError({
          field: 'slug',
          message:
            fields.slug.trim().length === 0
              ? ONLINE_BOOKING_SLUG_REQUIRED_WHILE_PUBLISHED
              : ONLINE_BOOKING_FIELD_ERRORS.slug,
        });
      } else {
        const field = formFieldOfServerField(result.field);
        if (field !== undefined) setFieldError({ field, message: ONLINE_BOOKING_FIELD_ERRORS[field] });
        else setNotice({ tone: 'failure', text: ONLINE_BOOKING_SAVE_FAILURE });
      }
    } catch (error) {
      setNotice({
        tone: 'failure',
        text:
          error instanceof OnlineBookingGatewayError && error.code === 'IMAGE_TOO_LARGE'
            ? ONLINE_BOOKING_IMAGE_TOO_LARGE
            : error instanceof OnlineBookingGatewayError && error.code === 'IMAGE_INVALID'
              ? ONLINE_BOOKING_IMAGE_FAILURE
              : ONLINE_BOOKING_SAVE_FAILURE,
      });
      haptics.warning();
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };

  const changeState = async (next: { readonly published: boolean; readonly bookingEnabled: boolean }) => {
    if (writing.current) return;
    if (next.published && !profile.published) {
      // Publish what is stored, never an unsaved draft.
      if (dirty) {
        setNotice({ tone: 'failure', text: ONLINE_BOOKING_SAVE_BEFORE_PUBLISHING });
        haptics.warning();
        return;
      }
      if (profile.slug === undefined) {
        setFieldError({ field: 'slug', message: ONLINE_BOOKING_NEEDS_SLUG });
        haptics.warning();
        return;
      }
    }
    writing.current = true;
    setChangingState(true);
    setNotice(undefined);
    try {
      const result = await gateway.setState(business.id, next);
      if (result.status === 'UPDATED') {
        setProfile(result.profile);
        haptics.success();
        return;
      }
      haptics.warning();
      if (result.status === 'INCOMPLETE_PROFILE') {
        setFieldError({ field: 'slug', message: ONLINE_BOOKING_NEEDS_SLUG });
      } else {
        setNotice({
          tone: 'failure',
          text:
            result.status === 'ENTITLEMENT_REQUIRED'
              ? ONLINE_BOOKING_REQUIRES_PLUS
              : ONLINE_BOOKING_PUBLICATION_UNAVAILABLE,
        });
      }
    } catch {
      setNotice({ tone: 'failure', text: ONLINE_BOOKING_STATE_FAILURE });
      haptics.warning();
    } finally {
      writing.current = false;
      setChangingState(false);
    }
  };

  const errorOf = (field: BookingProfileField) =>
    fieldError?.field === field ? fieldError.message : undefined;

  const suggestedSlug = suggestBookingSlug(fields.publicName.trim() || profile.businessName);
  const logoUri = imageUri('logo');
  const coverUri = imageUri('cover');
  const shownName = fields.publicName.trim() || profile.businessName;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} testID="online-booking-settings-screen">
      {header}
      <FormScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="screenTitle" accessibilityRole="header">
          {ONLINE_BOOKING_TITLE}
        </AppText>

        <View style={styles.overview} testID="online-booking-overview">
          <StatePill
            accessibilityLabel={`État de votre page : ${status.label}`}
            colors={PILL_TONES[status.kind]}
            label={status.label}
            testID="online-booking-status"
          />
          <AppText variant="metadata" style={styles.soft}>
            {status.message}
          </AppText>
        </View>

        {/* The page as it will open: cover, logo over its lower edge, public name. */}
        <View style={styles.preview} testID="online-booking-preview">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={coverUri ? IMAGE_COPY.cover.edit : IMAGE_COPY.cover.add}
            disabled={busy}
            onPress={() => setImageSource('cover')}
            style={({ pressed }) => [styles.cover, pressed && styles.pressed]}
            testID="online-booking-cover"
          >
            {coverUri ? (
              <Image accessibilityIgnoresInvertColors contentFit="cover" source={{ uri: coverUri }} style={styles.fill} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <SymbolView name={{ ios: 'photo', android: 'image' }} size={22} tintColor={semanticColors.accent} />
                <AppText variant="metadata" style={styles.soft}>
                  Photo de couverture
                </AppText>
              </View>
            )}
            {preparingImage === 'cover' && <ActivityIndicator color={semanticColors.accent} style={styles.imageBusy} />}
          </Pressable>
          <View style={styles.identity}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={logoUri ? IMAGE_COPY.logo.edit : IMAGE_COPY.logo.add}
              disabled={busy}
              onPress={() => setImageSource('logo')}
              style={({ pressed }) => [styles.logo, pressed && styles.pressed]}
              testID="online-booking-logo"
            >
              {logoUri ? (
                <Image accessibilityIgnoresInvertColors contentFit="cover" source={{ uri: logoUri }} style={styles.fill} />
              ) : (
                <SymbolView name={{ ios: 'camera', android: 'photo_camera' }} size={20} tintColor={semanticColors.accent} />
              )}
              {preparingImage === 'logo' && <ActivityIndicator color={semanticColors.accent} style={styles.imageBusy} />}
            </Pressable>
            <AppText variant="sectionTitle" numberOfLines={2} style={styles.previewName} testID="online-booking-preview-name">
              {shownName}
            </AppText>
          </View>
        </View>

        <View style={styles.fields}>
          <TextField
            accessibilityLabel="Nom affiché sur votre page"
            editable={!busy}
            error={errorOf('publicName')}
            label="Nom public"
            maxLength={BOOKING_PUBLIC_NAME_MAX_LENGTH}
            onChangeText={(text) => change('publicName', text)}
            placeholder={profile.businessName}
            placement="page"
            testID="online-booking-public-name"
            value={fields.publicName}
          />
          <TextField
            accessibilityLabel="Présentation"
            editable={!busy}
            error={errorOf('description')}
            label="Présentation"
            maxLength={BOOKING_DESCRIPTION_MAX_LENGTH}
            multiline
            onChangeText={(text) => change('description', text)}
            placeholder="Présentez votre activité en quelques lignes."
            placement="page"
            testID="online-booking-description"
            value={fields.description}
          />
          <View style={styles.slugField}>
            <TextField
              accessibilityLabel="Adresse de votre page"
              autoCapitalize="none"
              editable={!busy}
              error={errorOf('slug')}
              label="Adresse de votre page"
              onChangeText={(text) => change('slug', text)}
              placeholder={suggestedSlug || 'mon-salon'}
              placement="page"
              testID="online-booking-slug"
              value={fields.slug}
            />
            <AppText variant="metadata" selectable style={styles.soft} testID="online-booking-url">
              {fields.slug.trim().length > 0
                ? (readPublicPageUrl(fields.slug.trim()) ?? publicPagePath(fields.slug.trim()))
                : 'Lettres minuscules, chiffres et tirets.'}
            </AppText>
            {fields.slug.length === 0 && suggestedSlug.length >= 3 && (
              <AppButton
                disabled={busy}
                onPress={() => change('slug', suggestedSlug)}
                testID="online-booking-slug-suggestion"
                title={`Utiliser « ${suggestedSlug} »`}
                variant="tertiary"
              />
            )}
          </View>
          <TextField
            accessibilityLabel="Téléphone affiché sur votre page"
            autoComplete="tel"
            editable={!busy}
            error={errorOf('publicPhone')}
            keyboardType="phone-pad"
            label="Téléphone"
            maxLength={BOOKING_PHONE_MAX_LENGTH}
            onChangeText={(text) => change('publicPhone', text)}
            placeholder="Facultatif"
            placement="page"
            testID="online-booking-phone"
            textContentType="telephoneNumber"
            value={fields.publicPhone}
          />
          <TextField
            accessibilityLabel="E-mail affiché sur votre page"
            autoCapitalize="none"
            autoComplete="email"
            editable={!busy}
            error={errorOf('publicEmail')}
            keyboardType="email-address"
            label="E-mail"
            onChangeText={(text) => change('publicEmail', text)}
            placeholder="Facultatif"
            placement="page"
            testID="online-booking-email"
            textContentType="emailAddress"
            value={fields.publicEmail}
          />
          <TextField
            accessibilityLabel="Adresse postale affichée sur votre page"
            editable={!busy}
            error={errorOf('address')}
            label="Adresse"
            maxLength={BOOKING_ADDRESS_MAX_LENGTH}
            onChangeText={(text) => change('address', text)}
            placeholder="Facultatif"
            placement="page"
            testID="online-booking-address"
            textContentType="fullStreetAddress"
            value={fields.address}
          />
        </View>

        <AppButton
          accessibilityState={{ busy: saving }}
          disabled={!dirty || busy}
          onPress={() => void save()}
          testID="online-booking-save"
          title={saving ? 'Enregistrement…' : 'Enregistrer'}
        />

        {notice !== undefined && (
          <AppText
            variant="metadata"
            accessibilityLiveRegion="polite"
            style={notice.tone === 'failure' ? styles.failure : styles.soft}
            testID="online-booking-notice"
          >
            {notice.text}
          </AppText>
        )}

        <GroupedSurface testID="online-booking-publication">
          <SwitchRow
            disabled={busy}
            label={ONLINE_BOOKING_PUBLISH_LABEL}
            onValueChange={(next) =>
              void changeState({ published: next, bookingEnabled: next && profile.bookingEnabled })
            }
            testID="online-booking-publish"
            value={profile.published}
          />
          <GroupedSeparator inset={spacing.base} />
          <SwitchRow
            description={ONLINE_BOOKING_BOOKINGS_HINT}
            disabled={busy || !profile.published}
            label={ONLINE_BOOKING_BOOKINGS_LABEL}
            onValueChange={(next) => void changeState({ published: true, bookingEnabled: next })}
            testID="online-booking-bookings"
            value={profile.bookingEnabled}
          />
        </GroupedSurface>

        {status.kind === 'ONLINE' && pageUrl !== undefined && (
          <AppButton
            icon={{ ios: 'safari', android: 'open_in_new' }}
            onPress={() => void Linking.openURL(pageUrl).catch(() => {})}
            testID="online-booking-open-page"
            title="Voir ma page"
            variant="secondary"
          />
        )}
      </FormScrollView>

      {(['logo', 'cover'] as const).map((kind) => (
        <PhotoSourceFlow
          cameraHint={IMAGE_COPY[kind].cameraHint}
          cameraTestID={`online-booking-${kind}-camera`}
          cameraTitle={IMAGE_COPY[kind].sheetTitle}
          hasImage={imageUri(kind) !== undefined}
          key={kind}
          onClose={() => setImageSource(undefined)}
          onPickError={() => setNotice({ tone: 'failure', text: ONLINE_BOOKING_IMAGE_FAILURE })}
          onRemove={() => removeImage(kind)}
          onSelected={(uri) => void prepareImage(kind, uri)}
          testID={`online-booking-${kind}-photo`}
          title={IMAGE_COPY[kind].sheetTitle}
          visible={imageSource === kind}
        />
      ))}
    </SafeAreaView>
  );
}

const LOGO_SIZE = 72;

const styles = StyleSheet.create({
  safeArea: { backgroundColor: semanticColors.screenWarm, flex: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: horizontalGutter,
    paddingVertical: spacing.sm,
  },
  eyebrow: { color: foregroundSoft },
  topBarSpacer: { width: 44 },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: horizontalGutter,
    paddingTop: spacing.sm,
  },
  soft: { color: foregroundSoft },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  failure: { color: rose.rose700 },
  loading: { alignSelf: 'flex-start', marginTop: spacing.base },
  offlineNotice: { alignItems: 'flex-start', gap: spacing.xs },
  overview: { alignItems: 'flex-start', gap: spacing.sm },
  preview: { gap: spacing.sm },
  cover: {
    aspectRatio: 16 / 7,
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    overflow: 'hidden',
  },
  fill: { height: '100%', width: '100%' },
  imagePlaceholder: { alignItems: 'center', flex: 1, gap: spacing.xs, justifyContent: 'center' },
  imageBusy: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  identity: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  logo: {
    alignItems: 'center',
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    height: LOGO_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: LOGO_SIZE,
  },
  previewName: { flex: 1 },
  pressed: { opacity: interaction.pressedOpacity },
  fields: { gap: spacing.base },
  slugField: { gap: spacing.xs },
});

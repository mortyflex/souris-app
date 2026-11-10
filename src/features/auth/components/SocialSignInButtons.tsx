// BeautIzzy — « Continuer avec Apple / Google » (sign-in and sign-up)
//
// One group, shared by both account screens, above the email form and closed
// by the « ou continuer avec votre e-mail » separator:
//
//   Apple   the system button (AppleAuthenticationButton): Apple's own
//           artwork, wording and localisation — iOS only, and only when the
//           device offers it. Listed first, as Apple's guidelines ask.
//   Google  white, the official « G », the neutral outline of Google's
//           branding guidelines; the BeautIzzy type, radius and height. It
//           opens the native Google Sign-In (Google's own account chooser).
//
// While an attempt runs both buttons are disabled (the pressed one shows a
// spinner) and the parent disables its email form (`onPendingChange`). A
// closed Google chooser or Apple sheet is NOT a failure: no message, no haptic.
// Every failure is one French sentence (messages.ts), never a provider text.

import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { AppText } from '@/shared/ui/AppText';
import { interaction, radii, rose, semanticColors, spacing, touchTarget } from '@/shared/ui/theme';

import type { SocialProvider, SocialSignInOutcome } from '../gateway';
import { formatAuthFailure } from '../messages';
import { useAuth } from '../session/AuthProvider';

const googleMark = require('../../../../assets/brand/providers/google-g.png') as number;

// Third-party brand colours, imposed by the providers' guidelines — not
// BeautIzzy surfaces, so never theme tokens.
/** Google's branding guidelines: white fill, #747775 outline, #1F1F1F label. */
const GOOGLE_FILL = '#FFFFFF';
const GOOGLE_OUTLINE = '#747775';
const GOOGLE_LABEL = '#1F1F1F';
/** The fill of Apple's BLACK system button, under its spinner. */
const APPLE_FILL = '#000000';
const APPLE_LABEL = '#FFFFFF';
/** Both buttons share it: Apple's minimum is 30 pt; the BeautIzzy touch target is higher. */
const BUTTON_HEIGHT = Math.max(50, touchTarget[Platform.OS === 'android' ? 'android' : 'ios']);

interface SocialSignInButtonsProps {
  /** The email form is submitting: nothing here may start. */
  readonly disabled?: boolean;
  /** True while a Google / Apple attempt runs, so the screen can disable its email form. */
  readonly onPendingChange?: (pending: boolean) => void;
}

/** Resolves once per mount; false until known, so the Apple button never flashes in then out. */
function useAppleSignInAvailable(): boolean {
  const { isAppleSignInAvailable } = useAuth();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let active = true;
    void isAppleSignInAvailable().then((value) => {
      if (active) setAvailable(value);
    });
    return () => {
      active = false;
    };
  }, [isAppleSignInAvailable]);
  return available;
}

export function SocialSignInButtons({ disabled = false, onPendingChange }: SocialSignInButtonsProps) {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const appleAvailable = useAppleSignInAvailable();
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const locked = disabled || pending !== null;

  const start = async (provider: SocialProvider) => {
    if (locked) return;
    setPending(provider);
    setFailure(null);
    onPendingChange?.(true);
    const outcome: SocialSignInOutcome = await (provider === 'google' ? signInWithGoogle() : signInWithApple());
    // On success the root gate replaces this screen; nothing else to do here.
    setPending(null);
    onPendingChange?.(false);
    if (outcome.kind === 'authenticated') {
      haptics.success();
    } else if (outcome.kind === 'failed') {
      haptics.warning();
      setFailure(formatAuthFailure(outcome.failure.code));
    }
  };

  return (
    <View style={styles.group} testID="social-sign-in">
      {appleAvailable && (
        <View
          accessibilityState={{ disabled: locked, busy: pending === 'apple' }}
          pointerEvents={locked ? 'none' : 'auto'}
          style={[styles.appleFrame, locked && pending !== 'apple' && styles.dimmed]}
          testID="continue-with-apple"
        >
          <AppleAuthentication.AppleAuthenticationButton
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            cornerRadius={radii.medium}
            onPress={() => void start('apple')}
            style={styles.appleButton}
          />
          {pending === 'apple' && (
            <View pointerEvents="none" style={styles.appleBusy}>
              <ActivityIndicator accessibilityLabel="Connexion avec Apple en cours" color={APPLE_LABEL} />
            </View>
          )}
        </View>
      )}
      <Pressable
        accessibilityLabel="Continuer avec Google"
        accessibilityRole="button"
        accessibilityState={{ disabled: locked, busy: pending === 'google' }}
        disabled={locked}
        onPress={() => void start('google')}
        style={({ pressed }) => [
          styles.google,
          locked && pending !== 'google' && styles.dimmed,
          pressed && !locked && styles.pressed,
        ]}
        testID="continue-with-google"
      >
        <View style={styles.googleMark}>
          {pending === 'google' ? (
            <ActivityIndicator accessibilityLabel="Connexion avec Google en cours" color={GOOGLE_LABEL} size="small" />
          ) : (
            <Image accessible={false} contentFit="contain" source={googleMark} style={styles.googleMark} />
          )}
        </View>
        <AppText style={styles.googleLabel} variant="control">
          Continuer avec Google
        </AppText>
      </Pressable>
      {failure && (
        <AppText accessibilityLiveRegion="polite" style={styles.failure} testID="social-sign-in-failure" variant="metadata">
          {failure}
        </AppText>
      )}
      <View accessibilityRole="text" accessible style={styles.separator}>
        <View style={styles.rule} />
        <AppText style={styles.separatorLabel} variant="metadata">
          ou continuer avec votre e-mail
        </AppText>
        <View style={styles.rule} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm, paddingBottom: spacing.xs },
  appleFrame: { height: BUTTON_HEIGHT },
  appleButton: { height: BUTTON_HEIGHT, width: '100%' },
  appleBusy: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: APPLE_FILL,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    justifyContent: 'center',
  },
  google: {
    alignItems: 'center',
    backgroundColor: GOOGLE_FILL,
    borderColor: GOOGLE_OUTLINE,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: StyleSheet.hairlineWidth * 2,
    flexDirection: 'row',
    gap: spacing.sm,
    height: BUTTON_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  googleMark: { alignItems: 'center', height: 20, justifyContent: 'center', width: 20 },
  googleLabel: { color: GOOGLE_LABEL },
  pressed: { opacity: 0.85, transform: [{ scale: interaction.pressedScale }] },
  dimmed: { opacity: 0.5 },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  failure: { color: rose.rose700 },
  separator: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  rule: { backgroundColor: semanticColors.borderSubtle, flex: 1, height: StyleSheet.hairlineWidth },
  separatorLabel: { color: semanticColors.foregroundSoft },
});

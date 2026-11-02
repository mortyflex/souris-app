// BeautIzzy — Nouveau mot de passe (the end of the recovery link)
//
// Opened by sourisapp://reset-password. Three moments, one screen:
//
//   verifying   the link's one-time code is exchanged for a recovery session
//               (each code once, only while signed out);
//   failed      the link expired, was already used, belongs to another
//               installation, or could not be checked → ask for a new one;
//   choose      the new password, typed twice. Saving it enters the app like a
//               sign-in; « Annuler » signs this device's recovery session out.
//               Killed before saving, the app never restores that session.
//
// The code is never shown, stored or logged: it is handed to the AuthProvider,
// which only remembers in memory that it was spent. Expo Router may bring this
// screen back with a code already spent (its stack rebuilt from the last opened
// URL, after the account-conflict or loading surfaces), or hand a NEW link to
// an instance still in the stack: each code is judged on its own, a spent one
// is never exchanged again and leads to « Se connecter ». Local data is never
// touched by any of these steps.

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type TextInput } from 'react-native';

import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { OnboardingStepLayout } from '@/shared/ui/OnboardingStepLayout';
import { rose, semanticColors, spacing } from '@/shared/ui/theme';

import { PasswordField } from './components/PasswordField';
import {
  EMPTY_NEW_PASSWORD,
  hasNewPasswordErrors,
  validateNewPassword,
  type NewPasswordFormValues,
} from './form';
import type { AuthFailureCode } from './gateway';
import { formatAuthFailure } from './messages';
import type { RecoveryLink } from './recovery-link';
import { useAuth } from './session/AuthProvider';

interface ResetPasswordScreenProps {
  readonly link: RecoveryLink;
}

export function ResetPasswordScreen({ link }: ResetPasswordScreenProps) {
  const router = useRouter();
  const { state, startPasswordRecovery, isRecoveryCodeUsed, completePasswordRecovery, cancelPasswordRecovery } =
    useAuth();
  // The refusal belongs to the code that was refused: a newer link is judged afresh.
  const [exchangeFailure, setExchangeFailure] = useState<{
    readonly code: string;
    readonly failure: AuthFailureCode;
  } | null>(null);
  const handledCode = useRef<string | null>(null);
  // A link that arrived with an error is never exchanged.
  const linkFailure =
    link.kind === 'failed'
      ? link.failure.code
      : exchangeFailure?.code === link.code
        ? exchangeFailure.failure
        : null;

  // Each code is exchanged once, and only while signed out: a recovery session
  // already open (this screen re-rendering) is never exchanged again, and a
  // code spent earlier in this run (a replayed link) never reaches the network.
  useEffect(() => {
    if (link.kind !== 'code' || state.status !== 'unauthenticated' || handledCode.current === link.code) return;
    const { code } = link;
    handledCode.current = code;
    if (isRecoveryCodeUsed(code)) {
      router.replace('/sign-in');
      return;
    }
    void startPasswordRecovery(code).then((outcome) => {
      if (outcome.kind === 'failed') {
        haptics.warning();
        setExchangeFailure({ code, failure: outcome.failure.code });
      }
    });
  }, [isRecoveryCodeUsed, link, router, startPasswordRecovery, state.status]);

  if (state.status === 'recovering-password') {
    return (
      <ChooseNewPassword
        email={state.user.email}
        onCancel={async () => {
          await cancelPasswordRecovery();
          router.replace('/sign-in');
        }}
        onSave={completePasswordRecovery}
      />
    );
  }

  if (linkFailure !== null) {
    return (
      <OnboardingStepLayout
        brand
        brandSize="large"
        eyebrow="MOT DE PASSE"
        footer={
          <>
            <AppButton
              onPress={() => router.replace('/forgot-password')}
              testID="request-new-link"
              title="Demander un nouveau lien"
            />
            <AppButton onPress={() => router.replace('/sign-in')} title="Retour à la connexion" variant="tertiary" />
          </>
        }
        subtitle={linkFailureMessage(linkFailure)}
        testID="reset-password-link-failed"
        title={linkFailure === 'RECOVERY_LINK_EXPIRED' ? 'Ce lien a expiré' : 'Lien inutilisable'}
      />
    );
  }

  return (
    <OnboardingStepLayout brand brandSize="large" eyebrow="MOT DE PASSE" footer={null} testID="reset-password-verifying" title="Vérification du lien…">
      <View style={styles.verifying}>
        <ActivityIndicator accessibilityLabel="Vérification du lien" color={semanticColors.accent} />
      </View>
    </OnboardingStepLayout>
  );
}

function linkFailureMessage(code: AuthFailureCode): string {
  switch (code) {
    case 'RECOVERY_LINK_EXPIRED':
    case 'RECOVERY_LINK_INVALID':
      return formatAuthFailure(code);
    default:
      // The exchange consumed the link even when the network failed.
      return 'Le lien n’a pas pu être vérifié. Vérifiez votre réseau, puis demandez un nouveau lien.';
  }
}

interface ChooseNewPasswordProps {
  readonly email?: string;
  readonly onSave: ReturnType<typeof useAuth>['completePasswordRecovery'];
  readonly onCancel: () => Promise<void>;
}

function ChooseNewPassword({ email, onSave, onCancel }: ChooseNewPasswordProps) {
  const [values, setValues] = useState<NewPasswordFormValues>(EMPTY_NEW_PASSWORD);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const confirmationRef = useRef<TextInput>(null);

  const errors = attempted ? validateNewPassword(values) : {};

  const submit = async () => {
    if (busy) return;
    setAttempted(true);
    setFailure(null);
    if (hasNewPasswordErrors(validateNewPassword(values))) return;

    setBusy(true);
    const outcome = await onSave(values.password);
    if (outcome.kind === 'updated') {
      // The AuthProvider is now signed in: the root gate takes over.
      haptics.success();
      return;
    }
    setBusy(false);
    haptics.warning();
    setFailure(formatAuthFailure(outcome.failure.code));
  };

  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    await onCancel();
  };

  return (
    <OnboardingStepLayout
      brand
      brandSize="large"
      eyebrow="MOT DE PASSE"
      footer={
        <>
          <AppButton
            disabled={busy}
            onPress={() => void submit()}
            testID="submit-new-password"
            title={busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
          />
          <AppButton disabled={busy} onPress={() => void cancel()} testID="cancel-recovery" title="Annuler" variant="tertiary" />
        </>
      }
      subtitle={
        email
          ? `Choisissez le nouveau mot de passe du compte ${email}.`
          : 'Choisissez le nouveau mot de passe de votre compte.'
      }
      testID="reset-password-screen"
      title="Nouveau mot de passe"
    >
      <PasswordField
        editable={!busy}
        error={errors.password}
        intent="new"
        label="Nouveau mot de passe"
        onChangeText={(password) => setValues((current) => ({ ...current, password }))}
        onSubmitEditing={() => confirmationRef.current?.focus()}
        testID="new-password-input"
        value={values.password}
      />
      <PasswordField
        editable={!busy}
        error={errors.confirmation}
        inputRef={confirmationRef}
        intent="new"
        label="Confirmer le mot de passe"
        onChangeText={(confirmation) => setValues((current) => ({ ...current, confirmation }))}
        onSubmitEditing={() => void submit()}
        testID="confirm-password-input"
        value={values.confirmation}
      />
      {failure && (
        <AppText variant="metadata" style={styles.failure} accessibilityLiveRegion="polite">
          {failure}
        </AppText>
      )}
    </OnboardingStepLayout>
  );
}

const styles = StyleSheet.create({
  verifying: { alignItems: 'center', paddingVertical: spacing.xl },
  // Text on the app background: rose600 falls to ~4.3:1 there.
  failure: { color: rose.rose700, paddingTop: spacing.xs },
});

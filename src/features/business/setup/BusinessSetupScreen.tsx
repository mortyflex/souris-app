// Souris — Business setup (first run after authentication)
//
// Two light steps for NEW businesses only. First the short form: who you
// are, what you do. Then ONE optional question — automatic email reminders
// (« Rappels automatiques », Communications Lot B): activate with a Reply-To
// prefilled from the account email, or « Plus tard ». Either choice creates
// the Business remotely and binds it to this device's data; a creation
// failure keeps the whole draft. « Plus tard » saves NOTHING — the server
// preference simply stays at its OFF default, adjustable later in Plus ›
// Rappels clientes.
//
// Activation is NEVER claimed before the server accepted it: the Business is
// created with `deferEntry`, the preference is saved while this screen is
// still mounted, and only a confirmed save (or an explicit « Continuer sans
// les rappels ») enters the app. A failed activation shows a calm notice —
// the Business exists (never rolled back, never duplicated on retry: the
// gateway reuses an ALREADY_EXISTS Business), the reminders stay OFF, and
// the professional retries or continues without them. Existing businesses
// never see this screen again: onboarding only mounts while no Business
// exists.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  BUSINESS_ACTIVITY_TYPES,
  type BusinessActivityType,
  type BusinessProfile,
} from '@/domain/business';
import { isUsableCommunicationEmail } from '@/domain/communications';
import { AuthScreenLayout } from '@/features/auth/components/AuthScreenLayout';
import { useAuth } from '@/features/auth/session/AuthProvider';
import { useCommunicationsGateway } from '@/features/communications/session/CommunicationsGatewayProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { TextField } from '@/shared/ui/TextField';
import { interaction, radii, rose, semanticColors, spacing } from '@/shared/ui/theme';

import { formatBusinessSessionFailure } from '../messages';
import { formatBusinessActivityType } from '../presentation';
import { useBusinessSession } from '../session/BusinessSessionProvider';
import {
  buildBusinessSetupInput,
  EMPTY_BUSINESS_FORM,
  validateBusinessForm,
  type BusinessFormValues,
} from './business-form';

const ACTIVATION_FAILURE_TITLE = 'Impossible d’activer les rappels pour le moment.';
const ACTIVATION_FAILURE_BODY =
  'Votre activité a bien été créée, mais les rappels restent désactivés.';

export function BusinessSetupScreen() {
  const { createBusiness, enterCreatedBusiness } = useBusinessSession();
  const { state: auth } = useAuth();
  const communications = useCommunicationsGateway();
  const [values, setValues] = useState<BusinessFormValues>(EMPTY_BUSINESS_FORM);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [step, setStep] = useState<'details' | 'reminders'>('details');
  const [replyToDraft, setReplyToDraft] = useState<string>();
  const [replyToError, setReplyToError] = useState<string | null>(null);
  // Set once the Business exists remotely and locally; entry is deferred
  // until the reminder question is settled. Never recreated on retry.
  const [createdBusiness, setCreatedBusiness] = useState<BusinessProfile>();
  const [activationFailed, setActivationFailed] = useState(false);

  const errors = attempted ? validateBusinessForm(values) : {};
  const accountEmail = auth.status === 'authenticated' ? auth.user.email : undefined;
  // Prefilled from the signed-in account, editable before activation.
  const replyToValue = replyToDraft ?? accountEmail ?? '';

  const updateField = <Key extends keyof BusinessFormValues>(key: Key, value: BusinessFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const continueToReminders = () => {
    if (submitting) return;
    setAttempted(true);
    setFailure(null);
    if (Object.keys(validateBusinessForm(values)).length > 0) return;
    setStep('reminders');
  };

  /**
   * Creates and binds the Business ONCE, without entering the app yet.
   * A retry after a failed activation reuses the already-created Business
   * (and the gateway reuses an ALREADY_EXISTS one): never a duplicate.
   */
  const ensureBusinessCreated = async (): Promise<BusinessProfile | undefined> => {
    if (createdBusiness) return createdBusiness;
    const outcome = await createBusiness(buildBusinessSetupInput(values), { deferEntry: true });
    if (outcome.kind === 'created') {
      setCreatedBusiness(outcome.business);
      return outcome.business;
    }
    haptics.warning();
    setFailure(formatBusinessSessionFailure(outcome.failure.code));
    return undefined;
  };

  /** « Plus tard » / « Continuer sans les rappels »: the OFF default stands. */
  const continueWithoutReminders = async () => {
    if (submitting) return;
    setFailure(null);
    setSubmitting(true);
    const business = await ensureBusinessCreated();
    setSubmitting(false);
    if (!business) return;
    haptics.success();
    enterCreatedBusiness(business);
  };

  /**
   * « Activer les rappels »: the app is entered ONLY once the server accepted
   * the preference. A failed save shows the calm activation notice — the
   * Business is kept (reminders simply stay OFF) and the professional
   * retries, or continues without reminders.
   */
  const activateAndOpen = async () => {
    if (submitting) return;
    const replyTo = replyToValue.trim();
    if (!isUsableCommunicationEmail(replyTo)) {
      setReplyToError('Adresse e-mail invalide.');
      haptics.warning();
      return;
    }
    setReplyToError(null);
    setFailure(null);
    setSubmitting(true);
    const business = await ensureBusinessCreated();
    if (!business) {
      setSubmitting(false);
      return;
    }
    try {
      const result = communications
        ? await communications.updatePreferences(business.id, {
            emailRemindersEnabled: true,
            replyToEmail: replyTo,
          })
        : undefined;
      setSubmitting(false);
      if (result?.status === 'UPDATED') {
        setActivationFailed(false);
        haptics.success();
        enterCreatedBusiness(business);
        return;
      }
      if (result?.status === 'INVALID_REPLY_TO') {
        setReplyToError('Adresse e-mail invalide.');
        haptics.warning();
        return;
      }
      // No gateway (unconfigured Supabase): same calm notice as a failure.
      setActivationFailed(true);
      haptics.warning();
    } catch {
      setSubmitting(false);
      setActivationFailed(true);
      haptics.warning();
    }
  };

  if (step === 'reminders') {
    return (
      <AuthScreenLayout
        eyebrow="RAPPELS AUTOMATIQUES"
        footer={
          activationFailed ? (
            <View style={styles.reminderFooter}>
              <AppButton
                disabled={submitting}
                onPress={() => void activateAndOpen()}
                testID="retry-activate-reminders"
                title={submitting ? 'Enregistrement…' : 'Réessayer'}
              />
              <AppButton
                disabled={submitting}
                onPress={() => void continueWithoutReminders()}
                testID="continue-without-reminders"
                title="Continuer sans les rappels"
                variant="tertiary"
              />
            </View>
          ) : (
            <View style={styles.reminderFooter}>
              <AppButton
                disabled={submitting}
                onPress={() => void activateAndOpen()}
                testID="activate-reminders"
                title={submitting ? 'Enregistrement…' : 'Activer les rappels'}
              />
              <AppButton
                disabled={submitting}
                onPress={() => void continueWithoutReminders()}
                testID="skip-reminders"
                title="Plus tard"
                variant="tertiary"
              />
            </View>
          )
        }
        onBack={
          // The details can no longer change once the Business exists.
          createdBusiness || submitting ? undefined : () => setStep('details')
        }
        subtitle="Souris peut envoyer un rappel par e-mail 24 h avant chaque rendez-vous."
        testID="business-reminders-screen"
        title="Rappels automatiques"
      >
        <TextField
          accessibilityLabel="Adresse de réponse"
          autoCapitalize="none"
          autoComplete="email"
          editable={!submitting}
          error={replyToError ?? undefined}
          keyboardType="email-address"
          label="Adresse de réponse"
          onChangeText={(text) => {
            setReplyToDraft(text);
            setReplyToError(null);
          }}
          placeholder="vous@exemple.fr"
          testID="reminder-reply-to-input"
          textContentType="emailAddress"
          value={replyToValue}
        />
        <AppText variant="metadata" style={styles.replyToHint}>
          Les clientes qui répondent à un rappel écrivent à cette adresse. Modifiable à tout
          moment dans les réglages.
        </AppText>
        {activationFailed && (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${ACTIVATION_FAILURE_TITLE} ${ACTIVATION_FAILURE_BODY}`}
            style={styles.activationNotice}
            testID="reminder-activation-failure"
          >
            <AppText variant="control" style={styles.activationNoticeTitle}>
              {ACTIVATION_FAILURE_TITLE}
            </AppText>
            <AppText variant="metadata" style={styles.activationNoticeBody}>
              {ACTIVATION_FAILURE_BODY}
            </AppText>
          </View>
        )}
        {failure && (
          <AppText variant="metadata" style={styles.failure} accessibilityLiveRegion="polite">
            {failure}
          </AppText>
        )}
      </AuthScreenLayout>
    );
  }

  return (
    <AuthScreenLayout
      eyebrow="VOTRE ACTIVITÉ"
      footer={
        <AppButton
          disabled={submitting}
          onPress={continueToReminders}
          testID="submit-business"
          title="Continuer"
        />
      }
      subtitle="Quelques informations pour préparer votre espace."
      testID="business-setup-screen"
      title="Faisons connaissance"
    >
      <TextField
        accessibilityLabel="Votre prénom"
        autoCapitalize="words"
        autoComplete="given-name"
        editable={!submitting}
        error={errors.ownerFirstName}
        label="Votre prénom *"
        onChangeText={(text) => updateField('ownerFirstName', text)}
        placeholder="Prénom"
        testID="owner-first-name-input"
        textContentType="givenName"
        value={values.ownerFirstName}
      />
      <TextField
        accessibilityLabel="Votre nom"
        autoCapitalize="words"
        autoComplete="family-name"
        editable={!submitting}
        label="Votre nom"
        onChangeText={(text) => updateField('ownerLastName', text)}
        placeholder="Optionnel"
        textContentType="familyName"
        value={values.ownerLastName}
      />
      <TextField
        accessibilityLabel="Nom de votre activité"
        autoCapitalize="words"
        autoComplete="organization"
        editable={!submitting}
        error={errors.name}
        label="Nom de votre activité *"
        onChangeText={(text) => updateField('name', text)}
        placeholder="Ex. Studio Léa, Nails by Sofia…"
        testID="business-name-input"
        textContentType="organizationName"
        value={values.name}
      />
      <ActivityPicker
        disabled={submitting}
        error={errors.activityType}
        onSelect={(activityType) => {
          haptics.selection();
          updateField('activityType', activityType);
        }}
        value={values.activityType}
      />
      <TextField
        accessibilityLabel="Téléphone professionnel"
        autoComplete="tel"
        editable={!submitting}
        keyboardType="phone-pad"
        label="Téléphone professionnel"
        onChangeText={(text) => updateField('phone', text)}
        placeholder="Optionnel"
        textContentType="telephoneNumber"
        value={values.phone}
      />
      {failure && (
        <AppText variant="metadata" style={styles.failure} accessibilityLiveRegion="polite">
          {failure}
        </AppText>
      )}
    </AuthScreenLayout>
  );
}

interface ActivityPickerProps {
  readonly value: BusinessActivityType | null;
  readonly onSelect: (activityType: BusinessActivityType) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

function ActivityPicker({ value, onSelect, error, disabled = false }: ActivityPickerProps) {
  return (
    <View style={styles.pickerField}>
      <AppText variant="metadata" style={styles.pickerLabel}>
        Votre activité *
      </AppText>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {BUSINESS_ACTIVITY_TYPES.map((activityType) => {
          const selected = activityType === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected, disabled }}
              disabled={disabled}
              key={activityType}
              onPress={() => onSelect(activityType)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.chipPressed,
              ]}
              testID={`activity-${activityType}`}
            >
              <AppText variant="control" style={selected ? styles.chipTextSelected : styles.chipText}>
                {formatBusinessActivityType(activityType)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {error && (
        <AppText variant="metadata" style={styles.failure}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  reminderFooter: { gap: spacing.sm },
  replyToHint: { color: semanticColors.foregroundSoft },
  // A calm informative notice — never red: the Business was created and
  // nothing was lost; only the optional activation is pending.
  activationNotice: {
    backgroundColor: semanticColors.surfaceLavender,
    borderCurve: 'continuous',
    borderRadius: radii.large,
    gap: spacing.xs,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  activationNoticeTitle: { color: semanticColors.accent },
  activationNoticeBody: { color: semanticColors.foregroundSoft },
  pickerField: { gap: spacing.xs },
  pickerLabel: { color: semanticColors.foregroundSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
  chip: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1.5,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
  },
  chipSelected: {
    backgroundColor: semanticColors.surfaceLavenderStrong,
    borderColor: semanticColors.accent,
  },
  chipPressed: { opacity: interaction.pressedOpacity },
  chipText: { color: semanticColors.foreground },
  chipTextSelected: { color: semanticColors.accent },
  failure: { color: rose.rose600 },
});

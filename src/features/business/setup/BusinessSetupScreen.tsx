// Souris — Business setup (first run after authentication)
//
// One short form: who you are, what you do. Submit creates the Business
// remotely, binds it to this device's data, and only then enters the app.
// A failure keeps the whole draft.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BUSINESS_ACTIVITY_TYPES, type BusinessActivityType } from '@/domain/business';
import { AuthScreenLayout } from '@/features/auth/components/AuthScreenLayout';
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

export function BusinessSetupScreen() {
  const { createBusiness } = useBusinessSession();
  const [values, setValues] = useState<BusinessFormValues>(EMPTY_BUSINESS_FORM);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const errors = attempted ? validateBusinessForm(values) : {};

  const updateField = <Key extends keyof BusinessFormValues>(key: Key, value: BusinessFormValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    if (submitting) return;
    setAttempted(true);
    setFailure(null);
    if (Object.keys(validateBusinessForm(values)).length > 0) return;

    setSubmitting(true);
    const outcome = await createBusiness(buildBusinessSetupInput(values));
    setSubmitting(false);
    if (outcome.kind === 'created') {
      haptics.success();
      return;
    }
    haptics.warning();
    setFailure(formatBusinessSessionFailure(outcome.failure.code));
  };

  return (
    <AuthScreenLayout
      eyebrow="VOTRE ACTIVITÉ"
      footer={
        <AppButton
          disabled={submitting}
          onPress={() => void submit()}
          testID="submit-business"
          title={submitting ? 'Enregistrement…' : 'Ouvrir Souris'}
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

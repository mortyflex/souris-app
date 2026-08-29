// Souris — Client form sheet (create + edit)
//
// The ONE Client form, shared by the Clientes directory, the Appointment
// Creation picker (create mode), and the Client Profile (edit mode).
//
// Prénom required; Nom / Téléphone / Email / Date de naissance optional.
// The birth date field is a normal form row that opens a dedicated, fully
// contained native date-selection presentation (wheel picker inside its own
// modal on iOS, the system date dialog on Android). The canonical stored
// value remains YYYY-MM-DD — confirming updates the form draft only, and
// canceling never mutates anything.

import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';

import { formatCivilDate, formatClientBirthDate, parseCivilDate, type Client } from '@/domain/clients';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { AppText } from '@/shared/ui/AppText';
import { SymbolView } from 'expo-symbols';
import {
  gutter,
  rose,
  semanticColors,
  spacing,
  radii,
} from '@/shared/ui/theme';

import {
  buildClientFromForm,
  EMPTY_CLIENT_FORM,
  isValidClientForm,
  toClientFormValues,
  type ClientFormValues,
} from './client-form';
import { createClientId } from './runtime-ids';

export type ClientFormMode = 'create' | 'edit';

interface ClientFormSheetProps {
  readonly visible: boolean;
  readonly mode: ClientFormMode;
  /** Existing client to hydrate the form (edit mode). */
  readonly client?: Client;
  readonly onClose: () => void;
  readonly onSubmitted: (client: Client) => void;
}

const horizontalGutter = Platform.OS === 'android' ? gutter.android : gutter.ios;
const DEFAULT_PICKER_DATE = new Date(1990, 0, 1);

export function ClientFormSheet({
  visible,
  mode,
  client,
  onClose,
  onSubmitted,
}: ClientFormSheetProps) {
  const { addClient, updateClient } = useClientSession();
  const [values, setValues] = useState<ClientFormValues>(() =>
    mode === 'edit' && client ? toClientFormValues(client) : EMPTY_CLIENT_FORM,
  );
  const [attempted, setAttempted] = useState(false);
  const [birthdayPickerOpen, setBirthdayPickerOpen] = useState(false);
  const [draftBirthDate, setDraftBirthDate] = useState('');

  const seedForm = () => {
    setValues(mode === 'edit' && client ? toClientFormValues(client) : EMPTY_CLIENT_FORM);
    setAttempted(false);
    setBirthdayPickerOpen(false);
  };

  const updateField = (field: keyof ClientFormValues, text: string) => {
    setValues((current) => ({ ...current, [field]: text }));
  };

  const openBirthdayPicker = () => {
    setDraftBirthDate(values.birthDate);
    setBirthdayPickerOpen(true);
  };

  const confirmBirthdayDraft = () => {
    updateField('birthDate', draftBirthDate);
    setBirthdayPickerOpen(false);
  };

  const cancelBirthdayPicker = () => {
    setBirthdayPickerOpen(false);
  };

  const submit = () => {
    setAttempted(true);
    if (!isValidClientForm(values)) return;

    const nextClient =
      mode === 'edit' && client
        ? buildClientFromForm(client.id, values)
        : buildClientFromForm(createClientId(), values);

    if (mode === 'edit' && client) {
      updateClient(nextClient);
    } else {
      addClient(nextClient);
    }
    haptics.success();
    onSubmitted(nextClient);
  };

  const firstNameMissing = attempted && values.firstName.trim().length === 0;
  const emailInvalid = values.email.trim().length > 0 && !isValidClientForm(values);
  const canSubmit = isValidClientForm(values);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      onShow={seedForm}
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel="Fermer la fiche cliente"
          onPress={onClose}
          style={styles.backdrop}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={styles.sheetAnchor}
        >
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <AppText variant="eyebrow" style={styles.eyebrow}>
                  {mode === 'edit' ? 'CLIENTE' : 'NOUVELLE CLIENTE'}
                </AppText>
                <AppText variant="sheetTitle" accessibilityRole="header">
                  {mode === 'edit' ? 'Modifier la cliente' : 'Ajouter une cliente'}
                </AppText>
              </View>
              <AppButton
                accessibilityLabel="Fermer"
                onPress={onClose}
                style={styles.closeButton}
                title="Fermer"
                variant="tertiary"
              />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.fieldsScroll}
            >
              <View style={styles.fields}>
                <FormField
                  accessibilityLabel="Prénom"
                  autoFocus={visible}
                  invalid={firstNameMissing}
                  label="Prénom"
                  onChangeText={(text) => updateField('firstName', text)}
                  placeholder="Prénom"
                  value={values.firstName}
                />
                {firstNameMissing && (
                  <AppText variant="metadata" style={styles.fieldError}>
                    Le prénom est requis.
                  </AppText>
                )}

                <FormField
                  accessibilityLabel="Nom"
                  label="Nom"
                  onChangeText={(text) => updateField('lastName', text)}
                  placeholder="Optionnel"
                  value={values.lastName}
                />
                <FormField
                  accessibilityLabel="Téléphone"
                  keyboardType="phone-pad"
                  label="Téléphone"
                  onChangeText={(text) => updateField('phone', text)}
                  placeholder="Optionnel"
                  value={values.phone}
                />
                <FormField
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  label="Email"
                  onChangeText={(text) => updateField('email', text)}
                  placeholder="Optionnel"
                  value={values.email}
                />
                {emailInvalid && (
                  <AppText variant="metadata" style={styles.fieldError}>
                    Adresse email invalide.
                  </AppText>
                )}

                <BirthDateField
                  value={values.birthDate}
                  onClear={() => updateField('birthDate', '')}
                  onOpen={openBirthdayPicker}
                />
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <AppButton
                disabled={!canSubmit}
                onPress={submit}
                style={styles.primaryButton}
                testID="submit-client"
                title={mode === 'edit' ? 'Enregistrer les modifications' : 'Ajouter la cliente'}
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>

      {Platform.OS === 'android' && birthdayPickerOpen && (
        <DateTimePicker
          accentColor={semanticColors.accent}
          maximumDate={new Date()}
          mode="date"
          onDismiss={cancelBirthdayPicker}
          onValueChange={(_event, date) => {
            updateField('birthDate', formatCivilDate(date));
            setBirthdayPickerOpen(false);
          }}
          presentation="dialog"
          value={parseCivilDate(draftBirthDate) ?? DEFAULT_PICKER_DATE}
        />
      )}

      {Platform.OS === 'ios' && birthdayPickerOpen && (
        <View style={styles.pickerOverlay} testID="birthday-picker">
          <Pressable
            accessibilityLabel="Annuler la sélection de date"
            onPress={cancelBirthdayPicker}
            style={styles.backdrop}
          />
          <SafeAreaView edges={['bottom']} style={styles.pickerSheet}>
            <View style={styles.grabber} />
            <AppText
              variant="sheetTitle"
              accessibilityRole="header"
              style={styles.pickerTitle}
              testID="birthday-picker-title"
            >
              Date de naissance
            </AppText>
            <DateTimePicker
              accentColor={semanticColors.accent}
              display="spinner"
              locale="fr_FR"
              maximumDate={new Date()}
              mode="date"
              onValueChange={(_event, date) => setDraftBirthDate(formatCivilDate(date))}
              value={parseCivilDate(draftBirthDate) ?? DEFAULT_PICKER_DATE}
            />
            <View style={styles.pickerFooter}>
              <AppButton
                onPress={cancelBirthdayPicker}
                style={styles.pickerSecondary}
                title="Annuler"
                variant="secondary"
              />
              <AppButton
                onPress={confirmBirthdayDraft}
                style={styles.pickerPrimary}
                testID="confirm-birth-date"
                title="Confirmer"
              />
            </View>
          </SafeAreaView>
        </View>
      )}
    </Modal>
  );
}

interface BirthDateFieldProps {
  readonly value: string;
  readonly onOpen: () => void;
  readonly onClear: () => void;
}

function BirthDateField({ value, onOpen, onClear }: BirthDateFieldProps) {
  return (
    <View style={styles.field}>
      <AppText variant="metadata" style={styles.fieldLabel}>
        Date de naissance
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choisir la date de naissance"
        onPress={onOpen}
        style={({ pressed }) => [styles.birthdayField, pressed && styles.fieldPressed]}
        testID="birth-date-field"
      >
        <AppText
          variant="body"
          style={value ? styles.birthdayValue : styles.birthdayPlaceholder}
        >
          {value ? formatClientBirthDate(value) : 'Optionnel'}
        </AppText>
        {value ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Effacer la date de naissance"
            hitSlop={spacing.sm}
            onPress={onClear}
            style={({ pressed }) => [styles.clearAction, pressed && styles.clearActionPressed]}
          >
            <AppText variant="metadata" style={styles.clearText}>
              Effacer
            </AppText>
          </Pressable>
        ) : (
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right' }}
            size={14}
            tintColor={semanticColors.foregroundMuted}
          />
        )}
      </Pressable>
    </View>
  );
}

interface FormFieldProps {
  readonly accessibilityLabel: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly invalid?: boolean;
  readonly keyboardType?: 'phone-pad' | 'email-address' | 'default';
  readonly autoCapitalize?: 'none';
  readonly autoFocus?: boolean;
}

function FormField({
  accessibilityLabel,
  label,
  placeholder,
  value,
  onChangeText,
  invalid = false,
  keyboardType = 'default',
  autoCapitalize,
  autoFocus = false,
}: FormFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <AppText variant="metadata" style={styles.fieldLabel}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        autoCorrect={false}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        onBlur={() => setFocused(false)}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        placeholderTextColor={semanticColors.foregroundMuted}
        style={[
          styles.input,
          focused && styles.inputFocused,
          invalid && styles.inputInvalid,
        ]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(25, 22, 63, 0.24)',
  },
  sheetAnchor: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
    maxHeight: '100%',
    paddingHorizontal: horizontalGutter,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: semanticColors.borderSubtle,
    borderRadius: radii.pill,
    height: 5,
    marginTop: spacing.sm,
    width: 40,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    paddingTop: spacing.base,
  },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: semanticColors.accent },
  closeButton: { paddingHorizontal: spacing.md },
  fieldsScroll: { flexShrink: 1 },
  fields: { gap: spacing.md, paddingBottom: spacing.base },
  field: { gap: spacing.xs },
  fieldLabel: { color: semanticColors.foregroundSoft },
  input: {
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1.5,
    color: semanticColors.foreground,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  inputFocused: {
    backgroundColor: semanticColors.surfaceElevated,
    borderColor: semanticColors.accent,
  },
  inputInvalid: {
    backgroundColor: semanticColors.surfaceRose,
    borderColor: rose.rose600,
  },
  fieldError: { color: rose.rose600 },
  birthdayField: {
    alignItems: 'center',
    backgroundColor: semanticColors.surface,
    borderColor: semanticColors.surface,
    borderCurve: 'continuous',
    borderRadius: radii.medium,
    borderWidth: 1.5,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  fieldPressed: {
    backgroundColor: semanticColors.surfaceLavender,
    borderColor: semanticColors.accent,
  },
  birthdayValue: { color: semanticColors.foreground },
  birthdayPlaceholder: { color: semanticColors.foregroundMuted },
  clearAction: {
    alignItems: 'center',
    borderRadius: radii.small,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  clearActionPressed: { backgroundColor: semanticColors.surfaceLavenderStrong },
  clearText: { color: semanticColors.accent },
  footer: {
    borderTopColor: semanticColors.borderSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: spacing.base,
    paddingTop: spacing.md,
  },
  primaryButton: { alignSelf: 'stretch' },
  pickerOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  pickerSheet: {
    backgroundColor: semanticColors.surfaceElevated,
    borderCurve: 'continuous',
    borderTopLeftRadius: radii.ios.sheet,
    borderTopRightRadius: radii.ios.sheet,
    paddingHorizontal: horizontalGutter,
  },
  pickerTitle: {
    color: semanticColors.foreground,
    paddingBottom: spacing.sm,
    paddingTop: spacing.base,
  },
  pickerFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.base,
    paddingTop: spacing.md,
  },
  pickerSecondary: { paddingHorizontal: spacing.base },
  pickerPrimary: { flex: 1 },
});

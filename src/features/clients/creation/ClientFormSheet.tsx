// Souris — Client form sheet (create + edit)
//
// The ONE Client form, shared by the Clientes directory, the Appointment
// Creation picker (create mode), and the Client Profile (edit mode).
//
// Prénom required; Nom / Téléphone / Email / Anniversaire optional. The
// birthday is a day + month chosen inline with the shared selector — no
// year, no keyboard. The sheet is the canonical Souris drawer: it opens in
// its resting position with the keyboard CLOSED (no autofocus), the fields
// scroll under a fixed header, the action bar stays reachable above the
// keyboard, and pan-to-dismiss is off so scrolling the form never abandons
// the draft — closing goes through « Fermer ».

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Client } from '@/domain/clients';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { haptics } from '@/shared/lib/haptics';
import { AppButton } from '@/shared/ui/AppButton';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetHeader } from '@/shared/ui/SheetHeader';
import { TextField } from '@/shared/ui/TextField';
import { spacing } from '@/shared/ui/theme';

import {
  buildClientFromForm,
  EMPTY_CLIENT_FORM,
  isValidClientForm,
  toClientFormValues,
  type ClientFormValues,
} from './client-form';
import { BirthdayField } from './components/BirthdayField';
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

  const seedForm = () => {
    setValues(mode === 'edit' && client ? toClientFormValues(client) : EMPTY_CLIENT_FORM);
    setAttempted(false);
  };

  const updateField = <Key extends keyof ClientFormValues>(
    field: Key,
    value: ClientFormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const submit = () => {
    setAttempted(true);
    if (!isValidClientForm(values)) return;

    const nextClient =
      mode === 'edit' && client
        ? buildClientFromForm(client.id, values)
        : buildClientFromForm(createClientId(), values);

    try {
      if (mode === 'edit' && client) {
        updateClient(nextClient);
      } else {
        addClient(nextClient);
      }
    } catch {
      alertPersistenceFailure();
      return;
    }
    haptics.success();
    onSubmitted(nextClient);
  };

  const firstNameMissing = attempted && values.firstName.trim().length === 0;
  const emailInvalid = values.email.trim().length > 0 && !isValidClientForm(values);
  const canSubmit = isValidClientForm(values);

  return (
    <BottomSheet
      backdropLabel="Fermer la fiche cliente"
      dismissOnPanDown={false}
      footer={
        <SheetActionBar testID="client-form-actions">
          <AppButton
            disabled={!canSubmit}
            onPress={submit}
            testID="submit-client"
            title={mode === 'edit' ? 'Enregistrer les modifications' : 'Ajouter la cliente'}
          />
        </SheetActionBar>
      }
      header={
        <SheetHeader
          action={{ label: 'Fermer', onPress: onClose }}
          eyebrow={mode === 'edit' ? 'CLIENTE' : 'NOUVELLE CLIENTE'}
          title={mode === 'edit' ? 'Modifier la cliente' : 'Ajouter une cliente'}
        />
      }
      keyboardAvoiding
      onClose={onClose}
      onShow={seedForm}
      scrollable
      testID="client-form-sheet"
      visible={visible}
    >
      <View style={styles.fields}>
        <TextField
          accessibilityLabel="Prénom"
          error={firstNameMissing ? 'Le prénom est requis.' : undefined}
          label="Prénom"
          onChangeText={(text) => updateField('firstName', text)}
          placeholder="Prénom"
          value={values.firstName}
        />
        <TextField
          accessibilityLabel="Nom"
          label="Nom"
          onChangeText={(text) => updateField('lastName', text)}
          placeholder="Optionnel"
          value={values.lastName}
        />
        <TextField
          accessibilityLabel="Téléphone"
          keyboardType="phone-pad"
          label="Téléphone"
          onChangeText={(text) => updateField('phone', text)}
          placeholder="Optionnel"
          value={values.phone}
        />
        <TextField
          accessibilityLabel="Email"
          autoCapitalize="none"
          error={emailInvalid ? 'Adresse email invalide.' : undefined}
          keyboardType="email-address"
          label="Email"
          onChangeText={(text) => updateField('email', text)}
          placeholder="Optionnel"
          value={values.email}
        />
        <BirthdayField
          onChange={(birthday) => updateField('birthday', birthday)}
          value={values.birthday}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md, paddingBottom: spacing.base, paddingTop: spacing.xs },
});

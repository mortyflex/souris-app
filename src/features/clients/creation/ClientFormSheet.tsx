// BeautIzzy — Client form sheet (create + edit)
//
// The ONE Client form, shared by the Clientes directory, the Appointment
// Creation picker (create mode), and the Client Profile (edit mode).
//
// Prénom required; Nom / Téléphone / Email / Anniversaire / SMS
// promotionnels / Notes optional. Creation also offers an optional photo
// (ClientPhotoField): the draft is kept as a temporary local file and stored
// only AFTER the Client row is written — Client first, photo second
// (client-photo-storage.ts: upload → commit the path → never before). A
// photo that cannot be stored (offline, no cloud storage, a failed upload)
// never loses the Client: it is added without a photo, the sheet says so
// once, and the Profile control lets the photo be added later. The edit form
// never touches the photo: the Profile owns it (ClientPhotoControl).
// The birthday is a day + month chosen inline with the shared selector — no
// year, no keyboard. Notes is a quiet multiline field at the end of the form. The sheet is the canonical BeautIzzy drawer: it opens in
// its resting position with the keyboard CLOSED (no autofocus), the fields
// scroll under a fixed header, the action bar stays reachable above the
// keyboard, and pan-to-dismiss is off so scrolling the form never abandons
// the draft — closing goes through « Annuler » (the §30 editing header).

import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CLIENT_NOTES_MAX_LENGTH, type Client } from '@/domain/clients';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { discardTemporaryPhoto, saveClientPhoto } from '@/features/clients/photo/client-photo-storage';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useBusinessMediaRemote } from '@/providers/BusinessMediaProvider';
import { alertPersistenceFailure } from '@/providers/persistence-failure';
import { usePersistence } from '@/providers/PersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { createUuidV4 } from '@/shared/lib/uuid';
import { AppButton } from '@/shared/ui/AppButton';
import { BottomSheet } from '@/shared/ui/BottomSheet';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { SheetActionBar } from '@/shared/ui/SheetActionBar';
import { SheetEditingHeader } from '@/shared/ui/SheetEditingHeader';
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
import { ClientPhotoField } from './components/ClientPhotoField';
import { SmsConsentField } from './components/SmsConsentField';
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
  const { addClient, updateClient, setClientPhoto } = useClientSession();
  const { files } = usePersistence();
  const remote = useBusinessMediaRemote();
  const business = useCurrentBusiness();
  const [values, setValues] = useState<ClientFormValues>(() =>
    mode === 'edit' && client ? toClientFormValues(client) : EMPTY_CLIENT_FORM,
  );
  const [attempted, setAttempted] = useState(false);
  // Creation only: the prepared draft photo, a temporary local file until the
  // Client is added. Mirrored in a ref so a close or a save consults the
  // latest draft, never a stale closure.
  const [photoUri, setPhotoUri] = useState<string>();
  const draftPhotoUri = useRef<string>(undefined);
  // The Client row is written; its photo is being stored. The sheet stays
  // open and locked (no second submit, no cancel) until that settles.
  const [savingPhoto, setSavingPhoto] = useState(false);
  // A Client added whose photo could not be stored: reported once, then
  // submitted like any other — without a photo.
  const [addedWithoutPhoto, setAddedWithoutPhoto] = useState<Client>();

  const changePhoto = (next: string | undefined) => {
    draftPhotoUri.current = next;
    setPhotoUri(next);
  };

  const discardDraftPhoto = () => {
    const uri = draftPhotoUri.current;
    if (uri !== undefined) discardTemporaryPhoto(files, uri);
    changePhoto(undefined);
  };

  const seedForm = () => {
    setValues(mode === 'edit' && client ? toClientFormValues(client) : EMPTY_CLIENT_FORM);
    setAttempted(false);
    discardDraftPhoto();
  };

  const close = () => {
    if (savingPhoto) return;
    discardDraftPhoto();
    onClose();
  };

  const updateField = <Key extends keyof ClientFormValues>(
    field: Key,
    value: ClientFormValues[Key],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const finish = (nextClient: Client) => {
    haptics.success();
    onSubmitted(nextClient);
  };

  /**
   * Stores the draft photo of a Client ALREADY added. The shared lifecycle
   * references nothing before the upload succeeded and leaves no object
   * behind a failed commit; the draft file is consumed either way, so the
   * draft is handed over at once — the preview stays until the save settles.
   */
  const storeDraftPhoto = async (addedClient: Client, sourceUri: string) => {
    setSavingPhoto(true);
    draftPhotoUri.current = undefined;
    try {
      const photoPath = await saveClientPhoto(
        { files, remote },
        {
          businessId: business.id,
          clientId: addedClient.id,
          photoId: createUuidV4(),
          sourceUri,
          commit: (path) => setClientPhoto(addedClient.id, path),
        },
      );
      finish({ ...addedClient, photoPath });
    } catch {
      setAddedWithoutPhoto(addedClient);
    } finally {
      setPhotoUri(undefined);
      setSavingPhoto(false);
    }
  };

  const submit = () => {
    if (savingPhoto) return;
    setAttempted(true);
    if (!isValidClientForm(values)) return;

    const nextClient =
      mode === 'edit' && client
        ? buildClientFromForm(client.id, values, client)
        : buildClientFromForm(createClientId(), values);

    try {
      if (mode === 'edit' && client) {
        updateClient(nextClient);
      } else {
        addClient(nextClient);
      }
    } catch (error) {
      // Nothing was written: the draft — photo included — stays for a retry.
      alertPersistenceFailure(error);
      return;
    }

    const sourceUri = draftPhotoUri.current;
    if (mode === 'create' && sourceUri !== undefined) {
      void storeDraftPhoto(nextClient, sourceUri);
      return;
    }
    finish(nextClient);
  };

  const acknowledgePhotoFailure = () => {
    const addedClient = addedWithoutPhoto;
    setAddedWithoutPhoto(undefined);
    if (addedClient) finish(addedClient);
  };

  const firstNameMissing = attempted && values.firstName.trim().length === 0;
  const emailInvalid = values.email.trim().length > 0 && !isValidClientForm(values);
  const canSubmit = isValidClientForm(values) && !savingPhoto;

  return (
    <BottomSheet
      backdropLabel="Fermer la fiche client"
      dismissOnPanDown={false}
      // Glass Sheet Pilot (DESIGN_OVERRIDES.md §40), experimental.
      material="glass"
      footer={
        <SheetActionBar testID="client-form-actions">
          <AppButton
            accessibilityState={{ busy: savingPhoto }}
            disabled={!canSubmit}
            onPress={submit}
            testID="submit-client"
            title={
              mode === 'edit'
                ? 'Enregistrer les modifications'
                : savingPhoto
                  ? 'Ajout du client…'
                  : 'Ajouter le client'
            }
          />
        </SheetActionBar>
      }
      header={
        <SheetEditingHeader
          cancelAccessibilityLabel={mode === 'edit' ? 'Annuler les modifications' : 'Annuler la création'}
          onCancel={close}
          title={mode === 'edit' ? 'Modifier le client' : 'Ajouter un client'}
        />
      }
      keyboardAvoiding
      onClose={close}
      onShow={seedForm}
      scrollable
      testID="client-form-sheet"
      visible={visible}
    >
      <View style={styles.fields}>
        {mode === 'create' && (
          <ClientPhotoField
            client={{ firstName: values.firstName, lastName: values.lastName }}
            disabled={savingPhoto}
            onChangePhotoUri={changePhoto}
            photoUri={photoUri}
          />
        )}
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
        <SmsConsentField
          onChange={(consent) => updateField('smsMarketingConsent', consent)}
          phone={values.phone}
          value={values.smsMarketingConsent}
        />
        <TextField
          accessibilityLabel="Notes"
          label="Notes"
          maxLength={CLIENT_NOTES_MAX_LENGTH}
          multiline
          onChangeText={(text) => updateField('notes', text)}
          placeholder="Allergies, préférences, informations utiles…"
          testID="client-notes-input"
          value={values.notes}
        />
      </View>
      <ConfirmationDialog
        body="Le client a bien été ajouté. Vous pourrez ajouter sa photo depuis sa fiche."
        cancelLabel="Compris"
        onCancel={acknowledgePhotoFailure}
        testID="client-form-photo-save-error"
        title="Impossible d’enregistrer la photo."
        tone="neutral"
        visible={addedWithoutPhoto !== undefined}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md, paddingBottom: spacing.base, paddingTop: spacing.xs },
});

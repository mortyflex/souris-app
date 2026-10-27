// BeautIzzy — Client photo field (« Ajouter un client »)
//
// The optional portrait of a Client being created: the ClientPhotoFrame of
// the Client Profile at 112 pt — more prominent than the 80 pt Profile
// portrait, still a person's square portrait and never a Product-style
// banner — centred above the fields, its initials following the name as it
// is typed. A tap opens the SHARED photo
// source flow (shared/ui/PhotoSourceFlow.tsx — the same sheet, camera
// permission handling and camera as the Profile and Product photos):
//
//   no photo   Prendre une photo · Choisir dans la photothèque · Annuler
//   photo      Prendre une nouvelle photo · Choisir dans la photothèque ·
//              Supprimer la photo · Annuler
//
// A chosen photo is normalized at once (client-photo-processing.ts) and kept
// as a DRAFT: a temporary local file previewed in the frame, replaced or
// removed freely, never uploaded here. The form stores it only once the
// Client is added (ClientFormSheet), so nothing is ever referenced before
// the Client exists. A photo that cannot be prepared leaves the draft as it
// was, with one concise message; the form stays usable without a photo.
// Every replaced or removed draft file is deleted on the spot.

import { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import type { Client } from '@/domain/clients';
import { prepareClientPhoto } from '@/features/clients/photo/client-photo-processing';
import { discardTemporaryPhoto } from '@/features/clients/photo/client-photo-storage';
import { ClientPhotoFrame } from '@/features/clients/photo/ClientPhotoFrame';
import { usePersistence } from '@/providers/PersistenceProvider';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { PhotoSourceFlow } from '@/shared/ui/PhotoSourceFlow';
import { spacing } from '@/shared/ui/theme';

/** The creation portrait: 112 pt (the Profile keeps its 80 pt frame). */
export const CLIENT_PHOTO_FIELD_SIZE = 112;

interface ClientPhotoFieldProps {
  /** The draft identity, for the initials of the empty frame. */
  readonly client: Pick<Client, 'firstName' | 'lastName'>;
  /** The prepared draft photo (a temporary local file), or none. */
  readonly photoUri: string | undefined;
  readonly onChangePhotoUri: (photoUri: string | undefined) => void;
  /** Locks the frame while the form is being saved. */
  readonly disabled?: boolean;
}

export function ClientPhotoField({
  client,
  photoUri,
  onChangePhotoUri,
  disabled = false,
}: ClientPhotoFieldProps) {
  const { files } = usePersistence();
  const [sourceVisible, setSourceVisible] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(false);

  const openSources = () => {
    Keyboard.dismiss();
    setSourceVisible(true);
  };

  const preparePhoto = async (sourceUri: string) => {
    setPreparing(true);
    try {
      const preparedUri = await prepareClientPhoto(sourceUri);
      if (preparedUri !== sourceUri) discardTemporaryPhoto(files, sourceUri);
      if (photoUri !== undefined && photoUri !== preparedUri) discardTemporaryPhoto(files, photoUri);
      onChangePhotoUri(preparedUri);
    } catch {
      discardTemporaryPhoto(files, sourceUri);
      setFailed(true);
    } finally {
      setPreparing(false);
    }
  };

  const removePhoto = () => {
    if (photoUri === undefined) return;
    discardTemporaryPhoto(files, photoUri);
    onChangePhotoUri(undefined);
  };

  const hasPhoto = photoUri !== undefined;

  return (
    <View style={styles.field}>
      <ClientPhotoFrame
        accessibilityHint={hasPhoto ? 'Ouvre les options de la photo' : 'Optionnel'}
        accessibilityLabel={hasPhoto ? 'Photo du client' : 'Ajouter une photo du client'}
        busy={preparing || disabled}
        client={client}
        onPress={openSources}
        photoUri={photoUri}
        size={CLIENT_PHOTO_FIELD_SIZE}
        testID="client-form-photo"
      />

      <PhotoSourceFlow
        cameraHint="Cadrez le visage au centre"
        cameraTestID="client-form-camera"
        cameraTitle="Photo du client"
        hasImage={hasPhoto}
        onClose={() => setSourceVisible(false)}
        onPickError={() => setFailed(true)}
        onRemove={removePhoto}
        onSelected={(uri) => void preparePhoto(uri)}
        testID="client-form-photo"
        title="Photo du client"
        visible={sourceVisible}
      />
      <ConfirmationDialog
        body="La photo n’a pas pu être préparée. Réessayez ou continuez sans photo."
        cancelLabel="Compris"
        onCancel={() => setFailed(false)}
        testID="client-form-photo-error"
        title="Impossible d’ajouter la photo."
        tone="neutral"
        visible={failed}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { alignItems: 'center', paddingBottom: spacing.xs, paddingTop: spacing.sm },
});

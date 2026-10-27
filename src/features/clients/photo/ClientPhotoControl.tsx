// BeautIzzy — Client photo control (Client Profile)
//
// The validated portrait ClientAvatar, made editable in place: the shared
// ClientPhotoFrame (the whole frame is the button, with a small camera badge
// on its bottom-right corner). It opens the SHARED photo source flow
// (shared/ui/PhotoSourceFlow.tsx — the same sheet, camera permission handling
// and camera as Product photos):
//
//   no photo   Prendre une photo · Choisir dans la photothèque · Annuler
//   photo      Prendre une nouvelle photo · Choisir dans la photothèque ·
//              Supprimer la photo · Annuler
//
// A chosen photo is normalized (client-photo-processing.ts), shown at once as
// a preview, uploaded, and only then referenced on the Client
// (client-photo-storage.ts). While that runs the control is busy and ignores
// taps; the rest of the screen stays usable. Any failure keeps the Client —
// and its previous photo — exactly as they were, with one concise message.
// Removal is immediate (another photo can always be added back), so it asks
// for no confirmation.

import { useState } from 'react';

import { getClientDisplayName, type Client } from '@/domain/clients';
import { useBusinessWriteGuard } from '@/features/access/write-guard';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { useClientSession } from '@/features/clients/session/ClientSessionProvider';
import { useBusinessMediaRemote } from '@/providers/BusinessMediaProvider';
import { usePersistence } from '@/providers/PersistenceProvider';
import { haptics } from '@/shared/lib/haptics';
import { createUuidV4 } from '@/shared/lib/uuid';
import { ConfirmationDialog } from '@/shared/ui/ConfirmationDialog';
import { PhotoSourceFlow } from '@/shared/ui/PhotoSourceFlow';

import { prepareClientPhoto } from './client-photo-processing';
import { ClientPhotoFrame } from './ClientPhotoFrame';
import { discardTemporaryPhoto, removeClientPhoto, saveClientPhoto } from './client-photo-storage';
import { useClientPhotoUri } from './use-client-photo-uri';

interface ClientPhotoControlProps {
  readonly client: Client;
  readonly size: number;
}

export function ClientPhotoControl({ client, size }: ClientPhotoControlProps) {
  const { files } = usePersistence();
  const remote = useBusinessMediaRemote();
  const business = useCurrentBusiness();
  const { setClientPhoto } = useClientSession();
  const requireWriteAccess = useBusinessWriteGuard();
  const storedUri = useClientPhotoUri(client.photoPath);
  const [sourceVisible, setSourceVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const displayName = getClientDisplayName(client);
  const hasPhoto = client.photoPath !== undefined || previewUri !== undefined;
  const storage = { files, remote };

  const savePhoto = async (sourceUri: string) => {
    setBusy(true);
    try {
      // The row write (`setClientPhoto`) holds the guard too; judged here
      // FIRST so a refused save never prepares nor uploads a photo. Removal
      // needs no pre-check: its commit runs before anything is discarded.
      requireWriteAccess('clients.setClientPhoto');
      const preparedUri = await prepareClientPhoto(sourceUri);
      if (preparedUri !== sourceUri) discardTemporaryPhoto(files, sourceUri);
      setPreviewUri(preparedUri);
      await saveClientPhoto(storage, {
        businessId: business.id,
        clientId: client.id,
        photoId: createUuidV4(),
        sourceUri: preparedUri,
        previousPhotoPath: client.photoPath,
        commit: (photoPath) => setClientPhoto(client.id, photoPath),
      });
      haptics.success();
    } catch {
      discardTemporaryPhoto(files, sourceUri);
      setFailed(true);
    } finally {
      setPreviewUri(undefined);
      setBusy(false);
    }
  };

  const removePhoto = () => {
    const photoPath = client.photoPath;
    if (photoPath === undefined) return;
    try {
      removeClientPhoto(storage, {
        photoPath,
        commit: () => setClientPhoto(client.id, undefined),
      });
    } catch {
      setFailed(true);
    }
  };

  return (
    <>
      <ClientPhotoFrame
        accessibilityHint={hasPhoto ? 'Ouvre les options de la photo' : undefined}
        accessibilityLabel={hasPhoto ? `Photo de ${displayName}` : `Ajouter une photo pour ${displayName}`}
        busy={busy}
        client={client}
        onPress={() => setSourceVisible(true)}
        photoUri={previewUri ?? storedUri}
        size={size}
        testID="client-photo"
      />

      <PhotoSourceFlow
        cameraHint="Cadrez le visage au centre"
        cameraTestID="client-camera"
        cameraTitle="Photo du client"
        hasImage={client.photoPath !== undefined}
        onClose={() => setSourceVisible(false)}
        onPickError={() => setFailed(true)}
        onRemove={removePhoto}
        onSelected={(uri) => void savePhoto(uri)}
        testID="client-photo"
        title={displayName}
        visible={sourceVisible}
      />
      <ConfirmationDialog
        body="Vérifiez votre connexion, puis réessayez."
        cancelLabel="Compris"
        onCancel={() => setFailed(false)}
        testID="client-photo-error"
        title="Impossible d’enregistrer la photo."
        tone="neutral"
        visible={failed}
      />
    </>
  );
}

// BeautIzzy — photo source flow
//
// The ONE photo-selection workflow shared by Product photos and Client
// photos: source sheet → (camera permission) → camera, library, or removal.
// It returns a local file URI through `onSelected` and never touches business
// state; what happens to the photo belongs to the caller.
//
//   « Prendre une photo »
//     → ensureCameraAccess() — right now, on this tap, the sheet still up:
//         granted already         no prompt
//         can ask                 the system prompt appears immediately
//     → granted  → the sheet slides down → (dismissed) → camera
//     → denied   → the sheet slides down, nothing else (nothing changed)
//     → blocked  → the sheet slides down → « Accès à l’appareil photo »
//                  (Ouvrir les réglages / Annuler)
//
//   « Choisir dans Photos » → the system picker over the sheet → the sheet
//     closes → `onSelected(uri)`, or nothing when cancelled
//
//   « Supprimer la photo » → the sheet closes → `onRemove()`
//
// One modal at a time, never stacked: the camera and the Settings explanation
// are presented only from the sheet's `onDismissed`. Nothing asks for a
// permission on mount or when the sheet opens. Repeated taps while a
// permission check or the picker is in flight are ignored.

import { useRef, useState } from 'react';

import {
  ensureCameraAccess,
  openAppSettings,
  pickPhotoFromLibrary,
} from '@/shared/lib/photo-acquisition';

import { ConfirmationDialog } from './ConfirmationDialog';
import { PhotoCameraModal } from './PhotoCameraModal';
import { PhotoSourceSheet } from './PhotoSourceSheet';

interface PhotoSourceFlowProps {
  /** The source sheet is requested (the caller's tap on its photo). */
  readonly visible: boolean;
  /** Closes the source sheet: cancelled, or a choice was made. */
  readonly onClose: () => void;
  readonly hasImage: boolean;
  /** Source sheet title, e.g. « Photo du produit ». */
  readonly title: string;
  readonly libraryLabel: string;
  readonly cameraTitle: string;
  readonly cameraHint: string;
  /** A captured or picked photo, as a local file URI. */
  readonly onSelected: (uri: string) => void;
  readonly onRemove: () => void;
  /** The system picker failed (never called for a cancellation). */
  readonly onPickError: () => void;
  /** Prefix of the sheet testIDs (`<prefix>-sheet`, `<prefix>-source-camera`, …). */
  readonly testID: string;
  readonly cameraTestID: string;
}

type AfterSheet = 'camera' | 'camera-blocked' | undefined;

export function PhotoSourceFlow({
  visible,
  onClose,
  hasImage,
  title,
  libraryLabel,
  cameraTitle,
  cameraHint,
  onSelected,
  onRemove,
  onPickError,
  testID,
  cameraTestID,
}: PhotoSourceFlowProps) {
  const [cameraVisible, setCameraVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const afterSheet = useRef<AfterSheet>(undefined);
  const working = useRef(false);

  const chooseCamera = async () => {
    if (working.current) return;
    working.current = true;
    const access = await ensureCameraAccess();
    working.current = false;
    afterSheet.current =
      access === 'granted' ? 'camera' : access === 'blocked' ? 'camera-blocked' : undefined;
    onClose();
  };

  const chooseLibrary = async () => {
    if (working.current) return;
    working.current = true;
    const result = await pickPhotoFromLibrary();
    working.current = false;
    onClose();
    if (result.status === 'selected') onSelected(result.uri);
    else if (result.status === 'error') onPickError();
  };

  const remove = () => {
    if (working.current) return;
    onClose();
    onRemove();
  };

  const handleSheetDismissed = () => {
    const next = afterSheet.current;
    afterSheet.current = undefined;
    if (next === 'camera') setCameraVisible(true);
    else if (next === 'camera-blocked') setSettingsVisible(true);
  };

  const handleCaptured = (uri: string) => {
    setCameraVisible(false);
    onSelected(uri);
  };

  return (
    <>
      <PhotoSourceSheet
        hasImage={hasImage}
        libraryLabel={libraryLabel}
        onChooseCamera={() => void chooseCamera()}
        onChooseLibrary={() => void chooseLibrary()}
        onClose={onClose}
        onDismissed={handleSheetDismissed}
        onRemove={remove}
        testID={testID}
        title={title}
        visible={visible}
      />
      <PhotoCameraModal
        hint={cameraHint}
        onCaptured={handleCaptured}
        onClose={() => setCameraVisible(false)}
        testID={cameraTestID}
        title={cameraTitle}
        visible={cameraVisible}
      />
      <ConfirmationDialog
        body="Autorisez BeautIzzy à utiliser l’appareil photo dans les réglages pour pouvoir prendre une photo."
        cancelLabel="Annuler"
        confirmLabel="Ouvrir les réglages"
        onCancel={() => setSettingsVisible(false)}
        onConfirm={() => {
          setSettingsVisible(false);
          openAppSettings();
        }}
        testID="camera-access-dialog"
        title="Accès à l’appareil photo"
        tone="neutral"
        visible={settingsVisible}
      />
    </>
  );
}

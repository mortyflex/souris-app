// Souris — photo acquisition (camera permission + photo library)
//
// The ONE permission and media-selection boundary shared by every photo in
// Souris (Product photos, Client photos). It never touches business state:
// it answers whether the camera may open, or returns a local file URI.
//
// Camera permission is resolved on the professional's explicit tap on
// « Prendre une photo », BEFORE any camera surface is presented:
//
//   granted already                → 'granted' (no prompt, the camera opens at once)
//   undetermined / can ask again   → the system prompt NOW → 'granted' | 'denied'
//   denied and cannot ask again    → 'blocked' (only the Settings app can change it)
//
// Nothing here is called on mount, at startup, or when a photo menu opens.
//
// The photo library goes through the system picker (PHPicker on iOS 14+,
// the Android Photo Picker), which needs no library permission: Souris never
// asks for broader photo access.

import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Linking } from 'react-native';

export type CameraAccess = 'granted' | 'denied' | 'blocked';

export type PhotoPickResult =
  | { readonly status: 'selected'; readonly uri: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'error' };

/**
 * Checks the camera permission and, when the system can still ask, shows its
 * prompt immediately. Call it only from the explicit « Prendre une photo » tap.
 */
export async function ensureCameraAccess(): Promise<CameraAccess> {
  try {
    const current = await Camera.getCameraPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'blocked';

    const requested = await Camera.requestCameraPermissionsAsync();
    if (requested.granted) return 'granted';
    return requested.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'denied';
  }
}

const libraryOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  allowsMultipleSelection: false,
  mediaTypes: ['images'],
  quality: 0.85,
  selectionLimit: 1,
};

/** Opens the system photo picker (images only, one photo). */
export async function pickPhotoFromLibrary(): Promise<PhotoPickResult> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync(libraryOptions);
    if (result.canceled) return { status: 'cancelled' };

    const uri = result.assets[0]?.uri;
    return uri ? { status: 'selected', uri } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

/** Opens Souris in the Settings app, where a blocked permission can be granted. */
export function openAppSettings(): void {
  void Linking.openSettings().catch(() => {});
}

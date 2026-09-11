import * as ImagePicker from 'expo-image-picker';

export type ProductPhotoAcquisitionResult =
  | { readonly status: 'selected'; readonly uri: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'permission-denied'; readonly canAskAgain: boolean }
  | { readonly status: 'error' };

const pickerOptions: ImagePicker.ImagePickerOptions = {
  allowsEditing: false,
  allowsMultipleSelection: false,
  mediaTypes: ['images'],
  quality: 0.85,
  selectionLimit: 1,
};

/**
 * Focused photo-library acquisition boundary. It returns a local file URI and
 * never mutates Product state; the Product form decides whether and when to
 * save it. Camera capture lives in the Product photo sheet (expo-camera).
 */
export async function pickProductPhotoFromLibrary(): Promise<ProductPhotoAcquisitionResult> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return { status: 'permission-denied', canAskAgain: permission.canAskAgain };
    }

    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
    if (result.canceled) return { status: 'cancelled' };

    const uri = result.assets[0]?.uri;
    return uri ? { status: 'selected', uri } : { status: 'error' };
  } catch {
    return { status: 'error' };
  }
}

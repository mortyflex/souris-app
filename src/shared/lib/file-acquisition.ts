// BeautIzzy — file acquisition (system document picker)
//
// The ONE boundary through which BeautIzzy reads a file the professional
// chooses: the system picker (the Files app on iOS, the Storage Access
// Framework on Android), which needs no permission. It never touches
// business state and keeps nothing: it returns the bytes of the chosen file,
// in memory, and that is all. Nothing is logged, copied or uploaded.
//
// Opened only on an explicit tap. On iOS the picker hands over a temporary
// copy inside the app sandbox, removed as soon as it is read; on Android the
// URI is the professional's own document and is never modified.

import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export type FilePickResult =
  | { readonly status: 'selected'; readonly name: string; readonly bytes: Uint8Array }
  | { readonly status: 'cancelled' }
  | { readonly status: 'too-large' }
  | { readonly status: 'error' };

export interface FilePickOptions {
  /** MIME types the picker offers. */
  readonly mimeTypes: readonly string[];
  /** A larger file is refused before it is read. */
  readonly maxBytes: number;
}

/** Opens the system file picker (one file) and reads the chosen file into memory. */
export async function pickFileBytes({ mimeTypes, maxBytes }: FilePickOptions): Promise<FilePickResult> {
  let file: File;
  try {
    const picked = await File.pickFileAsync({ mimeTypes: [...mimeTypes] });
    if (picked.canceled) return { status: 'cancelled' };
    file = picked.result;
  } catch {
    return { status: 'error' };
  }

  try {
    const size = file.size;
    if (typeof size === 'number' && size > maxBytes) return { status: 'too-large' };
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > maxBytes) return { status: 'too-large' };
    return { status: 'selected', name: file.name, bytes };
  } catch {
    return { status: 'error' };
  } finally {
    if (Platform.OS === 'ios') {
      try {
        file.delete();
      } catch {
        // The system clears its temporary copies anyway.
      }
    }
  }
}

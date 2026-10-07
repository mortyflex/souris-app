// BeautIzzy — expo-file-system binding of PhotoFileIO
//
// Application-root only (infrastructure/supabase/index.ts). Tests never import it.

import { File } from 'expo-file-system';

import type { PhotoFileIO } from './business-media-gateway';

export const expoPhotoFileIO: PhotoFileIO = {
  read: (fileUri) => new File(fileUri).arrayBuffer(),
  download: async (url, destinationUri) => {
    await File.downloadFileAsync(url, new File(destinationUri));
  },
};

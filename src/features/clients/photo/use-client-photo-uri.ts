// Souris — displayable URI of a stored Client photo
//
// Resolves the stable `photoPath` into a local file at presentation time
// (the shared Business media cache): undefined while unavailable —
// ClientAvatar shows the initials.

import { useBusinessMediaUri } from '@/providers/BusinessMediaProvider';

import { CLIENT_PHOTO_CACHE_DIRECTORY } from './client-photo-storage';

export function useClientPhotoUri(photoPath: string | undefined): string | undefined {
  return useBusinessMediaUri(photoPath, CLIENT_PHOTO_CACHE_DIRECTORY);
}

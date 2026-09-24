// Souris — Business media storage, provided from the application root
//
// The root layout binds it to Supabase Storage (infrastructure/supabase);
// tests provide an in-memory fake. Absent (Supabase not configured, or no
// provider) → undefined: photos already cached still show, nothing new can
// be saved and the screens say so. Client photos and Product photos both
// read it (persistence/media/business-media.ts).

import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import {
  readCachedMediaUri,
  resolveBusinessMediaUri,
  type BusinessMediaRemote,
} from '@/persistence/media/business-media';

import { usePersistence } from './PersistenceProvider';

const BusinessMediaContext = createContext<BusinessMediaRemote | undefined>(undefined);

export function BusinessMediaProvider({
  remote,
  children,
}: PropsWithChildren<{ readonly remote: BusinessMediaRemote | undefined }>) {
  return <BusinessMediaContext.Provider value={remote}>{children}</BusinessMediaContext.Provider>;
}

export function useBusinessMediaRemote(): BusinessMediaRemote | undefined {
  return useContext(BusinessMediaContext);
}

/**
 * Resolves a stable object path into a displayable local file at
 * presentation time: the device's cached copy at once (synchronously, so a
 * just-saved or already seen photo never flashes the fallback), otherwise one
 * download, then the cached copy. Undefined while unavailable.
 */
export function useBusinessMediaUri(
  objectPath: string | undefined,
  cacheDirectory: string,
): string | undefined {
  const { files } = usePersistence();
  const remote = useBusinessMediaRemote();
  const [downloaded, setDownloaded] = useState<{ readonly path: string; readonly uri: string }>();

  const cached =
    objectPath === undefined ? undefined : readCachedMediaUri(files, cacheDirectory, objectPath);

  useEffect(() => {
    if (objectPath === undefined || cached !== undefined) return;
    let active = true;
    void resolveBusinessMediaUri({ files, remote }, cacheDirectory, objectPath).then((uri) => {
      if (active && uri !== undefined) setDownloaded({ path: objectPath, uri });
    });
    return () => {
      active = false;
    };
  }, [objectPath, cached, cacheDirectory, files, remote]);

  if (objectPath === undefined) return undefined;
  return cached ?? (downloaded?.path === objectPath ? downloaded.uri : undefined);
}

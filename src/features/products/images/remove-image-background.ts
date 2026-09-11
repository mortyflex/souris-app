import { requireOptionalNativeModule } from 'expo';

interface ProductImageBackgroundModule {
  readonly isSupported: () => boolean;
  readonly removeBackgroundAsync: (sourceUri: string) => Promise<string>;
}

const nativeModule = requireOptionalNativeModule<ProductImageBackgroundModule>(
  'ProductImageBackground',
);
const PROCESSING_TIMEOUT_MS = 8_000;

/**
 * Uses Apple Vision when the optional iOS 17+ module is available. Unsupported
 * platforms and processing failures keep the original photo intact.
 */
export async function removeImageBackground(sourceUri: string): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (!nativeModule?.isSupported()) return sourceUri;
    const processedUri = await Promise.race([
      nativeModule.removeBackgroundAsync(sourceUri),
      new Promise<string>((resolve) => {
        timeout = setTimeout(() => resolve(sourceUri), PROCESSING_TIMEOUT_MS);
      }),
    ]);
    return processedUri.trim().length > 0 ? processedUri : sourceUri;
  } catch {
    return sourceUri;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

import type { View } from 'react-native';

import { PhotosPermissionError, saveViewToPhotos, shareViewAsImage } from '../share-image';

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(), releaseCapture: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-media-library', () => ({ requestPermissionsAsync: jest.fn(), Asset: { create: jest.fn() } }));

const viewShot = jest.requireMock('react-native-view-shot') as {
  readonly captureRef: jest.Mock;
  readonly releaseCapture: jest.Mock;
};
const sharing = jest.requireMock('expo-sharing') as {
  readonly isAvailableAsync: jest.Mock;
  readonly shareAsync: jest.Mock;
};

const mediaLibrary = jest.requireMock('expo-media-library') as {
  readonly requestPermissionsAsync: jest.Mock;
  readonly Asset: { readonly create: jest.Mock };
};

const SIZE = { width: 1080, height: 1920 };
const mounted = { current: {} as View };

describe('shareViewAsImage', () => {
  beforeEach(() => {
    viewShot.captureRef.mockReset().mockResolvedValue('/tmp/ReactNative/card.png');
    viewShot.releaseCapture.mockReset();
    sharing.isAvailableAsync.mockReset().mockResolvedValue(true);
    sharing.shareAsync.mockReset().mockResolvedValue(undefined);
    mediaLibrary.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true, status: 'granted' });
    mediaLibrary.Asset.create.mockReset().mockResolvedValue({ id: 'asset-1' });
  });

  it('captures the view as a temporary PNG and hands that file to the native share sheet', async () => {
    await shareViewAsImage(mounted, SIZE, 'Partager');

    expect(viewShot.captureRef).toHaveBeenCalledWith(
      mounted,
      expect.objectContaining({ format: 'png', result: 'tmpfile' }),
    );
    expect(sharing.shareAsync).toHaveBeenCalledWith('file:///tmp/ReactNative/card.png', {
      dialogTitle: 'Partager',
      mimeType: 'image/png',
      UTI: 'public.png',
    });
    expect(viewShot.releaseCapture).toHaveBeenCalledWith('/tmp/ReactNative/card.png');
  });

  it('keeps an already-URL result as is', async () => {
    viewShot.captureRef.mockResolvedValue('file:///data/cache/card.png');
    await shareViewAsImage(mounted, SIZE, 'Partager');
    expect(sharing.shareAsync.mock.calls[0]?.[0]).toBe('file:///data/cache/card.png');
  });

  it('releases the temporary image even when the share sheet fails', async () => {
    sharing.shareAsync.mockRejectedValue(new Error('share failed'));
    await expect(shareViewAsImage(mounted, SIZE, 'Partager')).rejects.toThrow('share failed');
    expect(viewShot.releaseCapture).toHaveBeenCalledWith('/tmp/ReactNative/card.png');
  });

  it('fails before capturing when sharing is unavailable or nothing is mounted', async () => {
    sharing.isAvailableAsync.mockResolvedValue(false);
    await expect(shareViewAsImage(mounted, SIZE, 'Partager')).rejects.toThrow();
    await expect(shareViewAsImage({ current: null }, SIZE, 'Partager')).rejects.toThrow();
    expect(viewShot.captureRef).not.toHaveBeenCalled();
  });
});

describe('saveViewToPhotos', () => {
  beforeEach(() => {
    viewShot.captureRef.mockReset().mockResolvedValue('/tmp/ReactNative/card.png');
    viewShot.releaseCapture.mockReset();
    mediaLibrary.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true, status: 'granted' });
    mediaLibrary.Asset.create.mockReset().mockResolvedValue({ id: 'asset-1' });
  });

  it('asks only to ADD images, then puts the captured PNG in Photos and releases it', async () => {
    await saveViewToPhotos(mounted, SIZE);

    expect(mediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, ['photo']);
    expect(viewShot.captureRef).toHaveBeenCalledWith(
      mounted,
      expect.objectContaining({ format: 'png', result: 'tmpfile' }),
    );
    expect(mediaLibrary.Asset.create).toHaveBeenCalledWith('file:///tmp/ReactNative/card.png');
    expect(viewShot.releaseCapture).toHaveBeenCalledWith('/tmp/ReactNative/card.png');
  });

  it('captures nothing when the permission is declined', async () => {
    mediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    await expect(saveViewToPhotos(mounted, SIZE)).rejects.toBeInstanceOf(PhotosPermissionError);
    expect(viewShot.captureRef).not.toHaveBeenCalled();
    expect(mediaLibrary.Asset.create).not.toHaveBeenCalled();
  });

  it('fails, and still releases the temporary image, when Photos refuses the file', async () => {
    mediaLibrary.Asset.create.mockRejectedValue(new Error('library failed'));
    await expect(saveViewToPhotos(mounted, SIZE)).rejects.toThrow('library failed');
    expect(viewShot.releaseCapture).toHaveBeenCalledWith('/tmp/ReactNative/card.png');
  });
});

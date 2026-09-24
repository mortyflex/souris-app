import { Linking } from 'react-native';

import { ensureCameraAccess, openAppSettings, pickPhotoFromLibrary } from '../photo-acquisition';

jest.mock('expo-camera', () => ({
  Camera: {
    getCameraPermissionsAsync: jest.fn(),
    requestCameraPermissionsAsync: jest.fn(),
  },
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const cameraModule = jest.requireMock('expo-camera') as {
  Camera: { getCameraPermissionsAsync: jest.Mock; requestCameraPermissionsAsync: jest.Mock };
};
const mockGetCameraPermissions = cameraModule.Camera.getCameraPermissionsAsync;
const mockRequestCameraPermissions = cameraModule.Camera.requestCameraPermissionsAsync;
const pickerModule = jest.requireMock('expo-image-picker') as {
  requestMediaLibraryPermissionsAsync: jest.Mock;
  launchImageLibraryAsync: jest.Mock;
};
const mockRequestMediaLibraryPermissions = pickerModule.requestMediaLibraryPermissionsAsync;
const mockLaunchImageLibrary = pickerModule.launchImageLibraryAsync;

describe('ensureCameraAccess', () => {
  beforeEach(() => {
    mockGetCameraPermissions.mockReset();
    mockRequestCameraPermissions.mockReset();
  });

  it('opens directly when the camera is already granted: no prompt', async () => {
    mockGetCameraPermissions.mockResolvedValue({ granted: true, canAskAgain: true });

    await expect(ensureCameraAccess()).resolves.toBe('granted');
    expect(mockRequestCameraPermissions).not.toHaveBeenCalled();
  });

  it('shows the system prompt immediately when it can still ask', async () => {
    mockGetCameraPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestCameraPermissions.mockResolvedValue({ granted: true, canAskAgain: true });

    await expect(ensureCameraAccess()).resolves.toBe('granted');
    expect(mockRequestCameraPermissions).toHaveBeenCalledTimes(1);
  });

  it('reports a refusal the system may ask again as denied', async () => {
    mockGetCameraPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestCameraPermissions.mockResolvedValue({ granted: false, canAskAgain: true });

    await expect(ensureCameraAccess()).resolves.toBe('denied');
  });

  it('reports a refusal the system will not ask again as blocked', async () => {
    mockGetCameraPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestCameraPermissions.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(ensureCameraAccess()).resolves.toBe('blocked');
  });

  it('never re-triggers a prompt that can no longer appear', async () => {
    mockGetCameraPermissions.mockResolvedValue({ granted: false, canAskAgain: false });

    await expect(ensureCameraAccess()).resolves.toBe('blocked');
    expect(mockRequestCameraPermissions).not.toHaveBeenCalled();
  });

  it('treats a permission API failure as a quiet denial', async () => {
    mockGetCameraPermissions.mockRejectedValue(new Error('unavailable'));

    await expect(ensureCameraAccess()).resolves.toBe('denied');
  });
});

describe('pickPhotoFromLibrary', () => {
  beforeEach(() => {
    mockRequestMediaLibraryPermissions.mockReset();
    mockLaunchImageLibrary.mockReset();
  });

  it('opens the system picker (images only, one photo) without asking for library access', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///library/photo.jpg' }],
    });

    await expect(pickPhotoFromLibrary()).resolves.toEqual({
      status: 'selected',
      uri: 'file:///library/photo.jpg',
    });
    expect(mockRequestMediaLibraryPermissions).not.toHaveBeenCalled();
    expect(mockLaunchImageLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsEditing: false,
        allowsMultipleSelection: false,
        mediaTypes: ['images'],
        selectionLimit: 1,
      }),
    );
  });

  it('treats cancellation quietly', async () => {
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickPhotoFromLibrary()).resolves.toEqual({ status: 'cancelled' });
  });

  it('returns picker failures as errors', async () => {
    mockLaunchImageLibrary.mockRejectedValue(new Error('picker unavailable'));
    await expect(pickPhotoFromLibrary()).resolves.toEqual({ status: 'error' });

    mockLaunchImageLibrary.mockResolvedValue({ canceled: false, assets: [] });
    await expect(pickPhotoFromLibrary()).resolves.toEqual({ status: 'error' });
  });
});

describe('openAppSettings', () => {
  it('opens the Settings app', () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    openAppSettings();
    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });
});

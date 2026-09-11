import { pickProductPhotoFromLibrary } from '../product-photo-acquisition';

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const pickerModule = jest.requireMock('expo-image-picker') as {
  requestMediaLibraryPermissionsAsync: jest.Mock;
  launchImageLibraryAsync: jest.Mock;
};
const mockRequestMediaLibraryPermissions = pickerModule.requestMediaLibraryPermissionsAsync;
const mockLaunchImageLibrary = pickerModule.launchImageLibraryAsync;

describe('Product photo library acquisition', () => {
  beforeEach(() => {
    mockRequestMediaLibraryPermissions.mockReset();
    mockLaunchImageLibrary.mockReset();
  });

  it('requests library permission only when invoked and returns the local URI', async () => {
    mockRequestMediaLibraryPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///library/product.jpg' }],
    });

    await expect(pickProductPhotoFromLibrary()).resolves.toEqual({
      status: 'selected',
      uri: 'file:///library/product.jpg',
    });
    expect(mockRequestMediaLibraryPermissions).toHaveBeenCalledTimes(1);
    expect(mockLaunchImageLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsEditing: false,
        allowsMultipleSelection: false,
        mediaTypes: ['images'],
      }),
    );
  });

  it('treats cancellation quietly', async () => {
    mockRequestMediaLibraryPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickProductPhotoFromLibrary()).resolves.toEqual({ status: 'cancelled' });
  });

  it('returns permission and picker failures without opening the library', async () => {
    mockRequestMediaLibraryPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(pickProductPhotoFromLibrary()).resolves.toEqual({
      status: 'permission-denied',
      canAskAgain: false,
    });
    expect(mockLaunchImageLibrary).not.toHaveBeenCalled();

    mockRequestMediaLibraryPermissions.mockRejectedValue(new Error('picker unavailable'));
    await expect(pickProductPhotoFromLibrary()).resolves.toEqual({ status: 'error' });
  });
});

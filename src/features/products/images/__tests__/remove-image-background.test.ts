import { removeImageBackground } from '../remove-image-background';

jest.mock('expo', () => {
  const nativeModule = {
    isSupported: jest.fn(),
    removeBackgroundAsync: jest.fn(),
  };

  return {
    requireOptionalNativeModule: () => nativeModule,
    __nativeModule: nativeModule,
  };
});

const expoModule = jest.requireMock('expo') as {
  __nativeModule: {
    isSupported: jest.Mock;
    removeBackgroundAsync: jest.Mock;
  };
};
const mockIsSupported = expoModule.__nativeModule.isSupported;
const mockRemoveBackground = expoModule.__nativeModule.removeBackgroundAsync;

describe('removeImageBackground', () => {
  beforeEach(() => {
    mockIsSupported.mockReset();
    mockRemoveBackground.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the local transparent image from supported iOS processing', async () => {
    mockIsSupported.mockReturnValue(true);
    mockRemoveBackground.mockResolvedValue('file:///cache/product-transparent.png');

    await expect(removeImageBackground('file:///cache/product.jpg')).resolves.toBe(
      'file:///cache/product-transparent.png',
    );
  });

  it('keeps the original photo when processing fails', async () => {
    mockIsSupported.mockReturnValue(true);
    mockRemoveBackground.mockRejectedValue(new Error('No foreground subject'));

    await expect(removeImageBackground('file:///cache/product.jpg')).resolves.toBe(
      'file:///cache/product.jpg',
    );
  });

  it('keeps the original photo on Android and unsupported iOS versions', async () => {
    mockIsSupported.mockReturnValue(false);

    await expect(removeImageBackground('file:///cache/product.jpg')).resolves.toBe(
      'file:///cache/product.jpg',
    );
    expect(mockRemoveBackground).not.toHaveBeenCalled();
  });

  it('stops waiting and keeps the original photo when native processing stalls', async () => {
    jest.useFakeTimers();
    mockIsSupported.mockReturnValue(true);
    mockRemoveBackground.mockImplementation(() => new Promise(() => undefined));

    const result = removeImageBackground('file:///cache/product.jpg');
    await jest.advanceTimersByTimeAsync(8_000);
    await expect(result).resolves.toBe('file:///cache/product.jpg');
  });
});

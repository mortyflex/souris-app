import { Platform } from 'react-native';

import { pickFileBytes } from '../file-acquisition';

jest.mock('expo-file-system', () => ({ File: { pickFileAsync: jest.fn() } }));

const mockPickFile = (jest.requireMock('expo-file-system') as { File: { pickFileAsync: jest.Mock } }).File
  .pickFileAsync;

const options = { mimeTypes: ['text/csv'], maxBytes: 10 };

function pickedFile(overrides: Partial<Record<'size' | 'arrayBuffer' | 'delete', unknown>> = {}) {
  return {
    name: 'clients.csv',
    size: 3,
    arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([97, 98, 99]).buffer),
    delete: jest.fn(),
    ...overrides,
  };
}

describe('pickFileBytes', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    mockPickFile.mockReset();
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('opens the system picker for one file of the requested types and returns its bytes', async () => {
    mockPickFile.mockResolvedValue({ canceled: false, result: pickedFile() });

    await expect(pickFileBytes(options)).resolves.toEqual({
      status: 'selected',
      name: 'clients.csv',
      bytes: new Uint8Array([97, 98, 99]),
    });
    expect(mockPickFile).toHaveBeenCalledWith({ mimeTypes: ['text/csv'] });
  });

  it('reports a cancelled picker without reading anything', async () => {
    mockPickFile.mockResolvedValue({ canceled: true, result: null });

    await expect(pickFileBytes(options)).resolves.toEqual({ status: 'cancelled' });
  });

  it('refuses a file over the limit before reading it', async () => {
    const file = pickedFile({ size: 11 });
    mockPickFile.mockResolvedValue({ canceled: false, result: file });

    await expect(pickFileBytes(options)).resolves.toEqual({ status: 'too-large' });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it('refuses a file over the limit whose size was not announced', async () => {
    const file = pickedFile({ size: null, arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(11)) });
    mockPickFile.mockResolvedValue({ canceled: false, result: file });

    await expect(pickFileBytes(options)).resolves.toEqual({ status: 'too-large' });
  });

  it('reports an error when the picker or the read fails, never throwing', async () => {
    mockPickFile.mockRejectedValueOnce(new Error('picker'));
    await expect(pickFileBytes(options)).resolves.toEqual({ status: 'error' });

    mockPickFile.mockResolvedValue({
      canceled: false,
      result: pickedFile({ arrayBuffer: jest.fn().mockRejectedValue(new Error('read')) }),
    });
    await expect(pickFileBytes(options)).resolves.toEqual({ status: 'error' });
  });

  it('removes the temporary copy on iOS and never touches the document on Android', async () => {
    Platform.OS = 'ios';
    const copy = pickedFile();
    mockPickFile.mockResolvedValue({ canceled: false, result: copy });
    await pickFileBytes(options);
    expect(copy.delete).toHaveBeenCalledTimes(1);

    Platform.OS = 'android';
    const document = pickedFile();
    mockPickFile.mockResolvedValue({ canceled: false, result: document });
    await pickFileBytes(options);
    expect(document.delete).not.toHaveBeenCalled();
  });
});

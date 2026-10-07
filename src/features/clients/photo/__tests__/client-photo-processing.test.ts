// BeautIzzy — Client photo normalization (orientation, square crop, size, JPEG)

import { centeredSquareCrop, prepareClientPhoto } from '../client-photo-processing';

const mockCalls: string[] = [];
const mockRelease = jest.fn();

jest.mock('expo-image-manipulator', () => {
  const upright = { width: 3024, height: 4032, release: () => mockRelease('upright') };
  const square = {
    width: 720,
    height: 720,
    release: () => mockRelease('square'),
    saveAsync: (options: object) => {
      mockCalls.push(`save ${JSON.stringify(options)}`);
      return Promise.resolve({ uri: 'file:///app/Caches/ImageManipulator/prepared.jpg' });
    },
  };
  return {
    SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
    ImageManipulator: {
      manipulate: (source: unknown) => {
        mockCalls.push(typeof source === 'string' ? `load ${source}` : 'from upright');
        const context = {
          crop: (rect: object) => {
            mockCalls.push(`crop ${JSON.stringify(rect)}`);
            return context;
          },
          resize: (size: object) => {
            mockCalls.push(`resize ${JSON.stringify(size)}`);
            return context;
          },
          renderAsync: () => Promise.resolve(typeof source === 'string' ? upright : square),
        };
        return context;
      },
    },
  };
});

describe('centeredSquareCrop', () => {
  it('crops the centered square of a portrait capture and caps it at 720', () => {
    expect(centeredSquareCrop(3024, 4032)).toEqual({
      crop: { originX: 0, originY: 504, width: 3024, height: 3024 },
      side: 720,
    });
  });

  it('crops the centered square of a landscape photo', () => {
    expect(centeredSquareCrop(1600, 900)).toEqual({
      crop: { originX: 350, originY: 0, width: 900, height: 900 },
      side: 720,
    });
  });

  it('never upscales a small image', () => {
    expect(centeredSquareCrop(400, 500).side).toBe(400);
  });
});

describe('prepareClientPhoto', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockRelease.mockClear();
  });

  it('decodes upright, crops the centered square, resizes, and writes a compressed JPEG', async () => {
    await expect(prepareClientPhoto('file:///app/Caches/Camera/capture.jpg')).resolves.toBe(
      'file:///app/Caches/ImageManipulator/prepared.jpg',
    );
    expect(mockCalls).toEqual([
      'load file:///app/Caches/Camera/capture.jpg',
      'from upright',
      'crop {"originX":0,"originY":504,"width":3024,"height":3024}',
      'resize {"width":720,"height":720}',
      'save {"compress":0.8,"format":"jpeg"}',
    ]);
    expect(mockRelease).toHaveBeenCalledWith('upright');
    expect(mockRelease).toHaveBeenCalledWith('square');
  });
});

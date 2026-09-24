// Souris — the ONE photo normalization pipeline (Client and Product settings)

import { centeredSquareCrop, fitWithin, normalizePhoto } from '../photo-normalization';

const mockCalls: string[] = [];
let mockUpright = { width: 3024, height: 4032 };

jest.mock('expo-image-manipulator', () => ({
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
        renderAsync: () =>
          Promise.resolve({
            ...(typeof source === 'string' ? mockUpright : { width: 0, height: 0 }),
            release: () => mockCalls.push('release'),
            saveAsync: (options: object) => {
              mockCalls.push(`save ${JSON.stringify(options)}`);
              return Promise.resolve({ uri: 'file:///app/Caches/ImageManipulator/out' });
            },
          }),
      };
      return context;
    },
  },
}));

describe('photo normalization geometry', () => {
  it('fits the longest side within the bound, keeping the aspect ratio', () => {
    expect(fitWithin(3024, 4032, 1080)).toEqual({ width: 810, height: 1080 });
    expect(fitWithin(4000, 1000, 1080)).toEqual({ width: 1080, height: 270 });
  });

  it('never upscales', () => {
    expect(fitWithin(800, 600, 1080)).toBeUndefined();
    expect(centeredSquareCrop(400, 500, 720).side).toBe(400);
  });
});

describe('normalizePhoto', () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockUpright = { width: 3024, height: 4032 };
  });

  it('Product settings: upright, NO crop, bounded size, JPEG quality', async () => {
    await normalizePhoto('file:///capture.jpg', { crop: 'none', maxSide: 1080, format: 'jpeg', compress: 0.85 });
    expect(mockCalls.filter((call) => call !== 'release')).toEqual([
      'load file:///capture.jpg',
      'from upright',
      'resize {"width":810,"height":1080}',
      'save {"compress":0.85,"format":"jpeg"}',
    ]);
  });

  it('a transparent cut-out stays PNG (alpha kept)', async () => {
    mockUpright = { width: 900, height: 700 };
    await normalizePhoto('file:///cutout.png', { crop: 'none', maxSide: 1080, format: 'png', compress: 0.85 });
    expect(mockCalls.filter((call) => call !== 'release')).toEqual([
      'load file:///cutout.png',
      'from upright',
      'save {"format":"png"}',
    ]);
  });

  it('releases every native image, even when saving fails', async () => {
    mockUpright = { width: 0, height: 0 };
    await expect(
      normalizePhoto('file:///empty.jpg', { crop: 'none', maxSide: 1080, format: 'jpeg', compress: 0.85 }),
    ).rejects.toThrow('empty image');
    expect(mockCalls).toContain('release');
  });
});

// Souris — Client and Product photos through Supabase Storage (business-media bucket)

import {
  BUSINESS_MEDIA_BUCKET,
  createSupabaseBusinessMediaGateway,
  type PhotoFileIO,
  type SupabaseStorageApi,
} from '../business-media-gateway';

const PATH = '11111111-1111-4111-8111-111111111111/clients/client-lea/photo-1.jpg';

function createFakeStorage(overrides: Partial<Record<'upload' | 'createSignedUrl' | 'remove', jest.Mock>> = {}) {
  const bucketApi = {
    upload: overrides.upload ?? jest.fn(() => Promise.resolve({ data: { path: PATH }, error: null })),
    createSignedUrl:
      overrides.createSignedUrl ??
      jest.fn(() => Promise.resolve({ data: { signedUrl: 'https://storage.example/signed' }, error: null })),
    remove: overrides.remove ?? jest.fn(() => Promise.resolve({ data: [], error: null })),
  };
  const from = jest.fn(() => bucketApi);
  const client = { storage: { from } } as unknown as SupabaseStorageApi;
  return { client, from, bucketApi };
}

function createIO(): PhotoFileIO & { read: jest.Mock; download: jest.Mock } {
  return {
    read: jest.fn(() => Promise.resolve(new ArrayBuffer(8))),
    download: jest.fn(() => Promise.resolve()),
  };
}

describe('Supabase Business media gateway', () => {
  it('uploads the local JPEG as a NEW object of the business-media bucket', async () => {
    const { client, from, bucketApi } = createFakeStorage();
    const io = createIO();

    await createSupabaseBusinessMediaGateway(client, io).upload(PATH, 'file:///cache/photo.jpg');

    expect(from).toHaveBeenCalledWith(BUSINESS_MEDIA_BUCKET);
    expect(BUSINESS_MEDIA_BUCKET).toBe('business-media');
    expect(io.read).toHaveBeenCalledWith('file:///cache/photo.jpg');
    expect(bucketApi.upload).toHaveBeenCalledWith(PATH, expect.any(ArrayBuffer), {
      contentType: 'image/jpeg',
      upsert: false,
    });
  });

  it('downloads through a short-lived signed URL used once and never returned', async () => {
    const { client, bucketApi } = createFakeStorage();
    const io = createIO();

    await expect(
      createSupabaseBusinessMediaGateway(client, io).download(PATH, 'file:///cache/dl.jpg'),
    ).resolves.toBeUndefined();

    expect(bucketApi.createSignedUrl).toHaveBeenCalledWith(PATH, 60);
    expect(io.download).toHaveBeenCalledWith('https://storage.example/signed', 'file:///cache/dl.jpg');
  });

  it('removes the object', async () => {
    const { client, bucketApi } = createFakeStorage();
    await createSupabaseBusinessMediaGateway(client, createIO()).remove(PATH);
    expect(bucketApi.remove).toHaveBeenCalledWith([PATH]);
  });

  it('reduces remote errors to a plain failure: no Supabase text escapes', async () => {
    const failure = () =>
      jest.fn(() => Promise.resolve({ data: null, error: { message: 'new row violates row-level security policy' } }));
    const { client } = createFakeStorage({ upload: failure(), createSignedUrl: failure(), remove: failure() });
    const gateway = createSupabaseBusinessMediaGateway(client, createIO());

    await expect(gateway.upload(PATH, 'file:///x.jpg')).rejects.toThrow('Business media upload failed');
    await expect(gateway.download(PATH, 'file:///y.jpg')).rejects.toThrow('Business media download failed');
    await expect(gateway.remove(PATH)).rejects.toThrow('Business media remove failed');
  });

  it('uploads a cut-out Product photo as PNG, keeping its transparency', async () => {
    const { client, bucketApi } = createFakeStorage();
    const productPath = '11111111-1111-4111-8111-111111111111/products/product-1/photo-1.png';

    await createSupabaseBusinessMediaGateway(client, createIO()).upload(productPath, 'file:///cache/p.png');

    expect(bucketApi.upload).toHaveBeenCalledWith(productPath, expect.any(ArrayBuffer), {
      contentType: 'image/png',
      upsert: false,
    });
  });
});

// BeautIzzy — online booking profile through the owner RPCs and the public bucket

import { BOOKING_IMAGE_MAX_BYTES, OnlineBookingGatewayError } from '@/features/online-booking/gateway';

import {
  BUSINESS_PUBLIC_MEDIA_BUCKET,
  createSupabaseOnlineBookingGateway,
  isJpeg,
  mapOnlineBookingPostgrestError,
  toBookingProfile,
  type SupabaseOnlineBookingApi,
} from '../online-booking-gateway';

const BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
const MEDIA_ID = '22222222-2222-4222-8222-222222222222';
const OBJECT_ID = '33333333-3333-4333-8333-333333333333';
const LOGO_PATH = `${MEDIA_ID}/logo/${OBJECT_ID}.jpg`;

const serverProfile = {
  slug: 'chez-amelie',
  business_name: 'Salon Amélie',
  public_name: 'Chez Amélie',
  description: null,
  public_phone: '06 00 00 00 00',
  public_email: null,
  address: null,
  logo_path: LOGO_PATH,
  cover_path: null,
  media_id: MEDIA_ID,
  time_zone: 'Europe/Paris',
  published: true,
  booking_enabled: false,
  publication_open: true,
  plus_access: true,
};

function jpeg(byteLength = 16): ArrayBuffer {
  const bytes = new Uint8Array(byteLength);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes.buffer;
}

function createClient(rpcAnswer: { data: unknown; error: unknown } = { data: serverProfile, error: null }) {
  const bucketApi = {
    upload: jest.fn(() => Promise.resolve({ data: { path: LOGO_PATH }, error: null as unknown })),
    remove: jest.fn(() => Promise.resolve({ data: [], error: null as unknown })),
    getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://project.example/public/${path}` } })),
  };
  const rpc = jest.fn(() => Promise.resolve(rpcAnswer));
  const from = jest.fn(() => bucketApi);
  const client = { rpc, storage: { from } } as unknown as SupabaseOnlineBookingApi;
  const io = { read: jest.fn(() => Promise.resolve(jpeg())) };
  const gateway = createSupabaseOnlineBookingGateway(client, io, () => OBJECT_ID);
  return { gateway, rpc, from, bucketApi, io };
}

describe('Supabase online booking gateway', () => {
  it('reads the owner profile through the owner RPC only', async () => {
    const { gateway, rpc } = createClient();

    await expect(gateway.readProfile(BUSINESS_ID)).resolves.toEqual({
      slug: 'chez-amelie',
      businessName: 'Salon Amélie',
      publicName: 'Chez Amélie',
      publicPhone: '06 00 00 00 00',
      logoPath: LOGO_PATH,
      mediaId: MEDIA_ID,
      timeZone: 'Europe/Paris',
      published: true,
      bookingEnabled: false,
      publicationOpen: true,
      plusAccess: true,
    });
    expect(rpc).toHaveBeenCalledWith('online_booking_read_profile', { p_business_id: BUSINESS_ID });
  });

  it('never calls the website read, which is service_role only', async () => {
    const { gateway, rpc } = createClient({ data: { status: 'UPDATED', ...serverProfile }, error: null });
    await gateway.readProfile(BUSINESS_ID);
    await gateway.updateProfile(BUSINESS_ID, {});
    await gateway.setState(BUSINESS_ID, { published: false, bookingEnabled: false });
    expect(rpc.mock.calls.map((call) => (call as unknown[])[0])).toEqual([
      'online_booking_read_profile',
      'online_booking_update_profile',
      'online_booking_set_state',
    ]);
  });

  it('sends every draft field, an absent one as null (it clears the stored value)', async () => {
    const { gateway, rpc } = createClient({ data: { status: 'UPDATED', ...serverProfile }, error: null });

    const result = await gateway.updateProfile(BUSINESS_ID, { slug: 'chez-amelie', logoPath: LOGO_PATH });

    expect(result.status).toBe('UPDATED');
    expect(rpc).toHaveBeenCalledWith('online_booking_update_profile', {
      p_business_id: BUSINESS_ID,
      p_slug: 'chez-amelie',
      p_public_name: null,
      p_description: null,
      p_public_phone: null,
      p_public_email: null,
      p_address: null,
      p_logo_path: LOGO_PATH,
      p_cover_path: null,
    });
  });

  it.each([
    [{ status: 'INVALID_SLUG' }, { status: 'INVALID_SLUG' }],
    [{ status: 'SLUG_UNAVAILABLE' }, { status: 'SLUG_UNAVAILABLE' }],
    [{ status: 'INVALID_VALUE', field: 'public_email' }, { status: 'INVALID_VALUE', field: 'public_email' }],
    [{ status: 'INVALID_VALUE', field: 'something_new' }, { status: 'INVALID_VALUE' }],
  ])('returns the update refusal %j', async (answer, expected) => {
    const { gateway } = createClient({ data: answer, error: null });
    await expect(gateway.updateProfile(BUSINESS_ID, {})).resolves.toEqual(expected);
  });

  it.each(['INCOMPLETE_PROFILE', 'PUBLICATION_UNAVAILABLE', 'ENTITLEMENT_REQUIRED'] as const)(
    'returns the publication refusal %s',
    async (status) => {
      const { gateway, rpc } = createClient({ data: { status }, error: null });
      await expect(gateway.setState(BUSINESS_ID, { published: true, bookingEnabled: false })).resolves.toEqual({
        status,
      });
      expect(rpc).toHaveBeenCalledWith('online_booking_set_state', {
        p_business_id: BUSINESS_ID,
        p_published: true,
        p_booking_enabled: false,
      });
    },
  );

  it('rejects an answer it does not understand instead of guessing', async () => {
    const { gateway } = createClient({ data: { status: 'SOMETHING_ELSE' }, error: null });
    await expect(gateway.updateProfile(BUSINESS_ID, {})).rejects.toMatchObject({ code: 'UNKNOWN' });
    await expect(gateway.setState(BUSINESS_ID, { published: true, bookingEnabled: true })).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('fails closed on a profile answer without the publication facts', () => {
    const { publication_open: _open, plus_access: _plus, ...partial } = serverProfile;
    expect(toBookingProfile(partial)).toMatchObject({ publicationOpen: false, plusAccess: false });
    expect(() => toBookingProfile({ ...serverProfile, media_id: 'not-a-uuid' })).toThrow(OnlineBookingGatewayError);
    expect(() => toBookingProfile({ ...serverProfile, published: 'yes' })).toThrow(OnlineBookingGatewayError);
    expect(() => toBookingProfile(null)).toThrow(OnlineBookingGatewayError);
  });

  it('maps server errors to stable codes', () => {
    expect(mapOnlineBookingPostgrestError({ code: '', message: 'TypeError: Network request failed' }).code).toBe('NETWORK');
    expect(mapOnlineBookingPostgrestError({ code: '42501', message: 'not the owner' }).code).toBe('FORBIDDEN');
    expect(mapOnlineBookingPostgrestError({ code: 'PGRST202', message: 'function not found' }).code).toBe('UNKNOWN');
  });

  it('surfaces an unauthorized update as FORBIDDEN', async () => {
    const { gateway } = createClient({ data: null, error: { code: '42501', message: 'online booking: not the owner of this Business' } });
    await expect(gateway.updateProfile(BUSINESS_ID, { slug: 'pirate' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Supabase online booking gateway — public images', () => {
  it('uploads a JPEG as a NEW object of the PUBLIC bucket, inside the profile media folder', async () => {
    const { gateway, from, bucketApi, io } = createClient();

    await expect(gateway.uploadImage(MEDIA_ID, 'logo', 'file:///cache/logo.jpg')).resolves.toBe(LOGO_PATH);

    expect(BUSINESS_PUBLIC_MEDIA_BUCKET).toBe('business-public-media');
    expect(from).toHaveBeenCalledWith('business-public-media');
    expect(from).not.toHaveBeenCalledWith('business-media');
    expect(io.read).toHaveBeenCalledWith('file:///cache/logo.jpg');
    expect(bucketApi.upload).toHaveBeenCalledWith(LOGO_PATH, expect.any(ArrayBuffer), {
      contentType: 'image/jpeg',
      upsert: false,
    });
  });

  it('refuses a file that is not a JPEG before sending anything', async () => {
    const { gateway, bucketApi, io } = createClient();
    io.read.mockResolvedValueOnce(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer);

    await expect(gateway.uploadImage(MEDIA_ID, 'cover', 'file:///cache/cover.png')).rejects.toMatchObject({
      code: 'IMAGE_INVALID',
    });
    expect(bucketApi.upload).not.toHaveBeenCalled();
    expect(isJpeg(new ArrayBuffer(0))).toBe(false);
  });

  it('refuses an image above the 2 MB limit before sending anything', async () => {
    const { gateway, bucketApi, io } = createClient();
    expect(BOOKING_IMAGE_MAX_BYTES).toBe(2 * 1024 * 1024);
    io.read.mockResolvedValueOnce(jpeg(BOOKING_IMAGE_MAX_BYTES + 1));

    await expect(gateway.uploadImage(MEDIA_ID, 'cover', 'file:///cache/cover.jpg')).rejects.toMatchObject({
      code: 'IMAGE_TOO_LARGE',
    });
    expect(bucketApi.upload).not.toHaveBeenCalled();

    io.read.mockResolvedValueOnce(jpeg(BOOKING_IMAGE_MAX_BYTES));
    await expect(gateway.uploadImage(MEDIA_ID, 'cover', 'file:///cache/cover.jpg')).resolves.toMatch(/\/cover\//);
  });

  it('never builds a path outside a profile media folder', async () => {
    const { gateway, bucketApi } = createClient();
    await expect(gateway.uploadImage('../business-media', 'logo', 'file:///x.jpg')).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
    await expect(gateway.removeImage(`${BUSINESS_ID}/clients/client-lea/photo.jpg`)).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
    expect(bucketApi.upload).not.toHaveBeenCalled();
    expect(bucketApi.remove).not.toHaveBeenCalled();
  });

  it('reduces a refused upload to a plain failure', async () => {
    const { gateway, bucketApi } = createClient();
    bucketApi.upload.mockResolvedValueOnce({ data: null as never, error: { message: 'new row violates row-level security policy' } });
    const failure = await gateway.uploadImage(MEDIA_ID, 'logo', 'file:///cache/logo.jpg').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(OnlineBookingGatewayError);
    expect((failure as Error).message).not.toMatch(/row-level/);
  });

  it('removes a replaced object and exposes the public URL of a stored one', async () => {
    const { gateway, bucketApi } = createClient();
    await gateway.removeImage(LOGO_PATH);
    expect(bucketApi.remove).toHaveBeenCalledWith([LOGO_PATH]);
    expect(gateway.imageUrl(LOGO_PATH)).toBe(`https://project.example/public/${LOGO_PATH}`);
  });
});

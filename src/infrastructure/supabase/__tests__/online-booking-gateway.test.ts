// BeautIzzy — online booking profile through the owner RPCs and the public bucket

import { BOOKING_IMAGE_MAX_BYTES, OnlineBookingGatewayError } from '@/features/online-booking/gateway';

import {
  BUSINESS_PUBLIC_MEDIA_BUCKET,
  createSupabaseOnlineBookingGateway,
  isJpeg,
  mapOnlineBookingPostgrestError,
  toBookingProfile,
  toServicePublication,
  toWorkingHours,
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

describe('Supabase online booking gateway — working hours', () => {
  const closed = (weekday: number) => ({ weekday, is_open: false, intervals: [] });
  const serverWeek = {
    time_zone: 'Europe/Paris',
    days: [
      {
        weekday: 1,
        is_open: true,
        intervals: [
          { start_minute: 540, end_minute: 720 },
          { start_minute: 840, end_minute: 1140 },
        ],
      },
      ...[2, 3, 4, 5, 6, 7].map(closed),
    ],
  };

  it('reads the week through the owner RPC only, Monday first', async () => {
    const { gateway, rpc } = createClient({ data: serverWeek, error: null });

    const hours = await gateway.readWorkingHours(BUSINESS_ID);

    expect(rpc).toHaveBeenCalledWith('online_booking_read_working_hours', { p_business_id: BUSINESS_ID });
    expect(hours.timeZone).toBe('Europe/Paris');
    expect(hours.days.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(hours.days[0]).toEqual({
      weekday: 1,
      isOpen: true,
      intervals: [
        { startMinute: 540, endMinute: 720 },
        { startMinute: 840, endMinute: 1140 },
      ],
    });
    expect(hours.days[1]).toEqual({ weekday: 2, isOpen: false, intervals: [] });
  });

  it('sends one day in its saved form: ascending, and no interval when closed', async () => {
    const { gateway, rpc } = createClient({ data: { status: 'UPDATED', ...serverWeek }, error: null });

    await gateway.saveWorkingDay(BUSINESS_ID, {
      weekday: 1,
      isOpen: true,
      intervals: [
        { startMinute: 840, endMinute: 1140 },
        { startMinute: 540, endMinute: 720 },
      ],
    });
    await gateway.saveWorkingDay(BUSINESS_ID, {
      weekday: 2,
      isOpen: false,
      intervals: [{ startMinute: 540, endMinute: 720 }],
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'online_booking_save_working_day', {
      p_business_id: BUSINESS_ID,
      p_weekday: 1,
      p_is_open: true,
      p_intervals: [
        { start_minute: 540, end_minute: 720 },
        { start_minute: 840, end_minute: 1140 },
      ],
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'online_booking_save_working_day', {
      p_business_id: BUSINESS_ID,
      p_weekday: 2,
      p_is_open: false,
      p_intervals: [],
    });
  });

  it('returns the stored week after a save', async () => {
    const { gateway } = createClient({ data: { status: 'UPDATED', ...serverWeek }, error: null });
    const result = await gateway.saveWorkingDay(BUSINESS_ID, { weekday: 2, isOpen: false, intervals: [] });
    expect(result.status).toBe('UPDATED');
    expect(result.status === 'UPDATED' && result.workingHours.days).toHaveLength(7);
  });

  it.each([
    [{ status: 'INVALID_DAY', reason: 'OVERLAP' }, { status: 'INVALID_DAY', reason: 'OVERLAP' }],
    [{ status: 'INVALID_DAY', reason: 'INTERVAL_REQUIRED' }, { status: 'INVALID_DAY', reason: 'INTERVAL_REQUIRED' }],
    [{ status: 'INVALID_DAY', reason: 'SOMETHING_NEW' }, { status: 'INVALID_DAY' }],
  ])('returns the refusal %j and nothing else', async (answer, expected) => {
    const { gateway } = createClient({ data: answer, error: null });
    await expect(
      gateway.saveWorkingDay(BUSINESS_ID, { weekday: 3, isOpen: true, intervals: [{ startMinute: 540, endMinute: 720 }] }),
    ).resolves.toEqual(expected);
  });

  it.each([
    ['a week of six days', { ...serverWeek, days: serverWeek.days.slice(0, 6) }],
    ['days out of order', { ...serverWeek, days: [closed(2), closed(1), ...[3, 4, 5, 6, 7].map(closed)] }],
    ['no time zone', { days: serverWeek.days }],
    ['a fractional minute', { ...serverWeek, days: [{ weekday: 1, is_open: true, intervals: [{ start_minute: 540.5, end_minute: 720 }] }, ...[2, 3, 4, 5, 6, 7].map(closed)] }],
    ['an end before its start', { ...serverWeek, days: [{ weekday: 1, is_open: true, intervals: [{ start_minute: 720, end_minute: 540 }] }, ...[2, 3, 4, 5, 6, 7].map(closed)] }],
    ['a minute after midnight', { ...serverWeek, days: [{ weekday: 1, is_open: true, intervals: [{ start_minute: 540, end_minute: 1441 }] }, ...[2, 3, 4, 5, 6, 7].map(closed)] }],
    ['a missing open state', { ...serverWeek, days: [{ weekday: 1, intervals: [] }, ...[2, 3, 4, 5, 6, 7].map(closed)] }],
  ])('rejects %s instead of guessing', (_label, answer) => {
    expect(() => toWorkingHours(answer)).toThrow(OnlineBookingGatewayError);
  });

  it('rejects a save answer it does not understand', async () => {
    const { gateway } = createClient({ data: { status: 'SOMETHING_ELSE' }, error: null });
    await expect(gateway.saveWorkingDay(BUSINESS_ID, { weekday: 1, isOpen: false, intervals: [] })).rejects.toMatchObject({
      code: 'UNKNOWN',
    });
  });

  it('surfaces offline and unauthorized calls as stable codes', async () => {
    const offline = createClient({ data: null, error: { code: '', message: 'TypeError: Network request failed' } });
    await expect(offline.gateway.readWorkingHours(BUSINESS_ID)).rejects.toMatchObject({ code: 'NETWORK' });
    const stranger = createClient({ data: null, error: { code: '42501', message: 'online booking: not the owner of this Business' } });
    await expect(
      stranger.gateway.saveWorkingDay(BUSINESS_ID, { weekday: 1, isOpen: false, intervals: [] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Supabase online booking gateway — services offered online', () => {
  const service = (overrides: Record<string, unknown> = {}) => ({
    id: 'svc-coupe',
    name: 'Coupe',
    type: 'SERVICE',
    active: true,
    price_cents: 4500,
    duration_minutes: 45,
    description: 'Shampooing inclus.\nSéchage naturel.',
    category: { id: 'cat-coupes', name: 'Coupes', position: 1 },
    selected: true,
    eligible: true,
    ineligible_reason: null,
    bookable: true,
    ...overrides,
  });
  const view = (services: readonly Record<string, unknown>[] = [service()]) => ({
    max_service_minutes: 720,
    selected_count: services.filter((row) => row.selected === true).length,
    bookable_count: services.filter((row) => row.bookable === true).length,
    services,
  });

  it('reads the owner view through ONE owner RPC and keeps the server values', async () => {
    const { gateway, rpc } = createClient({
      data: view([
        service(),
        service({
          id: 'svc-off',
          name: 'Soin',
          type: 'TECHNIQUE',
          active: false,
          price_cents: 0,
          description: null,
          category: null,
          selected: true,
          eligible: false,
          ineligible_reason: 'INACTIVE',
          bookable: false,
        }),
      ]),
      error: null,
    });

    const publication = await gateway.readServicePublication(BUSINESS_ID);

    expect(rpc).toHaveBeenCalledWith('online_booking_read_service_publication', { p_business_id: BUSINESS_ID });
    expect(publication).toEqual({
      maxServiceMinutes: 720,
      selectedCount: 2,
      bookableCount: 1,
      services: [
        {
          id: 'svc-coupe',
          name: 'Coupe',
          type: 'SERVICE',
          active: true,
          priceCents: 4500,
          durationMinutes: 45,
          description: 'Shampooing inclus.\nSéchage naturel.',
          category: { id: 'cat-coupes', name: 'Coupes', position: 1 },
          selected: true,
          eligible: true,
          bookable: true,
        },
        {
          id: 'svc-off',
          name: 'Soin',
          type: 'TECHNIQUE',
          active: false,
          // A price of 0 stays 0: never dropped, never read as free.
          priceCents: 0,
          durationMinutes: 45,
          selected: true,
          eligible: false,
          ineligibleReason: 'INACTIVE',
          bookable: false,
        },
      ],
    });
  });

  it.each([
    ['bookable without being selected', [service({ selected: false, bookable: true })]],
    ['bookable while not eligible', [service({ eligible: false, ineligible_reason: 'INACTIVE', bookable: true })]],
    ['a negative price', [service({ price_cents: -1 })]],
    ['a decimal price', [service({ price_cents: 45.5 })]],
    ['an unknown type', [service({ type: 'PACKAGE' })]],
    ['a missing switch value', [service({ selected: undefined })]],
    ['a description that is not text', [service({ description: 42 })]],
    ['a malformed category', [service({ category: { id: 'cat', name: 'X' } })]],
    ['a duplicated service', [service(), service()]],
    ['an empty id', [service({ id: '' })]],
  ])('fails closed on %s', (_label, services) => {
    expect(() => toServicePublication(view(services))).toThrow(OnlineBookingGatewayError);
  });

  it('fails closed when the counts do not add up', () => {
    expect(() => toServicePublication({ ...view(), selected_count: 3 })).toThrow(OnlineBookingGatewayError);
    expect(() => toServicePublication({ ...view(), bookable_count: 0 })).toThrow(OnlineBookingGatewayError);
    expect(() => toServicePublication({ ...view(), services: 'none' })).toThrow(OnlineBookingGatewayError);
  });

  it('reads a reason this build does not know as « not eligible », without one', () => {
    const publication = toServicePublication(
      view([service({ selected: false, eligible: false, ineligible_reason: 'SOMETHING_NEW', bookable: false })]),
    );
    expect(publication.services[0]).toMatchObject({ eligible: false, bookable: false });
    expect(publication.services[0]!.ineligibleReason).toBeUndefined();
  });

  it('sends the ids once each, with the choice, and answers the new view', async () => {
    const { gateway, rpc } = createClient({ data: { status: 'UPDATED', ...view() }, error: null });

    const result = await gateway.setServicePublication(BUSINESS_ID, ['svc-coupe', 'svc-coupe', 'svc-soin'], true);

    expect(rpc).toHaveBeenCalledWith('online_booking_set_service_publication', {
      p_business_id: BUSINESS_ID,
      p_service_ids: ['svc-coupe', 'svc-soin'],
      p_selected: true,
    });
    expect(result).toMatchObject({ status: 'UPDATED', publication: { bookableCount: 1 } });
  });

  it('answers the two refusals with the service they name', async () => {
    const unknown = createClient({ data: { status: 'UNKNOWN_SERVICE', service_id: 'svc-gone' }, error: null });
    await expect(unknown.gateway.setServicePublication(BUSINESS_ID, ['svc-gone'], true)).resolves.toEqual({
      status: 'UNKNOWN_SERVICE',
      serviceId: 'svc-gone',
    });
    const refused = createClient({
      data: { status: 'NOT_ELIGIBLE', service_id: 'svc-off', reason: 'INACTIVE' },
      error: null,
    });
    await expect(refused.gateway.setServicePublication(BUSINESS_ID, ['svc-off'], true)).resolves.toEqual({
      status: 'NOT_ELIGIBLE',
      serviceId: 'svc-off',
      reason: 'INACTIVE',
    });
  });

  it.each([
    ['no id', []],
    ['an empty id', ['']],
    ['an id of 201 characters', ['x'.repeat(201)]],
    ['201 ids', Array.from({ length: 201 }, (_, index) => `svc-${index}`)],
  ])('never sends %s', async (_label, ids) => {
    const { gateway, rpc } = createClient();
    await expect(gateway.setServicePublication(BUSINESS_ID, ids, true)).rejects.toMatchObject({ code: 'UNKNOWN' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reads a project without the migration as UNAVAILABLE, and keeps the other failures', async () => {
    for (const code of ['PGRST202', '42883']) {
      const missing = createClient({ data: null, error: { code, message: 'Could not find the function' } });
      await expect(missing.gateway.readServicePublication(BUSINESS_ID)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      await expect(missing.gateway.setServicePublication(BUSINESS_ID, ['svc'], true)).rejects.toMatchObject({
        code: 'UNAVAILABLE',
      });
    }
    const offline = createClient({ data: null, error: { code: '', message: 'TypeError: Network request failed' } });
    await expect(offline.gateway.readServicePublication(BUSINESS_ID)).rejects.toMatchObject({ code: 'NETWORK' });
    const foreign = createClient({ data: null, error: { code: '42501', message: 'not the owner' } });
    await expect(foreign.gateway.setServicePublication(BUSINESS_ID, ['svc'], false)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    // The profile calls keep their own mapping: PGRST202 is not « unavailable » there.
    const profile = createClient({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    await expect(profile.gateway.readProfile(BUSINESS_ID)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });

  it('refuses an answer it does not understand', async () => {
    const { gateway } = createClient({ data: { status: 'MAYBE' }, error: null });
    await expect(gateway.setServicePublication(BUSINESS_ID, ['svc'], true)).rejects.toMatchObject({ code: 'UNKNOWN' });
    const noId = createClient({ data: { status: 'NOT_ELIGIBLE', reason: 'INACTIVE' }, error: null });
    await expect(noId.gateway.setServicePublication(BUSINESS_ID, ['svc'], true)).rejects.toMatchObject({ code: 'UNKNOWN' });
  });
});

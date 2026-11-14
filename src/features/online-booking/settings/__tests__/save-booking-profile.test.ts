// BeautIzzy — saving a booking profile draft with its images

import type { BookingProfileFields } from '@/domain/online-booking';

import { createFakeOnlineBookingGateway, FAKE_MEDIA_ID } from '../../testing/fake-online-booking-gateway';
import { saveBookingProfile, UNCHANGED_BOOKING_IMAGES } from '../save-booking-profile';

const BUSINESS_ID = 'business-1';
const OLD_LOGO = `${FAKE_MEDIA_ID}/logo/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg`;
const OLD_COVER = `${FAKE_MEDIA_ID}/cover/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.jpg`;

const fields: BookingProfileFields = {
  slug: 'chez-amelie',
  publicName: '  Chez Amélie ',
  description: '',
  publicPhone: '',
  publicEmail: '',
  address: '',
};

async function setup() {
  const gateway = createFakeOnlineBookingGateway();
  gateway.seedProfile(BUSINESS_ID, { logoPath: OLD_LOGO, coverPath: OLD_COVER });
  gateway.objects.add(OLD_LOGO).add(OLD_COVER);
  return { gateway, profile: await gateway.readProfile(BUSINESS_ID) };
}

describe('saveBookingProfile', () => {
  it('sends trimmed fields, blank ones as absent, and keeps the stored images', async () => {
    const { gateway, profile } = await setup();

    const result = await saveBookingProfile(gateway, BUSINESS_ID, profile, fields, UNCHANGED_BOOKING_IMAGES);

    expect(result.status).toBe('UPDATED');
    expect(gateway.updates).toEqual([
      {
        slug: 'chez-amelie',
        publicName: 'Chez Amélie',
        description: undefined,
        publicPhone: undefined,
        publicEmail: undefined,
        address: undefined,
        logoPath: OLD_LOGO,
        coverPath: OLD_COVER,
      },
    ]);
    expect(gateway.calls.upload).toBe(0);
    expect(gateway.calls.remove).toBe(0);
  });

  it('replaces an image: uploads the new object, then deletes the old one', async () => {
    const { gateway, profile } = await setup();

    const result = await saveBookingProfile(gateway, BUSINESS_ID, profile, fields, {
      logo: { kind: 'picked', uri: 'file:///cache/logo.jpg' },
      cover: { kind: 'stored' },
    });

    expect(result.status === 'UPDATED' && result.profile.logoPath).toMatch(/\/logo\//);
    expect(result.status === 'UPDATED' && result.profile.logoPath).not.toBe(OLD_LOGO);
    expect(gateway.objects.has(OLD_LOGO)).toBe(false);
    expect(gateway.objects.has(OLD_COVER)).toBe(true);
    expect(gateway.objects.size).toBe(2);
  });

  it('removes an image: clears the path and deletes the object', async () => {
    const { gateway, profile } = await setup();

    const result = await saveBookingProfile(gateway, BUSINESS_ID, profile, fields, {
      logo: { kind: 'stored' },
      cover: { kind: 'removed' },
    });

    expect(result.status === 'UPDATED' && result.profile.coverPath).toBeUndefined();
    expect(gateway.objects.has(OLD_COVER)).toBe(false);
    expect(gateway.objects.has(OLD_LOGO)).toBe(true);
  });

  it('a refused update deletes the images uploaded for it and keeps the stored ones', async () => {
    const { gateway, profile } = await setup();
    gateway.takenSlugs.add('chez-amelie');

    const result = await saveBookingProfile(gateway, BUSINESS_ID, profile, fields, {
      logo: { kind: 'picked', uri: 'file:///cache/logo.jpg' },
      cover: { kind: 'picked', uri: 'file:///cache/cover.jpg' },
    });

    expect(result).toEqual({ status: 'SLUG_UNAVAILABLE' });
    expect([...gateway.objects].sort()).toEqual([OLD_COVER, OLD_LOGO].sort());
    expect((await gateway.readProfile(BUSINESS_ID)).logoPath).toBe(OLD_LOGO);
  });

  it('a failed upload stops before the profile is written', async () => {
    const { gateway, profile } = await setup();
    gateway.failNext('IMAGE_TOO_LARGE');

    await expect(
      saveBookingProfile(gateway, BUSINESS_ID, profile, fields, {
        logo: { kind: 'picked', uri: 'file:///cache/logo.jpg' },
        cover: { kind: 'stored' },
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
    expect(gateway.calls.update).toBe(0);
    expect(gateway.objects.size).toBe(2);
  });

  it('a network failure during the update leaves no orphan upload and rethrows', async () => {
    const { gateway, profile } = await setup();
    const update = jest.spyOn(gateway, 'updateProfile').mockRejectedValueOnce(new Error('offline'));

    await expect(
      saveBookingProfile(gateway, BUSINESS_ID, profile, fields, {
        logo: { kind: 'picked', uri: 'file:///cache/logo.jpg' },
        cover: { kind: 'stored' },
      }),
    ).rejects.toThrow('offline');
    expect(update).toHaveBeenCalledTimes(1);
    expect([...gateway.objects].sort()).toEqual([OLD_COVER, OLD_LOGO].sort());
  });

  it('a failed cleanup never fails a successful save', async () => {
    const { gateway, profile } = await setup();
    jest.spyOn(gateway, 'removeImage').mockRejectedValue(new Error('offline'));

    const result = await saveBookingProfile(gateway, BUSINESS_ID, profile, fields, {
      logo: { kind: 'removed' },
      cover: { kind: 'stored' },
    });
    expect(result.status).toBe('UPDATED');
  });
});
